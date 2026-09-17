import { NextResponse } from "next/server";
import { leerJson, manejador } from "@/lib/api";
import { ErrorHttp } from "@/lib/errores";
import { calcular, ErrorMotor, type EntradaCotizacion as EntradaMotor } from "@/lib/motor";
import { requirePermiso } from "@/lib/permisos";
import { requireSesion } from "@/lib/sesion";
import { obtenerSnapshot } from "@/lib/servicios/snapshot";
import { EntradaCotizacion } from "@/lib/validacion/cotizacion";

/** Cálculo en vivo: devuelve precios y alertas sin guardar nada. */
export const POST = manejador(async (req) => {
  const { usuario } = await requireSesion(req.headers);
  requirePermiso(usuario, "cotizaciones.propias");

  const entrada = await leerJson(req, EntradaCotizacion);
  const snapshot = await obtenerSnapshot(usuario);

  try {
    return NextResponse.json({ resultado: calcular(entrada as EntradaMotor, snapshot) });
  } catch (error) {
    // Los datos faltantes del catálogo son un 400 con mensaje claro, no un 500.
    if (error instanceof ErrorMotor) throw new ErrorHttp(400, error.message, error.codigo);
    throw error;
  }
});
