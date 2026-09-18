import { NextResponse } from "next/server";
import { manejador } from "@/lib/api";
import { ErrorHttp } from "@/lib/errores";
import { requireSesion } from "@/lib/sesion";
import { analizarArchivoCostos } from "@/lib/servicios/importacion-catalogo";

// La IA puede tardar en leer un PDF o un Excel de varias hojas.
export const maxDuration = 60;

/**
 * Analiza un archivo de costos (Excel, PDF o imagen) y devuelve la propuesta de cambios.
 * No modifica el catálogo. Exige la cabecera x-cotizador (protección CSRF para multipart).
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
  if (!(archivo instanceof File)) throw new ErrorHttp(400, "Falta el archivo.", "ARCHIVO_FALTA");

  const propuesta = await analizarArchivoCostos(usuario, {
    nombre: archivo.name.slice(0, 200),
    tipo: archivo.type,
    bytes: new Uint8Array(await archivo.arrayBuffer()),
  });
  return NextResponse.json(propuesta);
});
