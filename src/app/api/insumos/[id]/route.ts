import { NextResponse } from "next/server";
import { leerJson, manejador } from "@/lib/api";
import { requirePermiso } from "@/lib/permisos";
import { requireSesion } from "@/lib/sesion";
import { actualizarInsumo, eliminarInsumo } from "@/lib/servicios/insumos";
import { ActualizarInsumo } from "@/lib/validacion/catalogo";

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = manejador<Ctx>(async (req, { params }) => {
  const { usuario } = await requireSesion(req.headers);
  requirePermiso(usuario, "catalogo.editar");
  const { id } = await params;
  const cambios = await leerJson(req, ActualizarInsumo);
  return NextResponse.json({ insumo: await actualizarInsumo(usuario, id, cambios) });
});
export const DELETE = manejador<Ctx>(async (req, { params }) => {
  const { usuario } = await requireSesion(req.headers);
  requirePermiso(usuario, "catalogo.editar");
  const { id } = await params;
  await eliminarInsumo(usuario, id);
  return NextResponse.json({ ok: true });
});
