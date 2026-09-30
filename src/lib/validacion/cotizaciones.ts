import { z } from "zod";
import { ESTADOS_COTIZACION } from "@/lib/catalogo/constantes";
import { textoOpcional, textoRequerido, Uuid } from "./comunes";
import { CrearCliente } from "./catalogo";
import { EntradaBorrador } from "./cotizacion";
import { EntradaDigitalBorrador } from "./digital";

/** El cliente se captura dentro de la cotización; si ya existe se reutiliza y se actualiza. */
export const ClienteCotizacion = CrearCliente.partial({ zona: true }).extend({
  id: Uuid.nullable().optional(),
  zona: CrearCliente.shape.zona.default("local"),
});

const datosComunes = {
  titulo: textoRequerido(200, "Escribe el título de la cotización."),
  solicitante: textoOpcional(200),
  /** Quién cotiza. Solo admin y agente_admin pueden elegir a alguien más. */
  vendedorId: Uuid.optional(),
  cliente: ClienteCotizacion,
};

/**
 * Publicidad física o Digitalización: cada tipo trae su propia entrada. Se guarda aunque esté
 * incompleta; la validación completa se exige al autorizar. Sin "tipo" es física: así mandan las
 * pestañas que quedaron abiertas de antes.
 */
export const GuardarCotizacion = z.preprocess(
  (v) => (v && typeof v === "object" && !("tipo" in v) ? { ...v, tipo: "fisica" } : v),
  z.discriminatedUnion("tipo", [
    z.object({ ...datosComunes, tipo: z.literal("fisica"), entrada: EntradaBorrador }),
    z.object({ ...datosComunes, tipo: z.literal("digital"), entrada: EntradaDigitalBorrador }),
  ]),
);
export type GuardarCotizacion = z.infer<typeof GuardarCotizacion>;

export const CambiarEstado = z.object({ estado: z.enum(ESTADOS_COTIZACION) });
