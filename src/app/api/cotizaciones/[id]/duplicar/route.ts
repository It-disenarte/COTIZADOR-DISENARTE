import { NextResponse } from "next/server";
import { z } from "zod";
import { leerJson, manejador } from "@/lib/api";
import { requireSesion } from "@/lib/sesion";
import { duplicarCotizacion } from "@/lib/servicios/cotizaciones";

type Ctx = { params: Promise<{ id: string }> };

/** Crea un borrador nuevo copiando la cotización. Cuerpo: {} (JSON, para exigir preflight). */
export const POST = manejador<Ctx>(async (req, { params }) => {
  const { usuario } = await requireSesion(req.headers);
  await leerJson(req, z.object({}));
  const { id } = await params;
  return NextResponse.json(await duplicarCotizacion(usuario, id), { status: 201 });
});
