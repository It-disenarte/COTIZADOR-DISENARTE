"use client";

import { Badge } from "@/components/ui";
import { ETIQUETA_UNIDAD, UNIDADES_COSTO } from "@/lib/catalogo/constantes";
import { formatoMoneda, formatoNumero } from "@/lib/formato";
import type { Insumo } from "@/lib/servicios/insumos";
import { type Campo, PanelCrud } from "./panel-crud";

const CAMPOS: Campo[] = [
  { nombre: "nombre", etiqueta: "Nombre", requerido: true },
  { nombre: "categoria", etiqueta: "Categoría", requerido: true, ayuda: "Ej. Vinil de corte, Sustrato, Impresión JV33." },
  {
    nombre: "unidadCosto",
    etiqueta: "Unidad del costo",
    tipo: "select",
    opciones: [
      { valor: "", etiqueta: "Por definir" },
      ...UNIDADES_COSTO.map((u) => ({ valor: u, etiqueta: ETIQUETA_UNIDAD[u] })),
    ],
  },
  { nombre: "costo", etiqueta: "Costo", tipo: "numero", ayuda: "Sin IVA y sin margen. Vacío = por capturar." },
  { nombre: "anchoUtilM", etiqueta: "Ancho útil (m)", tipo: "numero", ayuda: "Solo rollos: convierte el costo por ML a m²." },
  { nombre: "areaLaminaM2", etiqueta: "Área de lámina (m²)", tipo: "numero", ayuda: "Solo láminas: ej. 2.9768 para 1.22 × 2.44 m." },
  { nombre: "fuente", etiqueta: "Fuente / nota", tipo: "textarea", anchoCompleto: true },
  { nombre: "requiereRevision", etiqueta: "Marcar como “Por revisar”", tipo: "checkbox", anchoCompleto: true },
];

export function TablaInsumos({ insumos, puedeEditar }: { insumos: Insumo[]; puedeEditar: boolean }) {
  return (
    <PanelCrud<Insumo>
      filas={insumos}
      puedeEditar={puedeEditar}
      endpoint="/api/insumos"
      etiquetaNueva="Nuevo insumo"
      archivable
      esArchivado={(i) => i.archivado}
      texto={(i) => `${i.nombre} ${i.categoria} ${i.fuente ?? ""}`}
      campos={CAMPOS}
      valores={(i) => ({
        nombre: i?.nombre ?? "",
        categoria: i?.categoria ?? "",
        unidadCosto: i?.unidadCosto ?? "",
        costo: i?.costo ?? "",
        anchoUtilM: i?.anchoUtilM ?? "",
        areaLaminaM2: i?.areaLaminaM2 ?? "",
        fuente: i?.fuente ?? "",
        requiereRevision: i?.requiereRevision ?? false,
      })}
      columnas={[
        {
          titulo: "Insumo",
          celda: (i) => (
            <div className="space-y-1">
              <p className="font-medium">{i.nombre}</p>
              <p className="text-xs text-muted-foreground">{i.categoria}</p>
              <div className="flex flex-wrap gap-1">
                {i.requiereRevision && <Badge variant="accent">Por revisar</Badge>}
                {i.archivado && <Badge>Archivado</Badge>}
              </div>
            </div>
          ),
        },
        {
          titulo: "Costo",
          celda: (i) => (
            <div>
              <p className={i.costo == null ? "text-accent" : ""}>{formatoMoneda(i.costo)}</p>
              <p className="text-xs text-muted-foreground">
                {i.unidadCosto ? `por ${ETIQUETA_UNIDAD[i.unidadCosto]}` : "unidad por definir"}
              </p>
            </div>
          ),
        },
        {
          titulo: "Conversión a m²",
          celda: (i) =>
            i.anchoUtilM ? (
              <span className="text-xs">Ancho útil {formatoNumero(i.anchoUtilM)} m</span>
            ) : i.areaLaminaM2 ? (
              <span className="text-xs">Lámina de {formatoNumero(i.areaLaminaM2)} m²</span>
            ) : (
              <span className="text-xs text-muted-foreground">—</span>
            ),
        },
        {
          titulo: "Fuente",
          celda: (i) => <span className="text-xs text-muted-foreground">{i.fuente ?? "—"}</span>,
          className: "max-w-xs",
        },
      ]}
    />
  );
}
