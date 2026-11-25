import { NextResponse } from "next/server";
import { manejador } from "@/lib/api";
import { ErrorHttp } from "@/lib/errores";
import { requireSesion } from "@/lib/sesion";
import { borrarImagenInsumo, guardarImagenInsumo, leerImagenInsumo } from "@/lib/servicios/imagenes-insumo";

type Ctx = { params: Promise<{ id: string }> };

/** La imagen del insumo, para su ficha en el asistente y en el catálogo. */
export const GET = manejador<Ctx>(async (req, { params }) => {
  const { usuario } = await requireSesion(req.headers);
  const { id } = await params;
  const imagen = await leerImagenInsumo(usuario, id);
  const bytes = new Uint8Array(imagen.datos);
  return new Response(bytes as BodyInit, {
    headers: {
      "content-type": imagen.tipo,
      "content-length": String(bytes.byteLength),
      // La dirección lleva ?v=<versión>: al reemplazar la imagen cambia, así que esta copia nunca queda vieja.
      "cache-control": "private, max-age=86400, immutable",
      "x-content-type-options": "nosniff",
    },
  });
});

/**
 * Sube o reemplaza la imagen (multipart, campo "archivo"). Exige la cabecera x-cotizador, igual que las fotos de
 * las cotizaciones: un formulario de otro sitio no puede ponerla sin preflight.
 */
export const PUT = manejador<Ctx>(async (req, { params }) => {
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

  return NextResponse.json({ version: await guardarImagenInsumo(usuario, id, archivo) });
});

export const DELETE = manejador<Ctx>(async (req, { params }) => {
  const { usuario } = await requireSesion(req.headers);
  const { id } = await params;
  await borrarImagenInsumo(usuario, id);
  return NextResponse.json({ ok: true });
});
