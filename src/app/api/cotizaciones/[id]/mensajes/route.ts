import { NextResponse } from "next/server";
import { z } from "zod";
import { leerJson, manejador } from "@/lib/api";
import { requireSesion } from "@/lib/sesion";
import { mensajesDeCotizacion } from "@/lib/servicios/mensajes";

type Ctx = { params: Promise<{ id: string }> };

// Redactar con la IA tarda unos segundos.
export const maxDuration = 60;

/** Correo (Fase 2) y mensaje de WhatsApp (Fase 3) de una cotización autorizada. */
export const POST = manejador<Ctx>(async (req, { params }) => {
  const { usuario } = await requireSesion(req.headers);
  await leerJson(req, z.object({}));
  const { id } = await params;
  return NextResponse.json(await mensajesDeCotizacion(usuario, id));
});
