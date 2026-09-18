import { NextResponse } from "next/server";
import { leerJson, manejador } from "@/lib/api";
import { precioDeReventa } from "@/lib/ia/tareas";
import { requireSesion } from "@/lib/sesion";
import { PedirPrecioReventa } from "@/lib/validacion/ia";

// La búsqueda en Google suma unos segundos a la respuesta.
export const maxDuration = 60;

/** Busca un precio de referencia con fuentes. El resultado siempre llega como "sin verificar". */
export const POST = manejador(async (req: Request) => {
  const { usuario } = await requireSesion(req.headers);
  const datos = await leerJson(req, PedirPrecioReventa);
  return NextResponse.json(await precioDeReventa(usuario, datos));
});
