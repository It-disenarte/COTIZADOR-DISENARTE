import { NextResponse } from "next/server";
import { leerJson, manejador } from "@/lib/api";
import { requireSesion } from "@/lib/sesion";
import { listarParametros } from "@/lib/servicios/parametros";
import { crearServicioDigital, listarServiciosDigitales } from "@/lib/servicios/servicios-digitales";
import { CrearServicioDigital } from "@/lib/validacion/catalogo";

// Catálogo de servicios digitales: lo leen todos (para cotizar); lo editan admin y agente_admin.
export const GET = manejador(async (req) => {
  const { usuario } = await requireSesion(req.headers);
  const [servicios, parametros] = await Promise.all([listarServiciosDigitales(usuario), listarParametros(usuario)]);
  // El IVA va aparte en los pagos únicos: el asistente lo necesita para el precio en vivo.
  const iva = parametros.find((p) => p.clave === "iva")?.valor ?? "0.16";
  return NextResponse.json({ servicios, iva });
});

export const POST = manejador(async (req) => {
  const { usuario } = await requireSesion(req.headers);
  const datos = await leerJson(req, CrearServicioDigital);
  return NextResponse.json({ servicio: await crearServicioDigital(usuario, datos) }, { status: 201 });
});
