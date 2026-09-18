import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { cotizaciones, imagenesCotizacion } from "@/lib/db/schema";
import { ErrorHttp } from "@/lib/errores";
import { requireVerCotizacion, type UsuarioSesion } from "@/lib/permisos";
import type { ImagenPdf } from "@/lib/pdf/documento";
import { exigirUuid, noEncontrado } from "./comun";
import { exigirEditable } from "./cotizaciones";

/** Solo JPG y PNG: son los formatos que se pueden incrustar en el PDF. */
export const TIPOS_IMAGEN = ["image/jpeg", "image/png"] as const;
/** El navegador ya la reduce antes de subirla; esto es solo el tope de seguridad. */
export const TAMANO_MAXIMO_IMAGEN = 3 * 1024 * 1024;

async function cotizacionAccesible(actor: UsuarioSesion | null, cotizacionId: string) {
  exigirUuid(cotizacionId, "Cotización");
  const [cotizacion] = await db
    .select({ vendedorId: cotizaciones.vendedorId, estado: cotizaciones.estado })
    .from(cotizaciones)
    .where(eq(cotizaciones.id, cotizacionId));
  if (!cotizacion) noEncontrado("Cotización");
  requireVerCotizacion(actor, cotizacion);
  return cotizacion;
}

/** Revisa la firma real del archivo, no solo lo que dice el navegador. */
function tipoReal(bytes: Uint8Array): (typeof TIPOS_IMAGEN)[number] | null {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "image/png";
  return null;
}

export async function subirImagen(actor: UsuarioSesion | null, cotizacionId: string, archivo: File) {
  const cotizacion = await cotizacionAccesible(actor, cotizacionId);
  exigirEditable(cotizacion);

  if (archivo.size === 0) throw new ErrorHttp(400, "El archivo está vacío.", "IMAGEN_VACIA");
  if (archivo.size > TAMANO_MAXIMO_IMAGEN) {
    throw new ErrorHttp(413, "La imagen pesa más de 3 MB.", "IMAGEN_PESADA");
  }

  const bytes = new Uint8Array(await archivo.arrayBuffer());
  const tipo = tipoReal(bytes);
  if (!tipo) throw new ErrorHttp(415, "Solo se aceptan imágenes JPG o PNG.", "IMAGEN_TIPO");

  const [imagen] = await db
    .insert(imagenesCotizacion)
    .values({
      cotizacionId,
      nombre: archivo.name.slice(0, 200) || "imagen",
      tipo,
      tamano: bytes.byteLength,
      datos: Buffer.from(bytes),
      subidaPor: actor?.id ?? null,
    })
    .returning({ id: imagenesCotizacion.id, nombre: imagenesCotizacion.nombre });
  return imagen;
}

export async function leerImagen(actor: UsuarioSesion | null, cotizacionId: string, imagenId: string) {
  await cotizacionAccesible(actor, cotizacionId);
  exigirUuid(imagenId, "Imagen");
  const [imagen] = await db
    .select({ tipo: imagenesCotizacion.tipo, datos: imagenesCotizacion.datos })
    .from(imagenesCotizacion)
    .where(and(eq(imagenesCotizacion.id, imagenId), eq(imagenesCotizacion.cotizacionId, cotizacionId)));
  if (!imagen) noEncontrado("Imagen");
  return imagen;
}

export async function borrarImagen(actor: UsuarioSesion | null, cotizacionId: string, imagenId: string) {
  exigirEditable(await cotizacionAccesible(actor, cotizacionId));
  exigirUuid(imagenId, "Imagen");
  const borradas = await db
    .delete(imagenesCotizacion)
    .where(and(eq(imagenesCotizacion.id, imagenId), eq(imagenesCotizacion.cotizacionId, cotizacionId)))
    .returning({ id: imagenesCotizacion.id });
  if (borradas.length === 0) noEncontrado("Imagen");
}

/** Imágenes de las opciones de una cotización, listas para el PDF (por id de receta). */
export async function imagenesParaPdf(
  cotizacionId: string,
  opciones: { recetaId: string; imagenId?: string | null }[],
): Promise<Map<string, ImagenPdf>> {
  const ids = opciones.map((o) => o.imagenId).filter((id): id is string => !!id);
  if (ids.length === 0) return new Map();

  const filas = await db
    .select({ id: imagenesCotizacion.id, tipo: imagenesCotizacion.tipo, datos: imagenesCotizacion.datos })
    .from(imagenesCotizacion)
    .where(and(eq(imagenesCotizacion.cotizacionId, cotizacionId), inArray(imagenesCotizacion.id, ids)));
  const porId = new Map(filas.map((f) => [f.id, f]));

  const salida = new Map<string, ImagenPdf>();
  for (const opcion of opciones) {
    const fila = opcion.imagenId ? porId.get(opcion.imagenId) : undefined;
    if (fila) salida.set(opcion.recetaId, { bytes: new Uint8Array(fila.datos), tipo: fila.tipo });
  }
  return salida;
}
