import { NextResponse } from "next/server";
import { manejador } from "@/lib/api";
import { requireSesion } from "@/lib/sesion";
import { listarParametros } from "@/lib/servicios/parametros";

export const GET = manejador(async (req) => {
  const { usuario } = await requireSesion(req.headers);
  return NextResponse.json({ parametros: await listarParametros(usuario) });
});