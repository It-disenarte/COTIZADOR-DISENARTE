import { asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { insumos } from "@/lib/db/schema";
import { ErrorHttp } from "@/lib/errores";
import { requirePermiso, type UsuarioSesion } from "@/lib/permisos";
import type { ActualizarInsumo, CrearInsumo } from "@/lib/validacion/catalogo";
import { exigirUuid, noEncontrado, soloDefinidos } from "./comun";

export type Insumo = typeof insumos.$inferSelect;

export async function listarInsumos(actor: UsuarioSesion | null): Promise<Insumo[]> {
  requirePermiso(actor, "catalogo.ver");
  return db.select().from(insumos).orderBy(asc(insumos.categoria), asc(insumos.nombre));
}

export async function crearInsumo(actor: UsuarioSesion | null, datos: CrearInsumo): Promise<Insumo> {
  requirePermiso(actor, "catalogo.editar");
  return db.transaction(async (tx) => {
    const [nuevo] = await tx.insert(insumos).values(datos).returning();
    return nuevo;
  });
}

export async function actualizarInsumo(actor: UsuarioSesion | null, id: string, cambios: ActualizarInsumo): Promise<Insumo> {
  requirePermiso(actor, "catalogo.editar");
  exigirUuid(id, "Insumo");
  return db.transaction(async (tx) => {
    const [antes] = await tx.select().from(insumos).where(eq(insumos.id, id));
    if (!antes) noEncontrado("Insumo");

    const valores = soloDefinidos(cambios);
    const costoFinal = valores.costo !== undefined ? valores.costo : antes.costo;
    const unidadFinal = valores.unidadCosto !== undefined ? valores.unidadCosto : antes.unidadCosto;
    if (costoFinal != null && unidadFinal == null) {
      throw new ErrorHttp(400, "Indica la unidad del costo.", "VALIDACION");
    }
    const [despues] = await tx.update(insumos).set(valores).where(eq(insumos.id, id)).returning();
    return despues;
  });
}
