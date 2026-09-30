import type { CobroDigital } from "@/lib/catalogo/constantes";
import type { EntradaDigital, LineaDigital, PromocionDigital } from "@/lib/motor";
import { NO_INCLUYE_DIGITAL } from "@/lib/pdf/textos-digital";
import { type BorradorCotizacion, clienteVacio, nuevoId } from "./estado";

/** Borrador de una cotización de Digitalización: los mismos datos del paso 1 y su propia entrada. */
export type BorradorDigital = Omit<BorradorCotizacion, "entrada"> & { entrada: EntradaDigital };

/** Servicio del catálogo tal como lo recibe el asistente (los montos llegan como texto). */
export type ServicioCatalogo = {
  id: string;
  nombre: string;
  categoria: string;
  cobro: CobroDigital;
  precio: string | null;
  precioMensual: string | null;
  activacion: string | null;
  mesesRenta: number;
  incluye: string | null;
  tiempoEntrega: string | null;
  archivado: boolean;
};

/**
 * Las promociones de contado que suelen ofrecer, listas para activarse. Los valores se ajustan en
 * cada cotización (descuento, regalo y fecha límite).
 */
export const promocionesIniciales = (): PromocionDigital[] => [
  {
    id: nuevoId(),
    nombre: "Promoción #1 por pago de contado",
    descuentoPct: "10",
    regalo: "Capacitación del proyecto",
    validaHasta: "",
    activa: false,
  },
  {
    id: nuevoId(),
    nombre: "Promoción #2 por pago de contado dentro de las 48 horas",
    descuentoPct: "25",
    regalo: "1 año de soporte gratis y capacitación del proyecto",
    validaHasta: "",
    activa: false,
  },
];

export function borradorDigitalInicial(vendedorId: string): BorradorDigital {
  return {
    id: null,
    folio: null,
    titulo: "",
    solicitante: "",
    vendedorId,
    cliente: clienteVacio(),
    entrada: {
      tipo: "digital",
      modalidadWeb: "ambas",
      lineas: [],
      anticipoPct: "70",
      promociones: promocionesIniciales(),
      tiempoEstimado: "",
      alcance: { concepto: "", resumen: "" },
      propuesta: { noIncluye: NO_INCLUYE_DIGITAL, supuestos: "", vigenciaDias: "" },
      brief: null,
    },
  };
}

/** Renglón nuevo a partir de un servicio del catálogo: copia sus precios (cambiarlos aquí no toca el catálogo). */
export const lineaDesdeServicio = (s: ServicioCatalogo): LineaDigital => ({
  id: nuevoId(),
  servicioId: s.id,
  nombre: s.nombre,
  descripcion: s.incluye ?? "",
  cobro: s.cobro,
  cantidad: "1",
  precio: s.precio ?? "",
  precioMensual: s.precioMensual ?? "",
  activacion: s.activacion ?? "",
  mesesRenta: String(s.mesesRenta),
  tiempoEntrega: s.tiempoEntrega ?? "",
});

/** Renglón escrito a mano (un módulo a la medida, algo que no está en el catálogo). */
export const lineaNueva = (): LineaDigital => ({
  id: nuevoId(),
  servicioId: null,
  nombre: "",
  descripcion: "",
  cobro: "unico",
  cantidad: "1",
  precio: "",
  precioMensual: "",
  activacion: "",
  mesesRenta: "12",
  tiempoEntrega: "",
});

export function cuerpoDigital(borrador: BorradorDigital) {
  return {
    tipo: "digital" as const,
    titulo: borrador.titulo,
    solicitante: borrador.solicitante,
    vendedorId: borrador.vendedorId,
    cliente: { ...borrador.cliente, id: borrador.cliente.id ?? undefined },
    entrada: borrador.entrada,
  };
}
