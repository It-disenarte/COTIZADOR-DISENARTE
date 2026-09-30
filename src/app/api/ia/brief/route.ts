import { NextResponse } from "next/server";
import { z } from "zod";
import { leerJson, manejador } from "@/lib/api";
import { analizarBrief } from "@/lib/ia/brief";
import { requireSesion } from "@/lib/sesion";

// Leer el brief con la IA tarda unos segundos.
export const maxDuration = 60;

const PedirAnalisisBrief = z.object({
  archivo: z.string().trim().max(200),
  respuestas: z
    .array(z.object({ pregunta: z.string().trim().max(500), respuesta: z.string().trim().max(5000) }))
    .min(1, { error: "El brief no trae respuestas." })
    .max(200),
});

/** Propone paquete, extras, alcance y lo que no incluye a partir del brief del cliente. No guarda nada. */
export const POST = manejador(async (req: Request) => {
  const { usuario } = await requireSesion(req.headers);
  const datos = await leerJson(req, PedirAnalisisBrief);
  return NextResponse.json(await analizarBrief(usuario, datos));
});
