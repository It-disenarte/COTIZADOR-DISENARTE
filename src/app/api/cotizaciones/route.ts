import { NextResponse } from "next/server";
import { leerJson, manejador } from "@/lib/api";
import { requireSesion } from "@/lib/sesion";
import { guardarCotizacion, listarCotizaciones } from "@/lib/servicios/cotizaciones";
import { GuardarCotizacion } from "@/lib/validacion/cotizaciones";

export const GET = manejador(async (req) => {
  const { usuario } = await requireSesion(req.headers);
  const todas = new URL(req.url).searchParams.get("todas") === "1";
  return NextResponse.json({ cotizaciones: await listarCotizaciones(usuario, { todas }) });
});

export const POST = manejador(async (req) => {
  const { usuario } = await requireSesion(req.headers);
  const datos = await leerJson(req, GuardarCotizacion);
  return NextResponse.json(await guardarCotizacion(usuario, datos), { status: 201 });
});
