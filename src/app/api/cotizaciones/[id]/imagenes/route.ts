import { NextResponse } from "next/server";
import { manejador } from "@/lib/api";
import { ErrorHttp } from "@/lib/errores";
import { requireSesion } from "@/lib/sesion";
import { subirImagen } from "@/lib/servicios/imagenes";

type Ctx = { params: Promise<{ id: string }> };

/**
 * Sube una foto de referencia (multipart, campo "archivo").
 * Exige la cabecera x-cotizador: un formulario de otro sitio no puede ponerla
 * sin preflight, así que equivale a la protección que da exigir JSON en las demás rutas.
 */
export const POST = manejador<Ctx>(async (req, { params }) => {
  if (req.headers.get("x-cotizador") !== "1") throw new ErrorHttp(400, "Petición no válida.", "CABECERA");
  const { usuario } = await requireSesion(req.headers);
  const { id } = await params;

  let formulario: FormData;
  try {
    formulario = await req.formData();
  } catch {
    throw new ErrorHttp(400, "Se esperaba un formulario con la imagen.", "FORMULARIO");
  }
  const archivo = formulario.get("archivo");
  if (!(archivo instanceof File)) throw new ErrorHttp(400, "Falta la imagen.", "IMAGEN_FALTA");

  const imagen = await subirImagen(usuario, id, archivo);
  return NextResponse.json(imagen, { status: 201 });
});
