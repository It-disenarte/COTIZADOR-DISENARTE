import { z } from "zod";
import { FAMILIAS_RECETA, MODOS_COMPONENTE, UNIDADES_COSTO, ZONAS } from "@/lib/catalogo/constantes";
import { decimal, decimalOpcional, fechaOpcional, textoOpcional, textoRequerido, urlOpcional, Uuid } from "./comunes";

// Insumos ------------------------------------------------------------------------------------

const camposInsumo = {
  nombre: textoRequerido(200, "Escribe el nombre."),
  categoria: textoRequerido(100, "Escribe la categoría."),
  unidadCosto: z.preprocess((v) => (v === "" ? null : v), z.enum(UNIDADES_COSTO).nullable()),
  costo: decimalOpcional({ min: 0 }),
  anchoUtilM: decimalOpcional({ min: 0 }),
  areaLaminaM2: decimalOpcional({ min: 0 }),
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

// Recetas ------------------------------------------------------------------------------------

export const Componente = z.object({
  insumoId: Uuid,
  modo: z.enum(MODOS_COMPONENTE),
  cantidad: decimal({ min: 0 }).refine((v) => Number(v) > 0, { error: "La cantidad debe ser mayor a 0." }),
});

const camposReceta = {
  nombre: textoRequerido(200, "Escribe el nombre."),
  familia: z.enum(FAMILIAS_RECETA),
  descripcionPdf: textoOpcional(1000),
  pctMerma: decimal({ min: 0, max: 1, maxExclusivo: true }),
  componentes: z.array(Componente).min(1, { error: "Agrega al menos un componente." }).max(30),
};

export const CrearReceta = z.object(camposReceta);
export type CrearReceta = z.infer<typeof CrearReceta>;

export const ActualizarReceta = z.object({ ...camposReceta, archivado: z.boolean() }).partial();
export type ActualizarReceta = z.infer<typeof ActualizarReceta>;

// Reventa ------------------------------------------------------------------------------------

const camposReventa = {
  nombre: textoRequerido(200, "Escribe el nombre."),
  precioReferencia: decimalOpcional({ min: 0 }),
  linkReferencia: urlOpcional,
  verificadoEn: fechaOpcional,
};

export const CrearArticuloReventa = z.object(camposReventa);
export type CrearArticuloReventa = z.infer<typeof CrearArticuloReventa>;

export const ActualizarArticuloReventa = z.object({ ...camposReventa, archivado: z.boolean() }).partial();
export type ActualizarArticuloReventa = z.infer<typeof ActualizarArticuloReventa>;

// Parámetros ---------------------------------------------------------------------------------

export const ActualizarParametro = z.object({ valor: decimalOpcional({ min: 0 }) });

// Clientes -----------------------------------------------------------------------------------

const camposCliente = {
  nombreContacto: textoRequerido(200, "Escribe el nombre del contacto."),
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
