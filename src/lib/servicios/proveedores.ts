import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { insumos, insumosProveedores, proveedores } from "@/lib/db/schema";
import { requirePermiso, type UsuarioSesion } from "@/lib/permisos";
import type { ActualizarProveedor, CrearProveedor } from "@/lib/validacion/catalogo";
import { exigirUuid, noEncontrado, soloDefinidos } from "./comun";

export type Proveedor = typeof proveedores.$inferSelect & { totalInsumos: number };
export type ProveedorDeInsumo = { id: string; nombre: string };

/** Los proveedores de cada insumo, por nombre. Sin permisos: lo usan el listado del catálogo y el snapshot, que ya los piden. */
export async function proveedoresPorInsumo(): Promise<Map<string, ProveedorDeInsumo[]>> {
  const filas = await db
    .select({ insumoId: insumosProveedores.insumoId, id: proveedores.id, nombre: proveedores.nombre })
    .from(insumosProveedores)
    .innerJoin(proveedores, eq(proveedores.id, insumosProveedores.proveedorId))
    .orderBy(asc(proveedores.nombre));
  const mapa = new Map<string, ProveedorDeInsumo[]>();
  for (const { insumoId, id, nombre } of filas) mapa.set(insumoId, [...(mapa.get(insumoId) ?? []), { id, nombre }]);
  return mapa;
}

export async function listarProveedores(actor: UsuarioSesion | null): Promise<Proveedor[]> {
  requirePermiso(actor, "catalogo.ver");
  const filas = await db
    .select({
      proveedor: proveedores,
      totalInsumos: sql<number>`count(${insumosProveedores.insumoId})::int`,
    })
    .from(proveedores)
    .leftJoin(insumosProveedores, eq(insumosProveedores.proveedorId, proveedores.id))
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

/** Borra al proveedor; sus insumos no se borran, solo dejan de tenerlo (la relación se borra en cascada). */
export async function eliminarProveedor(actor: UsuarioSesion | null, id: string): Promise<void> {
  requirePermiso(actor, "catalogo.editar");
  exigirUuid(id, "Proveedor");
  const borrados = await db.delete(proveedores).where(eq(proveedores.id, id)).returning({ id: proveedores.id });
  if (borrados.length === 0) noEncontrado("Proveedor");
}

/** Dice que este insumo se le compra a este proveedor; sus otros proveedores se quedan. Repetirlo no hace nada. */
export async function agregarInsumoAProveedor(actor: UsuarioSesion | null, proveedorId: string, insumoId: string): Promise<void> {
  requirePermiso(actor, "catalogo.editar");
  exigirUuid(proveedorId, "Proveedor");
  exigirUuid(insumoId, "Insumo");
  const [proveedor] = await db.select({ id: proveedores.id }).from(proveedores).where(eq(proveedores.id, proveedorId));
  if (!proveedor) noEncontrado("Proveedor");
  const [insumo] = await db.select({ id: insumos.id }).from(insumos).where(eq(insumos.id, insumoId));
  if (!insumo) noEncontrado("Insumo");
  await db.insert(insumosProveedores).values({ proveedorId, insumoId }).onConflictDoNothing();
}

export async function quitarInsumoDeProveedor(actor: UsuarioSesion | null, proveedorId: string, insumoId: string): Promise<void> {
  requirePermiso(actor, "catalogo.editar");
  exigirUuid(proveedorId, "Proveedor");
  exigirUuid(insumoId, "Insumo");
  await db
    .delete(insumosProveedores)
    .where(and(eq(insumosProveedores.proveedorId, proveedorId), eq(insumosProveedores.insumoId, insumoId)));
}
