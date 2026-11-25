import { NextResponse } from "next/server";
import { leerJson, manejador } from "@/lib/api";
import { requirePermiso } from "@/lib/permisos";
import { requireSesion } from "@/lib/sesion";
import { crearProveedor, listarProveedores } from "@/lib/servicios/proveedores";
import { CrearProveedor } from "@/lib/validacion/catalogo";

export const GET = manejador(async (req) => {
  const { usuario } = await requireSesion(req.headers);
  return NextResponse.json({ proveedores: await listarProveedores(usuario) });
});

export const POST = manejador(async (req) => {
  const { usuario } = await requireSesion(req.headers);
  requirePermiso(usuario, "catalogo.editar");
  const datos = await leerJson(req, CrearProveedor);
  return NextResponse.json({ proveedor: await crearProveedor(usuario, datos) }, { status: 201 });
});
