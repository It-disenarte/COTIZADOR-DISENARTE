import { NextResponse } from "next/server";
import { manejador } from "@/lib/api";
import { requireSesion } from "@/lib/sesion";
import { obtenerSnapshot } from "@/lib/servicios/snapshot";

// Foto del catálogo para calcular el precio en vivo en el navegador.
export const GET = manejador(async (req) => {
  const { usuario } = await requireSesion(req.headers);
  return NextResponse.json({ snapshot: await obtenerSnapshot(usuario) });
});
