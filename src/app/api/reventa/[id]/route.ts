import { NextResponse } from "next/server";
import { leerJson, manejador } from "@/lib/api";
import { requirePermiso } from "@/lib/permisos";
import { requireSesion } from "@/lib/sesion";
import { actualizarArticuloReventa } from "@/lib/servicios/reventa";
import { ActualizarArticuloReventa } from "@/lib/validacion/catalogo";

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = manejador<Ctx>(async (req, { params }) => {
  const { usuario } = await requireSesion(req.headers);
  requirePermiso(usuario, "catalogo.editar");
  const { id } = await params;
  const cambios = await leerJson(req, ActualizarArticuloReventa);
  return NextResponse.json({ articulo: await actualizarArticuloReventa(usuario, id, cambios) });
});