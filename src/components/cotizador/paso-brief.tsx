"use client";

import { FileUp, Sparkles, Trash2 } from "lucide-react";
import { useState } from "react";
import { useAvisos } from "@/components/avisos";
import { PantallaCarga } from "@/components/pantalla-carga";
import { Button, Card, CardContent, Checkbox, Input, Label, Select, Textarea } from "@/components/ui";
import { type BriefLeido, leerBrief } from "@/lib/cotizador/brief";
import { type BorradorDigital, lineaDesdeServicio, type ServicioCatalogo } from "@/lib/cotizador/estado-digital";
import { llamarApi } from "@/lib/utils";

type Propuesta = {
  paqueteId: string | null;
  extras: { servicioId: string; nombre: string; motivo: string }[];
  concepto: string;
  resumen: string;
  noIncluye: string[];
  supuestos: string[];
};

/** Lo que el vendedor decide aplicar de la propuesta de la IA. */
type Seleccion = {
  paqueteId: string;
  extras: Set<string>;
  concepto: string;
  resumen: string;
  usarAlcance: boolean;
  noIncluye: boolean;
  supuestos: boolean;
};

const TAMANO_MAXIMO = 4 * 1024 * 1024;

/**
 * El brief lo llena el cliente en Google Forms. Aquí se sube el CSV de respuestas, se elige al cliente
 * y la IA propone paquete, extras y textos. Nada se aplica sin revisión y la IA no pone precios: los
 * servicios que propone traen el precio del catálogo. El brief se guarda con la cotización (interno).
 */
export function PasoBrief({
  borrador,
  cambiar,
  servicios,
}: {
  borrador: BorradorDigital;
  cambiar: (cambios: (b: BorradorDigital) => BorradorDigital) => void;
  servicios: ServicioCatalogo[] | null;
}) {
  const avisar = useAvisos();
  const [leido, setLeido] = useState<(BriefLeido & { archivo: string }) | null>(null);
  const [analizando, setAnalizando] = useState(false);
  const [seleccion, setSeleccion] = useState<(Seleccion & { propuesta: Propuesta }) | null>(null);
  const [verRespuestas, setVerRespuestas] = useState(false);
  const brief = borrador.entrada.brief ?? null;
  const paquetes = (servicios ?? []).filter((s) => s.cobro === "paquete" && !s.archivado);

  async function subir(archivo: File | undefined) {
    if (!archivo) return;
    if (archivo.size > TAMANO_MAXIMO) {
      avisar({ tipo: "error", texto: "El archivo pesa más de 4 MB. Descarga solo las respuestas en CSV." });
      return;
    }
    try {
      const datos = leerBrief(await archivo.text());
      setLeido({ ...datos, archivo: archivo.name });
      setSeleccion(null);
      if (datos.clientes.length === 1) usarCliente(archivo.name, datos.clientes[0].respuestas);
    } catch (e) {
      avisar({ tipo: "error", texto: e instanceof Error ? e.message : "No se pudo leer el archivo." });
    }
  }

  function usarCliente(archivo: string, respuestas: { pregunta: string; respuesta: string }[]) {
    cambiar((b) => ({ ...b, entrada: { ...b.entrada, brief: { archivo, respuestas } } }));
    setSeleccion(null);
  }

  async function analizar() {
    if (!brief) return;
    setAnalizando(true);
    try {
      const propuesta = await llamarApi<Propuesta>("/api/ia/brief", "POST", brief);
      setSeleccion({
        propuesta,
        paqueteId: propuesta.paqueteId ?? "",
        extras: new Set(propuesta.extras.map((e) => e.servicioId)),
        concepto: propuesta.concepto,
        resumen: propuesta.resumen,
        usarAlcance: Boolean(propuesta.concepto || propuesta.resumen),
        noIncluye: propuesta.noIncluye.length > 0,
        supuestos: propuesta.supuestos.length > 0,
      });
    } catch (e) {
      avisar({ tipo: "error", texto: e instanceof Error ? e.message : "No se pudo analizar el brief." });
    } finally {
      setAnalizando(false);
    }
  }

  function aplicar() {
    if (!seleccion || !servicios) return;
    const porId = new Map(servicios.map((s) => [s.id, s]));
    const elegidos = [seleccion.paqueteId, ...seleccion.extras].filter(Boolean);
    cambiar((b) => {
      const yaEstan = new Set(b.entrada.lineas.map((l) => l.servicioId));
      const nuevas = elegidos.flatMap((id) => {
        const s = porId.get(id);
        return s && !yaEstan.has(id) ? [lineaDesdeServicio(s)] : [];
      });
      const noIncluyeActual = b.entrada.propuesta?.noIncluye ?? "";
      return {
        ...b,
        entrada: {
          ...b.entrada,
          lineas: [...b.entrada.lineas, ...nuevas],
          alcance: seleccion.usarAlcance ? { concepto: seleccion.concepto, resumen: seleccion.resumen } : b.entrada.alcance,
          propuesta: {
            ...b.entrada.propuesta,
            noIncluye: seleccion.noIncluye
              ? [noIncluyeActual, ...seleccion.propuesta.noIncluye].filter((x) => x.trim()).join("\n")
              : noIncluyeActual,
            supuestos: seleccion.supuestos ? seleccion.propuesta.supuestos.join("\n") : b.entrada.propuesta?.supuestos,
          },
        },
      };
    });
    avisar({ tipo: "ok", texto: "Se aplicó lo seleccionado. Revisa los precios en el paso Servicios." });
    setSeleccion(null);
  }

  const alternarExtra = (id: string) =>
    setSeleccion((s) => {
      if (!s) return s;
      const extras = new Set(s.extras);
      if (extras.has(id)) extras.delete(id);
      else extras.add(id);
      return { ...s, extras };
    });

  return (
    <div className="space-y-6">
      {analizando && <PantallaCarga mensaje="La IA está leyendo el brief…" />}
      <Card>
        <CardContent className="space-y-4 pt-6">
          <div>
            <h3 className="font-medium">Brief del cliente (opcional)</h3>
            <p className="text-sm text-muted-foreground">
              Sube las respuestas del formulario de Google en CSV (Respuestas → ícono de Hojas de cálculo → Archivo →
              Descargar → CSV). La IA propone el paquete, los extras que el cliente pide y los textos de la propuesta;
              tú decides qué se aplica. El brief queda guardado con la cotización y nunca sale en el PDF.
            </p>
          </div>

          <label className="flex w-fit cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-muted">
            <FileUp className="size-4" /> {brief ? "Subir otro brief" : "Subir el brief (CSV)"}
            <input type="file" accept=".csv,text/csv" className="sr-only" onChange={(e) => subir(e.target.files?.[0])} />
          </label>

          {leido && leido.clientes.length > 1 && (
            <div className="space-y-1.5">
              <Label htmlFor="cliente-brief">¿De qué cliente es esta cotización?</Label>
              <Select
                id="cliente-brief"
                defaultValue=""
                onChange={(e) => {
                  const c = leido.clientes[Number(e.target.value)];
                  if (c) usarCliente(leido.archivo, c.respuestas);
                }}
              >
                <option value="" disabled>
                  Elige al cliente…
                </option>
                {leido.clientes.map((c, i) => (
                  <option key={i} value={i}>
                    {c.etiqueta}
                  </option>
                ))}
              </Select>
              <p className="text-xs text-muted-foreground">El archivo trae {leido.clientes.length} respuestas; cada renglón es un cliente.</p>
            </div>
          )}

          {brief && (
            <div className="space-y-3 rounded-md border bg-muted/30 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <p>
                  <span className="font-medium">{brief.archivo}</span> · {brief.respuestas.length} respuestas guardadas
                </p>
                <div className="flex gap-2">
                  <Button type="button" size="sm" variant="ghost" onClick={() => setVerRespuestas((v) => !v)}>
                    {verRespuestas ? "Ocultar respuestas" : "Ver respuestas"}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    title="Quitar el brief de la cotización"
                    onClick={() => cambiar((b) => ({ ...b, entrada: { ...b.entrada, brief: null } }))}
                  >
                    <Trash2 />
                  </Button>
                </div>
              </div>
              {verRespuestas && (
                <dl className="max-h-96 space-y-2 overflow-y-auto text-xs">
                  {brief.respuestas.map((r, i) => (
                    <div key={i}>
                      <dt className="font-medium">{r.pregunta}</dt>
                      <dd className="whitespace-pre-line text-muted-foreground">{r.respuesta}</dd>
                    </div>
                  ))}
                </dl>
              )}
              <Button type="button" onClick={analizar} disabled={analizando}>
                <Sparkles /> Analizar con IA
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {seleccion && (
        <Card className="border-primary/40">
          <CardContent className="space-y-5 pt-6">
            <div>
              <h3 className="font-medium">Lo que propone la IA</h3>
              <p className="text-sm text-muted-foreground">Desmarca lo que no quieras y corrige los textos. Los precios salen del catálogo.</p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="paquete-brief">Paquete web</Label>
              <Select id="paquete-brief" value={seleccion.paqueteId} onChange={(e) => setSeleccion({ ...seleccion, paqueteId: e.target.value })}>
                <option value="">Sin paquete web</option>
                {paquetes.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nombre}
                  </option>
                ))}
              </Select>
            </div>

            {seleccion.propuesta.extras.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium">Servicios extra que el brief pide</p>
                {seleccion.propuesta.extras.map((e) => (
                  <label key={e.servicioId} className="flex items-start gap-2 text-sm">
                    <Checkbox checked={seleccion.extras.has(e.servicioId)} onChange={() => alternarExtra(e.servicioId)} className="mt-0.5" />
                    <span>
                      <span className="font-medium">{e.nombre}</span>
                      <span className="block text-xs text-muted-foreground">{e.motivo}</span>
                    </span>
                  </label>
                ))}
              </div>
            )}

            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm font-medium">
                <Checkbox checked={seleccion.usarAlcance} onChange={(e) => setSeleccion({ ...seleccion, usarAlcance: e.target.checked })} />
                Usar como resumen de alcance
              </label>
              <Input value={seleccion.concepto} onChange={(e) => setSeleccion({ ...seleccion, concepto: e.target.value })} aria-label="Concepto" />
              <Textarea value={seleccion.resumen} onChange={(e) => setSeleccion({ ...seleccion, resumen: e.target.value })} aria-label="Resumen" className="min-h-20" />
            </div>

            {seleccion.propuesta.noIncluye.length > 0 && (
              <div className="space-y-1">
                <label className="flex items-center gap-2 text-sm font-medium">
                  <Checkbox checked={seleccion.noIncluye} onChange={(e) => setSeleccion({ ...seleccion, noIncluye: e.target.checked })} />
                  Agregar a “Lo que no incluye”
                </label>
                <ul className="ml-6 list-disc text-xs text-muted-foreground">
                  {seleccion.propuesta.noIncluye.map((x, i) => (
                    <li key={i}>{x}</li>
                  ))}
                </ul>
              </div>
            )}

            {seleccion.propuesta.supuestos.length > 0 && (
              <div className="space-y-1">
                <label className="flex items-center gap-2 text-sm font-medium">
                  <Checkbox checked={seleccion.supuestos} onChange={(e) => setSeleccion({ ...seleccion, supuestos: e.target.checked })} />
                  Usar como supuestos de la propuesta
                </label>
                <ul className="ml-6 list-disc text-xs text-muted-foreground">
                  {seleccion.propuesta.supuestos.map((x, i) => (
                    <li key={i}>{x}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              <Button type="button" onClick={aplicar}>
                Aplicar lo seleccionado
              </Button>
              <Button type="button" variant="ghost" onClick={() => setSeleccion(null)}>
                Descartar
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
