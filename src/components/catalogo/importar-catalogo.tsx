"use client";

import { CheckCircle2, FileSpreadsheet, Loader2, Sparkles, TriangleAlert } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Aviso, Badge, Button, Card, CardContent, Checkbox, Input, Label, Select } from "@/components/ui";
import { ETIQUETA_UNIDAD, UNIDADES_COSTO, type UnidadCosto } from "@/lib/catalogo/constantes";
import { formatoMoneda } from "@/lib/formato";
import type { PropuestaImportacion, RenglonPropuesto } from "@/lib/servicios/importacion-catalogo";
import { cn, llamarApi } from "@/lib/utils";

export type InsumoOpcion = { id: string; nombre: string; categoria: string };

const NUEVO = "nuevo";
const TAMANO_MAXIMO = 4 * 1024 * 1024;

type Decision = {
  seleccionado: boolean;
  destino: string; // id del insumo o NUEVO
  unidad: UnidadCosto | "";
  nombre: string;
  categoria: string;
};

function decisionInicial(r: RenglonPropuesto): Decision {
  return {
    seleccionado: r.accionSugerida !== "ignorar",
    destino: r.coincidencia?.insumoId ?? NUEVO,
    unidad: r.unidad ?? r.coincidencia?.unidadActual ?? "",
    nombre: r.nombre,
    categoria: r.coincidencia?.categoria ?? (r.origen.seccion || "Importado"),
  };
}

const porcentaje = (n: number) => `${n > 0 ? "+" : ""}${(n * 100).toFixed(1)}%`;

export function ImportarCatalogo({ insumos }: { insumos: InsumoOpcion[] }) {
  const router = useRouter();
  const [archivo, setArchivo] = useState<File | null>(null);
  const [analizando, setAnalizando] = useState(false);
  const [aplicando, setAplicando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<string | null>(null);
  const [propuesta, setPropuesta] = useState<PropuestaImportacion | null>(null);
  const [decisiones, setDecisiones] = useState<Decision[]>([]);
  const [soloSeleccionados, setSoloSeleccionados] = useState(false);

  async function analizar() {
    if (!archivo) return;
    setError(null);
    setResultado(null);
    setPropuesta(null);
    if (archivo.size > TAMANO_MAXIMO) {
      setError("El archivo pesa más de 4 MB. Divídelo o quita las hojas que no sean de costos.");
      return;
    }
    setAnalizando(true);
    try {
      const formulario = new FormData();
      formulario.append("archivo", archivo);
      const respuesta = await fetch("/api/catalogo/importar", {
        method: "POST",
        headers: { "x-cotizador": "1" },
        body: formulario,
      });
      const datos = await respuesta.json().catch(() => ({}));
      if (!respuesta.ok) throw new Error(datos.error ?? "No se pudo analizar el archivo.");
      const leida = datos as PropuestaImportacion;
      setPropuesta(leida);
      setDecisiones(leida.renglones.map(decisionInicial));
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo analizar el archivo.");
    } finally {
      setAnalizando(false);
    }
  }

  const editar = (i: number, cambios: Partial<Decision>) =>
    setDecisiones((ds) => ds.map((d, k) => (k === i ? { ...d, ...cambios } : d)));

  const resumen = useMemo(() => {
    const elegidos = decisiones.filter((d) => d.seleccionado);
    return {
      actualizar: elegidos.filter((d) => d.destino !== NUEVO).length,
      crear: elegidos.filter((d) => d.destino === NUEVO).length,
      sinUnidad: elegidos.filter((d) => !d.unidad).length,
    };
  }, [decisiones]);

  async function aplicar() {
    if (!propuesta) return;
    setError(null);
    setAplicando(true);
    try {
      const cambios: Record<string, string>[] = [];
      propuesta.renglones.forEach((r, i) => {
        const d = decisiones[i];
        if (!d.seleccionado) return;
        const comunes = { costo: r.costo, unidadCosto: d.unidad, anchoUtilM: r.anchoUtilM ?? "", clave: r.clave };
        cambios.push(
          d.destino === NUEVO
            ? { accion: "crear", nombre: d.nombre, categoria: d.categoria, ...comunes }
            : { accion: "actualizar", insumoId: d.destino, ...comunes },
        );
      });
      const hecho = await llamarApi<{ actualizados: number; creados: number }>("/api/catalogo/importar/aplicar", "POST", {
        archivo: propuesta.archivo,
        cambios,
      });
      setResultado(
        `Listo: ${hecho.actualizados} insumo(s) actualizado(s) y ${hecho.creados} nuevo(s). La próxima vez que subas este formato, los renglones confirmados se reconocerán solos.`,
      );
      setPropuesta(null);
      setArchivo(null);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudieron aplicar los cambios.");
    } finally {
      setAplicando(false);
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="space-y-4 pt-6">
          <div>
            <h2 className="flex items-center gap-2 font-medium">
              <Sparkles className="size-4 text-accent" /> Importar costos desde un archivo
            </h2>
            <p className="text-sm text-muted-foreground">
              Sube el Excel de costos de Diseñarte (el formato de “Actualización de costos”) o la lista de un
              proveedor en Excel, PDF o foto. La IA identifica los materiales y su costo sin IVA; tú revisas la
              propuesta y nada cambia en el catálogo hasta que presionas “Aplicar”.
            </p>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-64 flex-1 space-y-2">
              <Label htmlFor="archivo-costos">Archivo (máximo 4 MB)</Label>
              <Input
                id="archivo-costos"
                type="file"
                accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/pdf,image/*"
                onChange={(e) => {
                  setArchivo(e.target.files?.[0] ?? null);
                  setPropuesta(null);
                  setResultado(null);
                }}
              />
            </div>
            <Button type="button" onClick={analizar} disabled={!archivo || analizando}>
              {analizando ? <Loader2 className="animate-spin" /> : <FileSpreadsheet />}
              {analizando ? "Analizando… (hasta un minuto)" : "Analizar archivo"}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            En Excel, cada precio se comprueba contra su celda: si la IA propone un número que no está en la fila, se
            descarta. Los PDF y las fotos no se pueden comprobar así: revisa esos precios contra el documento.
          </p>
        </CardContent>
      </Card>

      {error && <Aviso tipo="error">{error}</Aviso>}
      {resultado && (
        <Aviso tipo="ok">
          <CheckCircle2 className="mr-1 inline size-4" /> {resultado}
        </Aviso>
      )}

      {propuesta && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-medium">Revisión: {propuesta.archivo}</h2>
              <p className="text-sm text-muted-foreground">
                {propuesta.renglones.length} renglones encontrados. Marca los que quieres aplicar; puedes cambiar el
                insumo con el que se relaciona cada uno o crearlo como nuevo.
              </p>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={soloSeleccionados} onChange={(e) => setSoloSeleccionados(e.target.checked)} />
              Ver solo los marcados
            </label>
          </div>

          {propuesta.notas.length > 0 && (
            <div className="rounded-md bg-muted p-3 text-sm">
              <p className="font-medium">Notas de la IA</p>
              <ul className="mt-1 list-disc space-y-0.5 pl-5 text-muted-foreground">
                {propuesta.notas.map((n, i) => (
                  <li key={i}>{n}</li>
                ))}
              </ul>
            </div>
          )}

          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 font-medium">Aplicar</th>
                    <th className="px-3 py-2 font-medium">Del archivo</th>
                    <th className="px-3 py-2 font-medium">En el catálogo</th>
                    <th className="px-3 py-2 text-right font-medium">Costo actual → nuevo</th>
                    <th className="px-3 py-2 font-medium">Unidad</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {propuesta.renglones.map((r, i) => {
                    const d = decisiones[i];
                    if (!d || (soloSeleccionados && !d.seleccionado)) return null;
                    const actual = d.destino !== NUEVO && d.destino === r.coincidencia?.insumoId ? r.coincidencia : null;
                    return (
                      <tr key={r.id} className={cn("align-top", !d.seleccionado && "opacity-60")}>
                        <td className="px-3 py-3">
                          <Checkbox
                            checked={d.seleccionado}
                            onChange={(e) => editar(i, { seleccionado: e.target.checked })}
                            aria-label={`Aplicar ${r.nombre}`}
                          />
                        </td>
                        <td className="max-w-72 px-3 py-3">
                          <p className="font-medium">{r.nombre}</p>
                          <p className="text-xs text-muted-foreground">
                            {r.verificado
                              ? `${r.origen.hoja} · fila ${r.origen.fila} · col. ${r.origen.columna}${r.origen.encabezado ? ` (${r.origen.encabezado})` : ""}`
                              : `Documento${r.origen.encabezado ? ` · ${r.origen.encabezado}` : ""}`}
                          </p>
                          {r.origen.seccion && <p className="text-xs text-muted-foreground">Sección: {r.origen.seccion}</p>}
                          {r.nota && <p className="mt-1 text-xs text-muted-foreground">IA: {r.nota}</p>}
                          {r.avisos.length > 0 && (
                            <ul className="mt-1 space-y-0.5">
                              {r.avisos.map((a) => (
                                <li key={a} className="flex gap-1 text-xs text-accent">
                                  <TriangleAlert className="mt-0.5 size-3 shrink-0" /> {a}
                                </li>
                              ))}
                            </ul>
                          )}
                        </td>
                        <td className="min-w-56 px-3 py-3">
                          <Select
                            value={d.destino}
                            onChange={(e) => editar(i, { destino: e.target.value })}
                            aria-label={`Insumo para ${r.nombre}`}
                          >
                            <option value={NUEVO}>➕ Crear insumo nuevo</option>
                            {insumos.map((ins) => (
                              <option key={ins.id} value={ins.id}>
                                {ins.nombre}
                              </option>
                            ))}
                          </Select>
                          {r.coincidencia && d.destino === r.coincidencia.insumoId && (
                            <Badge className="mt-1" variant={r.coincidencia.metodo === "similitud" ? "accent" : "default"}>
                              {r.coincidencia.metodo === "memoria"
                                ? "Reconocido de una importación anterior"
                                : r.coincidencia.metodo === "ia"
                                  ? "Sugerido por la IA"
                                  : `Nombre parecido (${Math.round(r.coincidencia.similitud * 100)}%)`}
                            </Badge>
                          )}
                          {d.destino === NUEVO && (
                            <div className="mt-2 space-y-2">
                              <Input
                                value={d.nombre}
                                onChange={(e) => editar(i, { nombre: e.target.value })}
                                aria-label="Nombre del insumo nuevo"
                              />
                              <Input
                                value={d.categoria}
                                onChange={(e) => editar(i, { categoria: e.target.value })}
                                aria-label="Categoría del insumo nuevo"
                                placeholder="Categoría"
                              />
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-3 text-right whitespace-nowrap">
                          {actual?.costoActual ? (
                            <span className="text-muted-foreground">{formatoMoneda(actual.costoActual)} → </span>
                          ) : null}
                          <span className="font-semibold">{formatoMoneda(r.costo)}</span>
                          {actual?.cambio !== null && actual?.cambio !== undefined && (
                            <p className={cn("text-xs", Math.abs(actual.cambio) > 0.3 ? "text-accent" : "text-muted-foreground")}>
                              {porcentaje(actual.cambio)}
                            </p>
                          )}
                        </td>
                        <td className="px-3 py-3">
                          <Select
                            value={d.unidad}
                            onChange={(e) => editar(i, { unidad: e.target.value as UnidadCosto | "" })}
                            aria-label={`Unidad de ${r.nombre}`}
                          >
                            <option value="">Elegir…</option>
                            {UNIDADES_COSTO.map((u) => (
                              <option key={u} value={u}>
                                {ETIQUETA_UNIDAD[u]}
                              </option>
                            ))}
                          </Select>
                          {actual?.unidadActual && d.unidad && d.unidad !== actual.unidadActual && (
                            <p className="mt-1 text-xs text-accent">Hoy: {ETIQUETA_UNIDAD[actual.unidadActual]}</p>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
            <p className="text-sm text-muted-foreground">
              Se aplicarán <strong>{resumen.actualizar}</strong> actualizaciones y <strong>{resumen.crear}</strong>{" "}
              insumos nuevos.
              {resumen.sinUnidad > 0 && <span className="text-accent"> Falta la unidad en {resumen.sinUnidad}.</span>}
            </p>
            <div className="flex gap-2">
              <Button type="button" variant="ghost" onClick={() => setPropuesta(null)} disabled={aplicando}>
                Descartar
              </Button>
              <Button
                type="button"
                variant="accent"
                onClick={aplicar}
                disabled={aplicando || resumen.actualizar + resumen.crear === 0 || resumen.sinUnidad > 0}
              >
                {aplicando ? <Loader2 className="animate-spin" /> : <CheckCircle2 />} Aplicar cambios
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
