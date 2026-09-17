import { NextResponse } from "next/server";
import { leerJson, manejador } from "@/lib/api";
import { crearPrimerAdmin } from "@/lib/servicios/configuracion-inicial";
import { PrimerAdmin } from "@/lib/validacion/usuarios";

/** Público solo mientras no exista ninguna cuenta; después responde 409 siempre. */
export const POST = manejador(async (req) => {
  const datos = await leerJson(req, PrimerAdmin);
  await crearPrimerAdmin(datos);
  return NextResponse.json({ ok: true }, { status: 201 });
});
