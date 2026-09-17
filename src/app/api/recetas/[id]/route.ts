import { NextResponse } from "next/server";
import { leerJson, manejador } from "@/lib/api";
import { requirePermiso } from "@/lib/permisos";
import { requireSesion } from "@/lib/sesion";
import { actualizarReceta, obtenerReceta } from "@/lib/servicios/recetas";
import { ActualizarReceta } from "@/lib/validacion/catalogo";

type Ctx = { params: Promise<{ id: string }> };

export const GET = manejador<Ctx>(async (req, { params }) => {
  const { usuario } = await requireSesion(req.headers);
  const { id } = await params;
  return NextResponse.json({ receta: await obtenerReceta(usuario, id) });
});

export const PATCH = manejador<Ctx>(async (req, { params }) => {
  const { usuario } = await requireSesion(req.headers);
  requirePermiso(usuario, "catalogo.editar");
  const { id } = await params;
  const cambios = await leerJson(req, ActualizarReceta);
  return NextResponse.json({ receta: await actualizarReceta(usuario, id, cambios) });
});