import { NextResponse } from "next/server";
import { leerJson, manejador } from "@/lib/api";
import { requirePermiso } from "@/lib/permisos";
import { requireSesion } from "@/lib/sesion";
import { crearInsumo, listarInsumos } from "@/lib/servicios/insumos";
import { CrearInsumo } from "@/lib/validacion/catalogo";

export const GET = manejador(async (req) => {
  const { usuario } = await requireSesion(req.headers);
  return NextResponse.json({ insumos: await listarInsumos(usuario) });
});

export const POST = manejador(async (req) => {
  const { usuario } = await requireSesion(req.headers);
  requirePermiso(usuario, "catalogo.editar");
  const datos = await leerJson(req, CrearInsumo);
  return NextResponse.json({ insumo: await crearInsumo(usuario, datos) }, { status: 201 });
});