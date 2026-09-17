"use client";

import { Pencil, Plus } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Badge, Card, CardContent, Checkbox, Input } from "@/components/ui";
import { ETIQUETA_FAMILIA, ETIQUETA_MODO } from "@/lib/catalogo/constantes";
import { formatoFraccion } from "@/lib/formato";
import type { RecetaDetalle } from "@/lib/servicios/recetas";

export function ListaRecetas({ recetas, puedeEditar }: { recetas: RecetaDetalle[]; puedeEditar: boolean }) {
  const [busqueda, setBusqueda] = useState("");
  const [verArchivadas, setVerArchivadas] = useState(false);

  const visibles = recetas.filter((r) => {
    if (!verArchivadas && r.archivado) return false;
    const q = busqueda.trim().toLowerCase();
    return q === "" || `${r.nombre} ${ETIQUETA_FAMILIA[r.familia]}`.toLowerCase().includes(q);
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Input
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar receta…"
          className="min-w-52 flex-1"
          aria-label="Buscar receta"
        />
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <Checkbox checked={verArchivadas} onChange={(e) => setVerArchivadas(e.target.checked)} />
          Ver archivadas
        </label>
        {puedeEditar && (
          <Link
            href="/catalogo/recetas/nueva"
            className="inline-flex h-10 items-center gap-2 rounded-md bg-accent px-4 text-sm font-medium text-accent-foreground hover:bg-accent/90"
          >
            <Plus className="size-4" /> Nueva receta
          </Link>
        )}
      </div>

      {visibles.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">Sin recetas.</p>}

      <div className="grid gap-4 md:grid-cols-2">
        {visibles.map((r) => (
          <Card key={r.id} className={r.archivado ? "opacity-70" : ""}>
            <CardContent className="space-y-3 pt-6">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-medium">{r.nombre}</p>
                  <p className="text-xs text-muted-foreground">
                    {ETIQUETA_FAMILIA[r.familia]} · Merma {formatoFraccion(r.pctMerma)}
                  </p>
                </div>
                {puedeEditar && (
                  <Link
                    href={`/catalogo/recetas/${r.id}`}
                    className="flex items-center gap-1 rounded-md border px-2 py-1 text-xs hover:bg-muted"
                  >
                    <Pencil className="size-3.5" /> Editar
                  </Link>
                )}
              </div>

              {r.descripcionPdf && <p className="text-sm text-muted-foreground">{r.descripcionPdf}</p>}

              <ul className="space-y-1 text-sm">
                {r.componentes.map((c) => (
                  <li key={c.id} className="flex flex-wrap items-center gap-2">
                    <span>{c.insumo.nombre}</span>
                    <span className="text-xs text-muted-foreground">
                      {ETIQUETA_MODO[c.modo]} × {c.cantidad}
                    </span>
                    {c.insumo.costo == null && <Badge variant="accent">Sin costo</Badge>}
                    {c.insumo.requiereRevision && c.insumo.costo != null && <Badge variant="accent">Por revisar</Badge>}
                    {c.insumo.archivado && <Badge variant="destructive">Insumo archivado</Badge>}
                  </li>
                ))}
              </ul>

              <div className="flex gap-2">
                {r.archivado && <Badge>Archivada</Badge>}
                {r.componentes.some((c) => c.insumo.costo == null) && (
                  <Badge variant="accent">No se puede cotizar hasta capturar costos</Badge>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
