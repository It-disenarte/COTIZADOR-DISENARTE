"use client";

import { Badge } from "@/components/ui";
import { ETIQUETA_ZONA, ZONAS } from "@/lib/catalogo/constantes";
import { formatoNumero } from "@/lib/formato";
import type { Cliente } from "@/lib/servicios/clientes";
import { type Campo, PanelCrud } from "./panel-crud";

const CAMPOS: Campo[] = [
  { nombre: "nombreContacto", etiqueta: "Contacto", requerido: true },
  { nombre: "empresa", etiqueta: "Empresa" },
  { nombre: "correo", etiqueta: "Correo" },
  { nombre: "telefono", etiqueta: "Teléfono" },
  { nombre: "direccion", etiqueta: "Dirección", tipo: "textarea", anchoCompleto: true },
  { nombre: "kmDesdeSjr", etiqueta: "Km desde San Juan del Río", tipo: "numero", ayuda: "Se usa para calcular gasolina y casetas." },
  {
    nombre: "zona",
    etiqueta: "Zona",
    tipo: "select",
    opciones: ZONAS.map((z) => ({ valor: z, etiqueta: ETIQUETA_ZONA[z] })),
  },
  { nombre: "notas", etiqueta: "Notas", tipo: "textarea", anchoCompleto: true },
];

export function TablaClientes({ clientes, puedeEditar }: { clientes: Cliente[]; puedeEditar: boolean }) {
  return (
    <PanelCrud<Cliente>
      filas={clientes}
      puedeEditar={puedeEditar}
      endpoint="/api/clientes"
      etiquetaNueva="Nuevo cliente"
      texto={(c) => `${c.nombreContacto} ${c.empresa ?? ""} ${c.correo ?? ""} ${c.telefono ?? ""}`}
      campos={CAMPOS}
      vacio="Todavía no hay clientes."
      valores={(c) => ({
        nombreContacto: c?.nombreContacto ?? "",
        empresa: c?.empresa ?? "",
        correo: c?.correo ?? "",
        telefono: c?.telefono ?? "",
        direccion: c?.direccion ?? "",
        kmDesdeSjr: c?.kmDesdeSjr ?? "",
        zona: c?.zona ?? "local",
        notas: c?.notas ?? "",
      })}
      columnas={[
        {
          titulo: "Cliente",
          celda: (c) => (
            <div className="space-y-1">
              <p className="font-medium">{c.empresa ?? c.nombreContacto}</p>
              {c.empresa && <p className="text-xs text-muted-foreground">{c.nombreContacto}</p>}
            </div>
          ),
        },
        {
          titulo: "Contacto",
          celda: (c) => (
            <div className="space-y-1 text-xs">
              {c.correo && <p>{c.correo}</p>}
              {c.telefono && <p>{c.telefono}</p>}
              {!c.correo && !c.telefono && <span className="text-muted-foreground">—</span>}
            </div>
          ),
        },
        {
          titulo: "Zona",
          celda: (c) => (
            <div className="space-y-1">
              <Badge variant={c.zona === "foraneo" ? "accent" : "default"}>{ETIQUETA_ZONA[c.zona]}</Badge>
              <p className="text-xs text-muted-foreground">
                {c.kmDesdeSjr ? `${formatoNumero(c.kmDesdeSjr)} km desde SJR` : "Km por capturar"}
              </p>
            </div>
          ),
        },
        {
          titulo: "Notas",
          celda: (c) => <span className="text-xs text-muted-foreground">{c.notas ?? "—"}</span>,
          className: "max-w-xs",
        },
      ]}
    />
  );
}
