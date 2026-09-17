import { z } from "zod";
import { ESTADOS_COTIZACION } from "@/lib/catalogo/constantes";
import { textoOpcional, textoRequerido, Uuid } from "./comunes";
import { CrearCliente } from "./catalogo";
import { EntradaCotizacion } from "./cotizacion";

/** El cliente se captura dentro de la cotización; si ya existe se reutiliza y se actualiza. */
export const ClienteCotizacion = CrearCliente.partial({ zona: true }).extend({
  id: Uuid.nullable().optional(),
  zona: CrearCliente.shape.zona.default("local"),
});

export const GuardarCotizacion = z.object({
  titulo: textoRequerido(200, "Escribe el título de la cotización."),
  solicitante: textoOpcional(200),
  /** Quién cotiza. Solo admin y agente_admin pueden elegir a alguien más. */
  vendedorId: Uuid.optional(),
  tiempoEstimado: textoOpcional(100),
  cliente: ClienteCotizacion,
  entrada: EntradaCotizacion,
});
export type GuardarCotizacion = z.infer<typeof GuardarCotizacion>;

export const CambiarEstado = z.object({ estado: z.enum(ESTADOS_COTIZACION) });
