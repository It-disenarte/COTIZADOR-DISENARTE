import { z } from "zod";
import { COBROS_DIGITALES, UNIDADES_COSTO, ZONAS } from "@/lib/catalogo/constantes";
import { decimalOpcional, textoOpcional, textoRequerido, Uuid } from "./comunes";

// Insumos ------------------------------------------------------------------------------------

const camposInsumo = {
  nombre: textoRequerido(200, "Escribe el nombre."),
  nombreCliente: textoOpcional(200),
  categoria: textoRequerido(100, "Escribe la categoría."),
  unidadCosto: z.preprocess((v) => (v === "" ? null : v), z.enum(UNIDADES_COSTO).nullable()),
  costo: decimalOpcional({ min: 0 }),
  anchoUtilM: decimalOpcional({ min: 0 }),
  areaLaminaM2: decimalOpcional({ min: 0 }),
  largoRolloM: decimalOpcional({ min: 0 }),
  fuente: textoOpcional(1000),
  requiereRevision: z.boolean(),
};

const reglasInsumo = (d: { costo?: string | null; unidadCosto?: string | null }, ctx: z.RefinementCtx) => {
  // En un PATCH parcial la unidad puede no venir (undefined): esa combinación la valida el servicio.
  if (d.costo != null && d.unidadCosto === null) {
    ctx.addIssue({ code: "custom", path: ["unidadCosto"], message: "Indica la unidad del costo." });
  }
};

export const CrearInsumo = z.object(camposInsumo).superRefine(reglasInsumo);
export type CrearInsumo = z.infer<typeof CrearInsumo>;

export const ActualizarInsumo = z
  .object({ ...camposInsumo, archivado: z.boolean() })
  .partial()
  .superRefine(reglasInsumo);
export type ActualizarInsumo = z.infer<typeof ActualizarInsumo>;

/** Nombres para el cliente ya revisados (los propone la IA desde el catálogo). */
export const GuardarNombresCliente = z.object({
  cambios: z
    .array(z.object({ id: Uuid, nombreCliente: textoRequerido(200, "Escribe el nombre para el cliente.") }))
    .min(1, { error: "Elige al menos un nombre para guardar." })
    .max(300),
});
export type GuardarNombresCliente = z.infer<typeof GuardarNombresCliente>;

// Servicios digitales ------------------------------------------------------------------------

const camposServicioDigital = {
  nombre: textoRequerido(200, "Escribe el nombre del servicio."),
  categoria: textoRequerido(100, "Elige la categoría."),
  cobro: z.enum(COBROS_DIGITALES),
  // Vacío = por capturar: la cotización pide escribirlo antes de autorizar.
  precio: decimalOpcional({ min: 0 }),
  precioMensual: decimalOpcional({ min: 0 }),
  activacion: decimalOpcional({ min: 0 }),
  mesesRenta: z.coerce.number().int().min(1, { error: "Mínimo 1 mes." }).max(60).default(12),
  incluye: textoOpcional(2000),
  tiempoEntrega: textoOpcional(100),
};

export const CrearServicioDigital = z.object(camposServicioDigital);
export type CrearServicioDigital = z.infer<typeof CrearServicioDigital>;

export const ActualizarServicioDigital = z.object({ ...camposServicioDigital, archivado: z.boolean() }).partial();
export type ActualizarServicioDigital = z.infer<typeof ActualizarServicioDigital>;

// Parámetros ---------------------------------------------------------------------------------

export const ActualizarParametro = z.object({ valor: decimalOpcional({ min: 0 }) });

// Clientes -----------------------------------------------------------------------------------

const camposCliente = {
  nombreContacto: textoRequerido(200, "Escribe el nombre del contacto."),
  // El PNO-COM-01 (7.1.1) pide el puesto. Opcional en el esquema para no romper los
  // clientes y las cotizaciones que ya existen; el asistente sí lo muestra.
  puesto: textoOpcional(150).optional(),
  empresa: textoOpcional(200),
  correo: z.preprocess((v) => (v === "" ? null : v), z.email({ error: "Correo inválido." }).trim().toLowerCase().nullable()),
  telefono: textoOpcional(50),
  direccion: textoOpcional(500),
  kmDesdeSjr: decimalOpcional({ min: 0 }),
  zona: z.enum(ZONAS),
  notas: textoOpcional(2000),
};

export const CrearCliente = z.object(camposCliente);
export type CrearCliente = z.infer<typeof CrearCliente>;

export const ActualizarCliente = z.object(camposCliente).partial();
export type ActualizarCliente = z.infer<typeof ActualizarCliente>;
