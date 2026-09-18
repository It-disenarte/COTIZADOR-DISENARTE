import { NextResponse } from "next/server";
import { leerJson, manejador } from "@/lib/api";
import { redactarAlcance } from "@/lib/ia/tareas";
import { requireSesion } from "@/lib/sesion";
import { PedirAlcance } from "@/lib/validacion/ia";

export const maxDuration = 60;

/** Redacta concepto y resumen para el PDF, solo con los datos que ya tiene la cotización. */
export const POST = manejador(async (req: Request) => {
  const { usuario } = await requireSesion(req.headers);
  const datos = await leerJson(req, PedirAlcance);
  return NextResponse.json(
    await redactarAlcance(usuario, {
      ...datos,
      tiempoEstimado: datos.tiempoEstimado ?? null,
      recetas: datos.recetas.map((r) => ({ nombre: r.nombre, descripcion: r.descripcion ?? null })),
    }),
  );
});
