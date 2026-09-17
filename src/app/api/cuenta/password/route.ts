import { NextResponse } from "next/server";
import { leerJson, manejador } from "@/lib/api";
import { requireSesion } from "@/lib/sesion";
import { cambiarPasswordPropia } from "@/lib/servicios/usuarios";
import { CambiarPassword } from "@/lib/validacion/usuarios";

/** Cambio de contraseña propia. Es el único endpoint disponible mientras el cambio es obligatorio. */
export const POST = manejador(async (req) => {
  const sesion = await requireSesion(req.headers, { permitirCambioPendiente: true });
  const datos = await leerJson(req, CambiarPassword);
  await cambiarPasswordPropia(sesion, datos);
  return NextResponse.json({ ok: true });
});
