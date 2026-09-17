import { NextResponse } from "next/server";
import { leerJson, manejador } from "@/lib/api";
import { requirePermiso } from "@/lib/permisos";
import { requireSesion } from "@/lib/sesion";
import { restablecerPassword } from "@/lib/servicios/usuarios";
import { RestablecerPassword } from "@/lib/validacion/usuarios";

type Ctx = { params: Promise<{ id: string }> };

/** Admin: asigna una contraseña temporal y obliga a cambiarla en el siguiente inicio de sesión. */
export const POST = manejador<Ctx>(async (req, { params }) => {
  const { usuario } = await requireSesion(req.headers);
  requirePermiso(usuario, "usuarios.gestionar");
  const { id } = await params;
  const { passwordTemporal } = await leerJson(req, RestablecerPassword);
  await restablecerPassword(usuario, id, passwordTemporal);
  return NextResponse.json({ ok: true });
});
