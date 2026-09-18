import { NextResponse } from "next/server";
import { manejador } from "@/lib/api";
import { ErrorHttp } from "@/lib/errores";
import { leerLevantamiento } from "@/lib/ia/tareas";
import { requireSesion } from "@/lib/sesion";

// Leer un PDF puede tardar; Vercel corta a los 10-15 s si no se amplía.
export const maxDuration = 60;

/**
 * Lee un levantamiento (PDF o imagen) con Gemini y devuelve la tabla propuesta.
 * No guarda nada en la cotización: el vendedor la revisa y decide si la usa.
 * Exige la cabecera x-cotizador, igual que la subida de fotos (protección CSRF).
 */
export const POST = manejador(async (req: Request) => {
  if (req.headers.get("x-cotizador") !== "1") throw new ErrorHttp(400, "Petición no válida.", "CABECERA");
  const { usuario } = await requireSesion(req.headers);

  let formulario: FormData;
  try {
    formulario = await req.formData();
  } catch {
    throw new ErrorHttp(400, "Se esperaba un formulario con el archivo.", "FORMULARIO");
  }
  const archivo = formulario.get("archivo");
  if (!(archivo instanceof File) || archivo.size === 0) throw new ErrorHttp(400, "Falta el archivo.", "ARCHIVO_FALTA");
  const instruccion = String(formulario.get("instruccion") ?? "").slice(0, 1000);

  const resultado = await leerLevantamiento(
    usuario,
    { nombre: archivo.name, tipo: archivo.type, bytes: new Uint8Array(await archivo.arrayBuffer()) },
    instruccion,
  );
  return NextResponse.json(resultado);
});
