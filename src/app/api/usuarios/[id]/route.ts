import { NextResponse } from "next/server";
import { leerJson, manejador } from "@/lib/api";
import { requirePermiso } from "@/lib/permisos";
import { requireSesion } from "@/lib/sesion";
import { actualizarUsuario } from "@/lib/servicios/usuarios";
import { ActualizarUsuario } from "@/lib/validacion/usuarios";

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = manejador<Ctx>(async (req, { params }) => {
  const { usuario } = await requireSesion(req.headers);
  requirePermiso(usuario, "usuarios.gestionar");
  const { id } = await params;
  const cambios = await leerJson(req, ActualizarUsuario);
  return NextResponse.json({ usuario: await actualizarUsuario(usuario, id, cambios) });
});
