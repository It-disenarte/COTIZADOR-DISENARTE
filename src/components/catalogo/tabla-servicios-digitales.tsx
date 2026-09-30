"use client";

import { Badge } from "@/components/ui";
import { COBROS_DIGITALES, ETIQUETA_COBRO_DIGITAL, opcionesCategoriaDigital } from "@/lib/catalogo/constantes";
import { formatoMoneda } from "@/lib/formato";
import type { ServicioDigital } from "@/lib/servicios/servicios-digitales";
import { type Campo, PanelCrud } from "./panel-crud";

const CAMPOS: Campo[] = [
  { nombre: "nombre", etiqueta: "Nombre", requerido: true, ayuda: "Así sale en la propuesta, p. ej. “Logotipo” o “Página web Next Level”." },
  { nombre: "categoria", etiqueta: "Categoría", requerido: true, tipo: "select", opciones: [], ayuda: "Agrupa el servicio en el catálogo del cotizador." },
  {
    nombre: "cobro",
    etiqueta: "Cómo se cobra",
    tipo: "select",
    opciones: COBROS_DIGITALES.map((c) => ({ valor: c, etiqueta: ETIQUETA_COBRO_DIGITAL[c] })),
    ayuda: "Paquete web: se puede rentar o comprar como dueño. Pago único y mensual llevan IVA aparte.",
  },
  {
    nombre: "precio",
    etiqueta: "Precio (sin IVA)",
    tipo: "numero",
    ayuda: "Pago único, precio al mes, o precio como dueño si es paquete web. Vacío = por capturar.",
  },
  { nombre: "precioMensual", etiqueta: "Renta: mensualidad (IVA incluido)", tipo: "numero", ayuda: "Solo paquetes web." },
  { nombre: "activacion", etiqueta: "Renta: activación (IVA incluido)", tipo: "numero", ayuda: "Solo paquetes web." },
  { nombre: "mesesRenta", etiqueta: "Renta: meses", tipo: "numero", ayuda: "Plazo de la renta; normalmente 12." },
  { nombre: "tiempoEntrega", etiqueta: "Tiempo de entrega", ayuda: "P. ej. “4 días hábiles”. Sale en la propuesta." },
  {
    nombre: "incluye",
    etiqueta: "Qué incluye",
    tipo: "textarea",
    anchoCompleto: true,
    ayuda: "Una viñeta por renglón. Sale en el PDF debajo del nombre del servicio.",
  },
];

export function TablaServiciosDigitales({ servicios, puedeEditar }: { servicios: ServicioDigital[]; puedeEditar: boolean }) {
  return (
    <PanelCrud<ServicioDigital>
      filas={servicios}
      puedeEditar={puedeEditar}
      endpoint="/api/servicios-digitales"
      etiquetaNueva="Nuevo servicio digital"
      archivable
      esArchivado={(s) => s.archivado}
      texto={(s) => `${s.nombre} ${s.categoria} ${s.incluye ?? ""}`}
      campos={CAMPOS}
      opcionesDe={(campo, s) =>
        campo === "categoria" ? opcionesCategoriaDigital(s?.categoria).map((c) => ({ valor: c, etiqueta: c })) : undefined
      }
      tituloFormulario={(s) => (s ? `Editar ${s.nombre}` : "Nuevo servicio digital")}
      valores={(s) => ({
        nombre: s?.nombre ?? "",
        categoria: s?.categoria ?? "",
        cobro: s?.cobro ?? "unico",
        precio: s?.precio ?? "",
        precioMensual: s?.precioMensual ?? "",
        activacion: s?.activacion ?? "",
        mesesRenta: String(s?.mesesRenta ?? 12),
        tiempoEntrega: s?.tiempoEntrega ?? "",
        incluye: s?.incluye ?? "",
      })}
      columnas={[
        {
          titulo: "Servicio",
          celda: (s) => (
            <div className="space-y-1">
              <p className="font-medium">{s.nombre}</p>
              <p className="text-xs text-muted-foreground">
                {s.categoria} · {ETIQUETA_COBRO_DIGITAL[s.cobro]}
              </p>
              {s.archivado && <Badge>Archivado</Badge>}
            </div>
          ),
        },
        {
          titulo: "Precio",
          celda: (s) =>
            s.cobro === "paquete" ? (
              <div className="text-xs">
                <p>
                  Renta: {formatoMoneda(s.precioMensual)}/mes × {s.mesesRenta} + activación {formatoMoneda(s.activacion)}{" "}
                  <span className="text-muted-foreground">(IVA incluido)</span>
                </p>
                <p>
                  Dueño: {formatoMoneda(s.precio)} <span className="text-muted-foreground">+ IVA</span>
                </p>
              </div>
            ) : (
              <p className={s.precio == null ? "text-accent" : ""}>
                {formatoMoneda(s.precio)}
                {s.precio != null && <span className="text-xs text-muted-foreground"> {s.cobro === "mensual" ? "al mes " : ""}+ IVA</span>}
              </p>
            ),
        },
        { titulo: "Entrega", celda: (s) => <span className="text-xs text-muted-foreground">{s.tiempoEntrega ?? "—"}</span> },
      ]}
    />
  );
}
