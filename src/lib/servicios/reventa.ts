import { asc, eq } from "drizzle-orm";
import { registrarBitacora } from "@/lib/bitacora";
import { db } from "@/lib/db";
import { articulosReventa } from "@/lib/db/schema";
import { requirePermiso, type UsuarioSesion } from "@/lib/permisos";
import type { ActualizarArticuloReventa, CrearArticuloReventa } from "@/lib/validacion/catalogo";
import { exigirUuid, noEncontrado, paraBitacora, soloDefinidos } from "./comun";

export type ArticuloReventa = typeof articulosReventa.$inferSelect;
const ENTIDAD = "articulos_reventa";

export async function listarReventa(actor: UsuarioSesion | null): Promise<ArticuloReventa[]> {
  requirePermiso(actor, "catalogo.ver");
  return db.select().from(articulosReventa).orderBy(asc(articulosReventa.nombre));
}

export async function crearArticuloReventa(actor: UsuarioSesion | null, datos: CrearArticuloReventa): Promise<ArticuloReventa> {
  requirePermiso(actor, "catalogo.editar");
  return db.transaction(async (tx) => {
    const [nuevo] = await tx.insert(articulosReventa).values(datos).returning();
    await registrarBitacora(tx, {
      usuarioId: actor.id,
      entidad: ENTIDAD,
      entidadId: nuevo.id,
      accion: "crear",
      despues: paraBitacora(nuevo),
    });
    return nuevo;
  });
}

export async function actualizarArticuloReventa(
  actor: UsuarioSesion | null,
  id: string,
  cambios: ActualizarArticuloReventa,
): Promise<ArticuloReventa> {
  requirePermiso(actor, "catalogo.editar");
  exigirUuid(id, "Artículo");
  return db.transaction(async (tx) => {
    const [antes] = await tx.select().from(articulosReventa).where(eq(articulosReventa.id, id));
    if (!antes) noEncontrado("Artículo");
    const [despues] = await tx
      .update(articulosReventa)
      .set(soloDefinidos(cambios))
      .where(eq(articulosReventa.id, id))
      .returning();
    await registrarBitacora(tx, {
      usuarioId: actor.id,
      entidad: ENTIDAD,
      entidadId: id,
      accion: cambios.archivado === true && !antes.archivado ? "archivar" : "editar",
      antes: paraBitacora(antes),
      despues: paraBitacora(despues),
    });
    return despues;
  });
}
