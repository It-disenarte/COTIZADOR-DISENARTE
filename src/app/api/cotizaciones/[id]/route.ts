import { NextResponse } from "next/server";
import { leerJson, manejador } from "@/lib/api";
import { requireSesion } from "@/lib/sesion";
import { cambiarEstadoCotizacion, guardarCotizacion, obtenerCotizacion } from "@/lib/servicios/cotizaciones";
import { CambiarEstado, GuardarCotizacion } from "@/lib/validacion/cotizaciones";

type Ctx = { params: Promise<{ id: string }> };

export const GET = manejador<Ctx>(async (req, { params }) => {
  const { usuario } = await requireSesion(req.headers);
  const { id } = await params;
  return NextResponse.json({ cotizacion: await obtenerCotizacion(usuario, id) });
});

// Autoguardado del borrador: recalcula en el servidor y actualiza la versión vigente.
export const PUT = manejador<Ctx>(async (req, { params }) => {
  const { usuario } = await requireSesion(req.headers);
  const { id } = await params;
  const datos = await leerJson(req, GuardarCotizacion);
  return NextResponse.json(await guardarCotizacion(usuario, datos, id));
});

export const PATCH = manejador<Ctx>(async (req, { params }) => {
  const { usuario } = await requireSesion(req.headers);
  const { id } = await params;
  const { estado } = await leerJson(req, CambiarEstado);
  return NextResponse.json({ cotizacion: await cambiarEstadoCotizacion(usuario, id, estado) });
});
