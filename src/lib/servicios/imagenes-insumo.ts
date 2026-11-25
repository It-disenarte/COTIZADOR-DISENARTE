import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { imagenesInsumo, insumos } from "@/lib/db/schema";
import { ErrorHttp } from "@/lib/errores";
import { requirePermiso, type UsuarioSesion } from "@/lib/permisos";
import { exigirUuid, noEncontrado } from "./comun";
import { TAMANO_MAXIMO_IMAGEN, tipoReal } from "./imagenes";

/**
 * Versión de una imagen: cambia cada vez que se reemplaza. Va en la dirección de la imagen (?v=) para que el
 * navegador la guarde mucho tiempo sin enseñar una foto vieja después de cambiarla.
 */
export const versionDeImagen = (fecha: Date): string => String(fecha.getTime());

/** Qué insumos tienen imagen y su versión. No trae los bytes: se usa al listar el catálogo. */
export async function versionesDeImagenesInsumo(): Promise<Map<string, string>> {
  const filas = await db.select({ id: imagenesInsumo.insumoId, actualizadoEn: imagenesInsumo.actualizadoEn }).from(imagenesInsumo);
  return new Map(filas.map((f) => [f.id, versionDeImagen(f.actualizadoEn)]));
}

/** Pone o reemplaza la imagen de un insumo. Devuelve su versión. */
export async function guardarImagenInsumo(actor: UsuarioSesion | null, insumoId: string, archivo: File): Promise<string> {
  requirePermiso(actor, "catalogo.editar");
  exigirUuid(insumoId, "Insumo");

  if (archivo.size === 0) throw new ErrorHttp(400, "El archivo está vacío.", "IMAGEN_VACIA");
  if (archivo.size > TAMANO_MAXIMO_IMAGEN) throw new ErrorHttp(413, "La imagen pesa más de 3 MB.", "IMAGEN_PESADA");
  const bytes = new Uint8Array(await archivo.arrayBuffer());
  const tipo = tipoReal(bytes);
  if (!tipo) throw new ErrorHttp(415, "Solo se aceptan imágenes JPG o PNG.", "IMAGEN_TIPO");

  const [insumo] = await db.select({ id: insumos.id }).from(insumos).where(eq(insumos.id, insumoId));
  if (!insumo) noEncontrado("Insumo");

  const ahora = new Date();
  const valores = { tipo, tamano: bytes.byteLength, datos: Buffer.from(bytes), subidaPor: actor?.id ?? null, actualizadoEn: ahora };
  const [fila] = await db
    .insert(imagenesInsumo)
    .values({ insumoId, ...valores })
    .onConflictDoUpdate({ target: imagenesInsumo.insumoId, set: valores })
    .returning({ actualizadoEn: imagenesInsumo.actualizadoEn });
  return versionDeImagen(fila.actualizadoEn);
}

export async function leerImagenInsumo(actor: UsuarioSesion | null, insumoId: string) {
  requirePermiso(actor, "catalogo.ver");
  exigirUuid(insumoId, "Insumo");
  const [imagen] = await db
    .select({ tipo: imagenesInsumo.tipo, datos: imagenesInsumo.datos })
    .from(imagenesInsumo)
    .where(eq(imagenesInsumo.insumoId, insumoId));
  if (!imagen) noEncontrado("Imagen");
  return imagen;
}

export async function borrarImagenInsumo(actor: UsuarioSesion | null, insumoId: string): Promise<void> {
  requirePermiso(actor, "catalogo.editar");
  exigirUuid(insumoId, "Insumo");
  const borradas = await db.delete(imagenesInsumo).where(eq(imagenesInsumo.insumoId, insumoId)).returning({ id: imagenesInsumo.insumoId });
  if (borradas.length === 0) noEncontrado("Imagen");
}
