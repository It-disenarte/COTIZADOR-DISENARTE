import { NextResponse } from "next/server";
import { leerJson, manejador } from "@/lib/api";
import { requirePermiso } from "@/lib/permisos";
import { requireSesion } from "@/lib/sesion";
import { crearReceta, listarRecetas } from "@/lib/servicios/recetas";
import { CrearReceta } from "@/lib/validacion/catalogo";

export const GET = manejador(async (req) => {
  const { usuario } = await requireSesion(req.headers);
  return NextResponse.json({ recetas: await listarRecetas(usuario) });
});

export const POST = manejador(async (req) => {
  const { usuario } = await requireSesion(req.headers);
  requirePermiso(usuario, "catalogo.editar");
  const datos = await leerJson(req, CrearReceta);
  return NextResponse.json({ receta: await crearReceta(usuario, datos) }, { status: 201 });
});