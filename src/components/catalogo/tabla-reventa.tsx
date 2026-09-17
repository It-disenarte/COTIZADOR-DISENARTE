"use client";

import { Badge } from "@/components/ui";
import { formatoFecha, formatoMoneda } from "@/lib/formato";
import type { ArticuloReventa } from "@/lib/servicios/reventa";
import { type Campo, PanelCrud } from "./panel-crud";

const CAMPOS: Campo[] = [
  { nombre: "nombre", etiqueta: "Artículo", requerido: true, anchoCompleto: true },
  { nombre: "precioReferencia", etiqueta: "Precio de referencia", tipo: "numero", ayuda: "Lo que cuesta comprarlo. El markup se aplica al cotizar." },
  { nombre: "verificadoEn", etiqueta: "Verificado el", tipo: "fecha", ayuda: "Fecha en que se revisó el precio." },
  { nombre: "linkReferencia", etiqueta: "Link de referencia", tipo: "url", anchoCompleto: true },
];

export function TablaReventa({ articulos, puedeEditar }: { articulos: ArticuloReventa[]; puedeEditar: boolean }) {
  return (
    <PanelCrud<ArticuloReventa>
      filas={articulos}
      puedeEditar={puedeEditar}
      endpoint="/api/reventa"
      etiquetaNueva="Nuevo artículo"
      archivable
      esArchivado={(a) => a.archivado}
      texto={(a) => a.nombre}
      campos={CAMPOS}
      valores={(a) => ({
        nombre: a?.nombre ?? "",
        precioReferencia: a?.precioReferencia ?? "",
        verificadoEn: a?.verificadoEn ?? "",
        linkReferencia: a?.linkReferencia ?? "",
      })}
      columnas={[
        {
          titulo: "Artículo",
          celda: (a) => (
            <div className="space-y-1">
              <p className="font-medium">{a.nombre}</p>
              {a.linkReferencia && (
                <a href={a.linkReferencia} target="_blank" rel="noreferrer" className="text-xs underline">
                  Ver referencia
                </a>
              )}
              {a.archivado && <Badge>Archivado</Badge>}
            </div>
          ),
        },
        {
          titulo: "Precio de referencia",
          celda: (a) => <span className={a.precioReferencia == null ? "text-accent" : ""}>{formatoMoneda(a.precioReferencia)}</span>,
        },
        {
          titulo: "Verificación",
          celda: (a) =>
            a.verificadoEn ? (
              <span className="text-xs">{formatoFecha(a.verificadoEn)}</span>
            ) : (
              <Badge variant="accent">Sin verificar</Badge>
            ),
        },
      ]}
    />
  );
}
