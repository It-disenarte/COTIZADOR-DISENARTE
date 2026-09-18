import { NextResponse } from "next/server";
import { manejador } from "@/lib/api";
import { requireSesion } from "@/lib/sesion";
import { borrarImagen, leerImagen } from "@/lib/servicios/imagenes";

type Ctx = { params: Promise<{ id: string; imagenId: string }> };

/** Devuelve la imagen para la vista previa del asistente. */
export const GET = manejador<Ctx>(async (req, { params }) => {
  const { usuario } = await requireSesion(req.headers);
  const { id, imagenId } = await params;
  const imagen = await leerImagen(usuario, id, imagenId);
  const bytes = new Uint8Array(imagen.datos);

  return new Response(bytes as BodyInit, {
    headers: {
      "content-type": imagen.tipo,
      "content-length": String(bytes.byteLength),
      // Una imagen subida nunca cambia (si se reemplaza, cambia el id).
      "cache-control": "private, max-age=86400, immutable",
      "x-content-type-options": "nosniff",
    },
  });
});

export const DELETE = manejador<Ctx>(async (req, { params }) => {
  const { usuario } = await requireSesion(req.headers);
  const { id, imagenId } = await params;
  await borrarImagen(usuario, id, imagenId);
  return NextResponse.json({ ok: true });
});
