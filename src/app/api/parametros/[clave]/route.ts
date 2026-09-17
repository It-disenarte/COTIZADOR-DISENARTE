import { NextResponse } from "next/server";
import { leerJson, manejador } from "@/lib/api";
import { requirePermiso } from "@/lib/permisos";
import { requireSesion } from "@/lib/sesion";
import { actualizarParametro } from "@/lib/servicios/parametros";
import { ActualizarParametro } from "@/lib/validacion/catalogo";

type Ctx = { params: Promise<{ clave: string }> };

export const PATCH = manejador<Ctx>(async (req, { params }) => {
  const { usuario } = await requireSesion(req.headers);
  requirePermiso(usuario, "catalogo.editar");
  const { clave } = await params;
  const { valor } = await leerJson(req, ActualizarParametro);
  return NextResponse.json({ parametro: await actualizarParametro(usuario, clave, valor) });
});