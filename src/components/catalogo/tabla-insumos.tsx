"use client";

import { Badge } from "@/components/ui";
import { ETIQUETA_UNIDAD, opcionesCategoria, UNIDADES_COSTO } from "@/lib/catalogo/constantes";
import { formatoMoneda, formatoNumero } from "@/lib/formato";
import type { Insumo } from "@/lib/servicios/insumos";
import { type Campo, PanelCrud } from "./panel-crud";

const CAMPOS: Campo[] = [
  { nombre: "nombre", etiqueta: "Nombre", requerido: true },
  {
    nombre: "nombreCliente",
    etiqueta: "Nombre para el cliente",
    ayuda: "Cómo sale en la descripción de los conceptos del PDF. Vacío = se usa el nombre.",
  },
  {
    nombre: "categoria",
    etiqueta: "Categoría",
    requerido: true,
    tipo: "select",
    // Las opciones se arman con la categoría del insumo que se edita (ver opcionesDe).
    opciones: [],
    ayuda: "Agrupa el insumo en el catálogo del cotizador.",
  },
  {
    nombre: "unidadCosto",
    etiqueta: "Unidad del costo",
    ayuda: "Cómo lo compra Diseñarte: el costo es por esta unidad. El cliente nunca la ve.",
    tipo: "select",
    opciones: [
      { valor: "", etiqueta: "Por definir" },
      ...UNIDADES_COSTO.map((u) => ({ valor: u, etiqueta: ETIQUETA_UNIDAD[u] })),
    ],
  },
  { nombre: "costo", etiqueta: "Costo", tipo: "numero", ayuda: "Sin IVA y sin margen. Vacío = por capturar." },
  { nombre: "anchoUtilM", etiqueta: "Ancho útil (m)", tipo: "numero", ayuda: "Solo rollos (por metro o completo): p. ej. 1.22. Convierte el costo a m²." },
  { nombre: "largoRolloM", etiqueta: "Largo del rollo (m)", tipo: "numero", ayuda: "Solo rollo completo: cuántos metros trae, p. ej. 50." },
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
      eliminable
      nombreDe={(i) => i.nombre}
      avisoEliminar="Se borra del catálogo para siempre. Si alguna cotización lo usa no se podrá eliminar: en ese caso archívalo (botón de la caja), deja de aparecer y esas cotizaciones conservan su precio."
      texto={(i) => `${i.nombre} ${i.nombreCliente ?? ""} ${i.categoria} ${i.fuente ?? ""}`}
      campos={CAMPOS}
      opcionesDe={(campo, i) =>
        campo === "categoria" ? opcionesCategoria(i?.categoria).map((c) => ({ valor: c, etiqueta: c })) : undefined
      }
      tituloFormulario={(i) => (i ? `Editar ${i.nombre}` : "Nuevo insumo")}
      valores={(i) => ({
        nombre: i?.nombre ?? "",
        nombreCliente: i?.nombreCliente ?? "",
        categoria: i?.categoria ?? "",
        unidadCosto: i?.unidadCosto ?? "",
        costo: i?.costo ?? "",
        anchoUtilM: i?.anchoUtilM ?? "",
        areaLaminaM2: i?.areaLaminaM2 ?? "",
        largoRolloM: i?.largoRolloM ?? "",
        fuente: i?.fuente ?? "",
        requiereRevision: i?.requiereRevision ?? false,
      })}
      columnas={[
        {
          titulo: "Insumo",
          celda: (i) => (
            <div className="space-y-1">
              <p className="font-medium">{i.nombre}</p>
              {i.nombreCliente && <p className="text-xs">Para el cliente: {i.nombreCliente}</p>}
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
            i.unidadCosto === "rollo" ? (
              <span className="text-xs">
                Rollo de {formatoNumero(i.anchoUtilM ?? "")} × {formatoNumero(i.largoRolloM ?? "")} m
              </span>
            ) : i.anchoUtilM ? (
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
