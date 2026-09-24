import { NextResponse } from "next/server";
import { leerJson, manejador } from "@/lib/api";
import { requireSesion } from "@/lib/sesion";
import { calcularDistancia } from "@/lib/servicios/distancia";
import { PedirDistancia } from "@/lib/validacion/distancia";

// Dos consultas a OpenRouteService (buscar la dirección y trazar la ruta).
export const maxDuration = 30;

/** Km por carretera desde el taller de Diseñarte hasta una dirección (un solo trayecto). */
export const POST = manejador(async (req: Request) => {
  const { usuario } = await requireSesion(req.headers);
  const pedido = await leerJson(req, PedirDistancia);
  return NextResponse.json(await calcularDistancia(usuario, pedido));
});
