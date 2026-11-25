import { NextResponse } from "next/server";
import { manejador } from "@/lib/api";
import { requireSesion } from "@/lib/sesion";
import { agregarInsumoAProveedor, quitarInsumoDeProveedor } from "@/lib/servicios/proveedores";

type Ctx = { params: Promise<{ id: string; insumoId: string }> };

export const PUT = manejador<Ctx>(async (req, { params }) => {
  const { usuario } = await requireSesion(req.headers);
  const { id, insumoId } = await params;
  await agregarInsumoAProveedor(usuario, id, insumoId);
  return NextResponse.json({ ok: true });
});

export const DELETE = manejador<Ctx>(async (req, { params }) => {
  const { usuario } = await requireSesion(req.headers);
  const { id, insumoId } = await params;
  await quitarInsumoDeProveedor(usuario, id, insumoId);
  return NextResponse.json({ ok: true });
});
