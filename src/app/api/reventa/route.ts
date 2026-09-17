import { NextResponse } from "next/server";
import { leerJson, manejador } from "@/lib/api";
import { requirePermiso } from "@/lib/permisos";
import { requireSesion } from "@/lib/sesion";
import { crearArticuloReventa, listarReventa } from "@/lib/servicios/reventa";
import { CrearArticuloReventa } from "@/lib/validacion/catalogo";

export const GET = manejador(async (req) => {
  const { usuario } = await requireSesion(req.headers);
  return NextResponse.json({ articulos: await listarReventa(usuario) });
});

export const POST = manejador(async (req) => {
  const { usuario } = await requireSesion(req.headers);
  requirePermiso(usuario, "catalogo.editar");
  const datos = await leerJson(req, CrearArticuloReventa);
  return NextResponse.json({ articulo: await crearArticuloReventa(usuario, datos) }, { status: 201 });
});