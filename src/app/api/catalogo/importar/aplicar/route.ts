import { NextResponse } from "next/server";
import { leerJson, manejador } from "@/lib/api";
import { requireSesion } from "@/lib/sesion";
import { aplicarImportacion } from "@/lib/servicios/importacion-catalogo";
import { AplicarImportacion } from "@/lib/validacion/importacion";

/** Aplica al catálogo los renglones confirmados en la revisión. Todo o nada. */
export const POST = manejador(async (req: Request) => {
  const { usuario } = await requireSesion(req.headers);
  const datos = await leerJson(req, AplicarImportacion);
  return NextResponse.json(await aplicarImportacion(usuario, datos));
});
