import { NextResponse } from "next/server";
import { leerJson, manejador } from "@/lib/api";
import { requirePermiso } from "@/lib/permisos";
import { requireSesion } from "@/lib/sesion";
import { actualizarProveedor, eliminarProveedor } from "@/lib/servicios/proveedores";
import { ActualizarProveedor } from "@/lib/validacion/catalogo";

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = manejador<Ctx>(async (req, { params }) => {
  const { usuario } = await requireSesion(req.headers);
  requirePermiso(usuario, "catalogo.editar");
  const { id } = await params;
  const cambios = await leerJson(req, ActualizarProveedor);
  return NextResponse.json({ proveedor: await actualizarProveedor(usuario, id, cambios) });
});

export const DELETE = manejador<Ctx>(async (req, { params }) => {
  const { usuario } = await requireSesion(req.headers);
  requirePermiso(usuario, "catalogo.editar");
  const { id } = await params;
  await eliminarProveedor(usuario, id);
  return NextResponse.json({ ok: true });
});
