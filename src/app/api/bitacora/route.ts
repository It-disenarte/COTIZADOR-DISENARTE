import { NextResponse } from "next/server";
import { manejador } from "@/lib/api";
import { requirePermiso } from "@/lib/permisos";
import { requireSesion } from "@/lib/sesion";
import { FiltrosBitacora, listarBitacora } from "@/lib/servicios/bitacora";

export const GET = manejador(async (req) => {
  const { usuario } = await requireSesion(req.headers);
  requirePermiso(usuario, "bitacora.ver");
  const filtros = FiltrosBitacora.parse(Object.fromEntries(new URL(req.url).searchParams));
  return NextResponse.json(await listarBitacora(usuario, filtros));
});