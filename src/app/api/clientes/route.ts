import { NextResponse } from "next/server";
import { leerJson, manejador } from "@/lib/api";
import { requireSesion } from "@/lib/sesion";
import { crearCliente, listarClientes } from "@/lib/servicios/clientes";
import { CrearCliente } from "@/lib/validacion/catalogo";

export const GET = manejador(async (req) => {
  const { usuario } = await requireSesion(req.headers);
  return NextResponse.json({ clientes: await listarClientes(usuario) });
});

export const POST = manejador(async (req) => {
  const { usuario } = await requireSesion(req.headers);
  const datos = await leerJson(req, CrearCliente);
  return NextResponse.json({ cliente: await crearCliente(usuario, datos) }, { status: 201 });
});