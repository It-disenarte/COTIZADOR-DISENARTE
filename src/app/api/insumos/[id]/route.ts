import { NextResponse } from "next/server";
import { leerJson, manejador } from "@/lib/api";
import { requirePermiso } from "@/lib/permisos";
import { requireSesion } from "@/lib/sesion";
import { actualizarInsumo } from "@/lib/servicios/insumos";
import { ActualizarInsumo } from "@/lib/validacion/catalogo";

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = manejador<Ctx>(async (req, { params }) => {
  const { usuario } = await requireSesion(req.headers);
  requirePermiso(usuario, "catalogo.editar");
  const { id } = await params;
  const cambios = await leerJson(req, ActualizarInsumo);
  return NextResponse.json({ insumo: await actualizarInsumo(usuario, id, cambios) });
});