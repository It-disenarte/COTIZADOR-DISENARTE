import { NextResponse } from "next/server";
import { leerJson, manejador } from "@/lib/api";
import { requireSesion } from "@/lib/sesion";
import { actualizarCliente } from "@/lib/servicios/clientes";
import { ActualizarCliente } from "@/lib/validacion/catalogo";

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = manejador<Ctx>(async (req, { params }) => {
  const { usuario } = await requireSesion(req.headers);
  const { id } = await params;
  const cambios = await leerJson(req, ActualizarCliente);
  return NextResponse.json({ cliente: await actualizarCliente(usuario, id, cambios) });
});