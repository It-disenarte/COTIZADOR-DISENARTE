import "server-only";
import { NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { ErrorHttp } from "@/lib/errores";

export function respuestaError(error: unknown): NextResponse {
  if (error instanceof ErrorHttp) {
    return NextResponse.json({ error: error.message, codigo: error.codigo }, { status: error.status });
  }
  if (error instanceof ZodError) {
    return NextResponse.json(
      { error: "Datos inválidos.", codigo: "VALIDACION", detalles: z.flattenError(error).fieldErrors },
      { status: 400 },
    );
  }
  console.error("[api] error no controlado", error);
  return NextResponse.json({ error: "Error interno." }, { status: 500 });
}

/** Envuelve un route handler para convertir errores en respuestas JSON. */
export function manejador<C>(fn: (req: Request, ctx: C) => Promise<Response>) {
  return async (req: Request, ctx: C): Promise<Response> => {
    try {
      return await fn(req, ctx);
    } catch (error) {
      return respuestaError(error);
    }
  };
}

/** Lee y valida el cuerpo JSON. Exigir application/json obliga al navegador a hacer preflight en peticiones de otro origen. */
export async function leerJson<T extends z.ZodType>(req: Request, esquema: T): Promise<z.infer<T>> {
  if (!req.headers.get("content-type")?.includes("application/json")) {
    throw new ErrorHttp(415, "Se esperaba JSON.", "TIPO_CONTENIDO");
  }
  let cuerpo: unknown;
  try {
    cuerpo = await req.json();
  } catch {
    throw new ErrorHttp(400, "JSON mal formado.", "JSON_INVALIDO");
  }
  return esquema.parse(cuerpo);
}
