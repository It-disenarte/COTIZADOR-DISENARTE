import { z } from "zod";

export const PedirDistancia = z
  .object({
    direccion: z.string().trim().max(300).optional(),
    destino: z
      .object({
        lat: z.number().min(-90).max(90),
        lon: z.number().min(-180).max(180),
        etiqueta: z.string().trim().max(300),
      })
      .optional(),
  })
  .refine((d) => d.destino || (d.direccion && d.direccion.length >= 5), {
    error: "Escribe la dirección (calle, número, colonia, ciudad y estado).",
    path: ["direccion"],
  });

export type PedirDistancia = z.infer<typeof PedirDistancia>;
