import { asc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { insumos, proveedores } from "@/lib/db/schema";
import { requirePermiso, type UsuarioSesion } from "@/lib/permisos";
import type { ActualizarProveedor, CrearProveedor } from "@/lib/validacion/catalogo";
import { exigirUuid, noEncontrado, soloDefinidos } from "./comun";

export type Proveedor = typeof proveedores.$inferSelect & { totalInsumos: number };

export async function listarProveedores(actor: UsuarioSesion | null): Promise<Proveedor[]> {
  requirePermiso(actor, "catalogo.ver");
  const filas = await db
    .select({
      proveedor: proveedores,
      totalInsumos: sql<number>`count(${insumos.id})::int`,
    })
    .from(proveedores)
    .leftJoin(insumos, eq(insumos.proveedorId, proveedores.id))
    .groupBy(proveedores.id)
    .orderBy(asc(proveedores.nombre));
  return filas.map((f) => ({ ...f.proveedor, totalInsumos: f.totalInsumos }));
}

export async function crearProveedor(actor: UsuarioSesion | null, datos: CrearProveedor): Promise<Proveedor> {
  requirePermiso(actor, "catalogo.editar");
  const [nuevo] = await db.insert(proveedores).values(datos).returning();
  return { ...nuevo, totalInsumos: 0 };
}

export async function actualizarProveedor(actor: UsuarioSesion | null, id: string, cambios: ActualizarProveedor) {
  requirePermiso(actor, "catalogo.editar");
  exigirUuid(id, "Proveedor");
  const valores = soloDefinidos(cambios);
  if (Object.keys(valores).length === 0) {
    const [actual] = await db.select().from(proveedores).where(eq(proveedores.id, id));
    if (!actual) noEncontrado("Proveedor");
    return actual;
  }
  const [despues] = await db.update(proveedores).set(valores).where(eq(proveedores.id, id)).returning();
  if (!despues) noEncontrado("Proveedor");
  return despues;
}

/** Borra al proveedor; sus insumos no se borran, solo quedan sin proveedor (llave con ON DELETE SET NULL). */
export async function eliminarProveedor(actor: UsuarioSesion | null, id: string): Promise<void> {
  requirePermiso(actor, "catalogo.editar");
  exigirUuid(id, "Proveedor");
  const borrados = await db.delete(proveedores).where(eq(proveedores.id, id)).returning({ id: proveedores.id });
  if (borrados.length === 0) noEncontrado("Proveedor");
}
