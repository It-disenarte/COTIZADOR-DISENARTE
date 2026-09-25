import { NextResponse } from "next/server";
import { z } from "zod";
import { leerJson, manejador } from "@/lib/api";
import { requireSesion } from "@/lib/sesion";
import { autorizarCotizacion } from "@/lib/servicios/cotizaciones";

type Ctx = { params: Promise<{ id: string }> };

/**
 * Autoriza el análisis de costos (PNO-COM-01, Fase 1). Sin esto no se genera la propuesta.
 * Cuerpo: {} (JSON, para exigir preflight).
 */
export const POST = manejador<Ctx>(async (req, { params }) => {
  const { usuario } = await requireSesion(req.headers);
  await leerJson(req, z.object({}));
  const { id } = await params;
  const cotizacion = await autorizarCotizacion(usuario, id);
  return NextResponse.json({ autorizadaEn: cotizacion.autorizadaEn });
});
