"use client";

import { Archive, ArchiveRestore, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Aviso, Badge, Button, Card, CardContent, Input, Label, Select, Textarea } from "@/components/ui";
import {
  ETIQUETA_FAMILIA,
  ETIQUETA_MODO,
  ETIQUETA_UNIDAD,
  type UnidadCosto,
  FAMILIAS_RECETA,
  MODOS_COMPONENTE,
  type ModoComponente,
} from "@/lib/catalogo/constantes";
import { formatoMoneda } from "@/lib/formato";
import type { RecetaDetalle } from "@/lib/servicios/recetas";
import { llamarApi } from "@/lib/utils";

export type InsumoOpcion = {
  id: string;
  nombre: string;
  categoria: string;
  costo: string | null;
  unidadCosto: UnidadCosto | null;
  requiereRevision: boolean;
  archivado: boolean;
};

type FilaComponente = { clave: string; insumoId: string; modo: ModoComponente; cantidad: string };

const nuevaClave = () => Math.random().toString(36).slice(2);

export function EditorReceta({ receta, insumos }: { receta: RecetaDetalle | null; insumos: InsumoOpcion[] }) {
  const router = useRouter();
  const [nombre, setNombre] = useState(receta?.nombre ?? "");
  const [familia, setFamilia] = useState(receta?.familia ?? "senaletica");
  const [descripcionPdf, setDescripcionPdf] = useState(receta?.descripcionPdf ?? "");
  const [pctMerma, setPctMerma] = useState(receta?.pctMerma ?? "0");
  const [filas, setFilas] = useState<FilaComponente[]>(
    receta?.componentes.map((c) => ({ clave: c.id, insumoId: c.insumoId, modo: c.modo, cantidad: c.cantidad })) ?? [],
  );
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const porId = new Map(insumos.map((i) => [i.id, i]));
  // Un insumo archivado solo aparece si la receta ya lo usaba.
  const yaUsados = new Set(receta?.componentes.map((c) => c.insumoId) ?? []);
  const disponibles = insumos.filter((i) => !i.archivado || yaUsados.has(i.id));

  function actualizarFila(clave: string, cambios: Partial<FilaComponente>) {
    setFilas((f) => f.map((fila) => (fila.clave === clave ? { ...fila, ...cambios } : fila)));
  }

  async function guardar(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (filas.length === 0) {
      setError("Agrega al menos un componente.");
      return;
    }
    if (filas.some((f) => !f.insumoId)) {
      setError("Cada componente necesita un insumo.");
      return;
    }
    const cuerpo = {
      nombre,
      familia,
      descripcionPdf,
      pctMerma,
      componentes: filas.map(({ insumoId, modo, cantidad }) => ({ insumoId, modo, cantidad })),
    };
    setError(null);
    setOcupado(true);
    try {
      const respuesta = await llamarApi<{ receta: RecetaDetalle }>(
        receta ? `/api/recetas/${receta.id}` : "/api/recetas",
        receta ? "PATCH" : "POST",
        cuerpo,
      );
      router.push(`/catalogo?tab=recetas`);
      router.refresh();
      return respuesta;
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar.");
      setOcupado(false);
    }
  }

  async function alternarArchivado() {
    if (!receta) return;
    setOcupado(true);
    setError(null);
    try {
      await llamarApi(`/api/recetas/${receta.id}`, "PATCH", { archivado: !receta.archivado });
      router.push("/catalogo?tab=recetas");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo archivar.");
      setOcupado(false);
    }
  }

  return (
    <form onSubmit={guardar} className="space-y-6">
      <Card>
        <CardContent className="grid gap-4 pt-6 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="nombre">Nombre</Label>
            <Input id="nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} required maxLength={200} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="familia">Familia</Label>
            <Select id="familia" value={familia} onChange={(e) => setFamilia(e.target.value as typeof familia)}>
              {FAMILIAS_RECETA.map((f) => (
                <option key={f} value={f}>
                  {ETIQUETA_FAMILIA[f]}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="merma">Merma</Label>
            <Input id="merma" inputMode="decimal" value={pctMerma} onChange={(e) => setPctMerma(e.target.value)} />
            <p className="text-xs text-muted-foreground">Fracción: 0.15 = 15%.</p>
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="descripcion">Descripción para el PDF</Label>
            <Textarea
              id="descripcion"
              value={descripcionPdf}
              onChange={(e) => setDescripcionPdf(e.target.value)}
              maxLength={1000}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-4 pt-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-medium">Componentes</h2>
              <p className="text-sm text-muted-foreground">
                Por m² escala con el área, por pieza con la cantidad de piezas y fijo se cobra una sola vez.
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={() => setFilas((f) => [...f, { clave: nuevaClave(), insumoId: "", modo: "por_m2", cantidad: "1" }])}
            >
              <Plus /> Agregar
            </Button>
          </div>

          {filas.length === 0 && <p className="text-sm text-muted-foreground">Sin componentes.</p>}

          <div className="space-y-3">
            {filas.map((fila) => {
              const insumo = porId.get(fila.insumoId);
              return (
                <div key={fila.clave} className="grid gap-3 rounded-lg border p-3 sm:grid-cols-[2fr_1fr_1fr_auto]">
                  <div className="space-y-1">
                    <Label htmlFor={`insumo-${fila.clave}`} className="text-xs text-muted-foreground">
                      Insumo
                    </Label>
                    <Select
                      id={`insumo-${fila.clave}`}
                      value={fila.insumoId}
                      onChange={(e) => actualizarFila(fila.clave, { insumoId: e.target.value })}
                    >
                      <option value="">Elegir…</option>
                      {disponibles.map((i) => (
                        <option key={i.id} value={i.id}>
                          {i.nombre}
                          {i.archivado ? " (archivado)" : ""}
                        </option>
                      ))}
                    </Select>
                    {insumo && (
                      <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        {formatoMoneda(insumo.costo)}
                        {insumo.unidadCosto && ` por ${ETIQUETA_UNIDAD[insumo.unidadCosto]}`}
                        {insumo.requiereRevision && <Badge variant="accent">Por revisar</Badge>}
                      </p>
                    )}
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor={`modo-${fila.clave}`} className="text-xs text-muted-foreground">
                      Modo
                    </Label>
                    <Select
                      id={`modo-${fila.clave}`}
                      value={fila.modo}
                      onChange={(e) => actualizarFila(fila.clave, { modo: e.target.value as ModoComponente })}
                    >
                      {MODOS_COMPONENTE.map((m) => (
                        <option key={m} value={m}>
                          {ETIQUETA_MODO[m]}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor={`cantidad-${fila.clave}`} className="text-xs text-muted-foreground">
                      Cantidad
                    </Label>
                    <Input
                      id={`cantidad-${fila.clave}`}
                      inputMode="decimal"
                      value={fila.cantidad}
                      onChange={(e) => actualizarFila(fila.clave, { cantidad: e.target.value })}
                    />
                  </div>
                  <div className="flex items-end">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      title="Quitar componente"
                      onClick={() => setFilas((f) => f.filter((x) => x.clave !== fila.clave))}
                    >
                      <Trash2 />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {error && <Aviso>{error}</Aviso>}

      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={ocupado}>
          {receta ? "Guardar cambios" : "Crear receta"}
        </Button>
        <Button type="button" variant="ghost" onClick={() => router.push("/catalogo?tab=recetas")}>
          Cancelar
        </Button>
        {receta && (
          <Button type="button" variant="outline" className="ml-auto" disabled={ocupado} onClick={alternarArchivado}>
            {receta.archivado ? <ArchiveRestore /> : <Archive />} {receta.archivado ? "Restaurar" : "Archivar"}
          </Button>
        )}
      </div>
    </form>
  );
}
