import { NextResponse } from "next/server";
import { leerJson, manejador } from "@/lib/api";
import { requireSesion } from "@/lib/sesion";
import { guardarNombresCliente } from "@/lib/servicios/insumos";
import { GuardarNombresCliente } from "@/lib/validacion/catalogo";

/** Guarda los nombres para el cliente revisados en el catálogo. Cuerpo: { cambios: [{ id, nombreCliente }] }. */
export const PUT = manejador(async (req: Request) => {
  const { usuario } = await requireSesion(req.headers);
  const datos = await leerJson(req, GuardarNombresCliente);
  return NextResponse.json({ guardados: await guardarNombresCliente(usuario, datos) });
});
