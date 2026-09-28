import { NextResponse } from "next/server";
import { z } from "zod";
import { leerJson, manejador } from "@/lib/api";
import { requireSesion } from "@/lib/sesion";
import { CANALES } from "@/lib/ia/mensajes";
import { mensajeDeCotizacion } from "@/lib/servicios/mensajes";

type Ctx = { params: Promise<{ id: string }> };

// Redactar con la IA tarda unos segundos.
export const maxDuration = 60;

/** Mensaje para mandar la propuesta autorizada, por correo o por WhatsApp. Cuerpo: { canal }. */
export const POST = manejador<Ctx>(async (req, { params }) => {
  const { usuario } = await requireSesion(req.headers);
  const { canal } = await leerJson(req, z.object({ canal: z.enum(CANALES, { error: "Elige correo o WhatsApp." }) }));
  const { id } = await params;
  return NextResponse.json(await mensajeDeCotizacion(usuario, id, canal));
});
