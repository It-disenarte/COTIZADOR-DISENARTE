import { z } from "zod";
import { UNIDADES_COSTO } from "@/lib/catalogo/constantes";
import { decimal, decimalOpcional, textoRequerido, Uuid } from "./comunes";

const comunes = {
  costo: decimal({ min: 0 }),
  // Al aplicar la unidad es obligatoria: sin ella el motor no sabe cómo usar el costo.
  unidadCosto: z.enum(UNIDADES_COSTO, { error: "Elige la unidad de cada renglón que vas a aplicar." }),
  anchoUtilM: decimalOpcional({ min: 0 }),
  clave: z.string().trim().min(1).max(400),
};

export const AplicarImportacion = z.object({
  archivo: textoRequerido(200, "Falta el nombre del archivo."),
  cambios: z
    .array(
      z.discriminatedUnion("accion", [
        z.object({ accion: z.literal("actualizar"), insumoId: Uuid, ...comunes }),
        z.object({
          accion: z.literal("crear"),
          nombre: textoRequerido(200, "Escribe el nombre del insumo nuevo."),
          categoria: textoRequerido(100, "Escribe la categoría del insumo nuevo."),
          ...comunes,
        }),
      ]),
    )
    .min(1, { error: "No elegiste ningún cambio para aplicar." })
    .max(500),
});

export type AplicarImportacion = z.infer<typeof AplicarImportacion>;
