import { z } from "zod";
import { textoOpcional, textoRequerido } from "./comunes";

export const PedirPrecioReventa = z.object({
  nombre: textoRequerido(200, "Escribe el nombre del artículo."),
});

export const PedirAlcance = z.object({
  titulo: textoRequerido(200, "Escribe el título de la cotización."),
  areas: z.array(z.string().trim().max(100)).max(50),
  piezas: z.string().trim().max(20),
  recetas: z
    .array(z.object({ nombre: z.string().trim().max(200), descripcion: textoOpcional(1000) }))
    .min(1, { error: "Elige al menos una opción de material." })
    .max(10),
  tiempoEstimado: textoOpcional(100),
  incluyeEnvio: z.boolean(),
  incluyeInstalacion: z.boolean(),
});
