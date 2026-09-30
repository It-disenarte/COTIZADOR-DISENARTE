import { NextResponse } from "next/server";
import { leerJson, manejador } from "@/lib/api";
import { requireSesion } from "@/lib/sesion";
import { actualizarServicioDigital } from "@/lib/servicios/servicios-digitales";
import { ActualizarServicioDigital } from "@/lib/validacion/catalogo";

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = manejador<Ctx>(async (req, { params }) => {
  const { usuario } = await requireSesion(req.headers);
  const { id } = await params;
  const cambios = await leerJson(req, ActualizarServicioDigital);
  return NextResponse.json({ servicio: await actualizarServicioDigital(usuario, id, cambios) });
});
