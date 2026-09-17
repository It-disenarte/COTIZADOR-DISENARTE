import { NextResponse } from "next/server";
import { leerJson, manejador } from "@/lib/api";
import { requirePermiso } from "@/lib/permisos";
import { requireSesion } from "@/lib/sesion";
import { crearUsuario, listarUsuarios } from "@/lib/servicios/usuarios";
import { CrearUsuario } from "@/lib/validacion/usuarios";

export const GET = manejador(async (req) => {
  const { usuario } = await requireSesion(req.headers);
  return NextResponse.json({ usuarios: await listarUsuarios(usuario) });
});

export const POST = manejador(async (req) => {
  const { usuario } = await requireSesion(req.headers);
  // El permiso se valida antes de leer el cuerpo para no filtrar reglas de validación.
  requirePermiso(usuario, "usuarios.gestionar");
  const datos = await leerJson(req, CrearUsuario);
  return NextResponse.json({ usuario: await crearUsuario(usuario, datos) }, { status: 201 });
});
