import { NextResponse } from "next/server";
import { z } from "zod";
import { leerJson, manejador } from "@/lib/api";
import { sugerirNombresCliente } from "@/lib/ia/nombres";
import { requireSesion } from "@/lib/sesion";

// Redactar con la IA tarda unos segundos.
export const maxDuration = 60;

/** Propone el nombre para el cliente de los insumos que no lo tienen. No guarda nada. Cuerpo: {}. */
export const POST = manejador(async (req: Request) => {
  const { usuario } = await requireSesion(req.headers);
  await leerJson(req, z.object({}));
  return NextResponse.json(await sugerirNombresCliente(usuario));
});
