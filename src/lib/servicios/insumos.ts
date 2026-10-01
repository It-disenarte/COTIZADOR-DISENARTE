import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { cotizaciones, cotizacionVersiones, insumos, recetaComponentes } from "@/lib/db/schema";
import { ErrorHttp } from "@/lib/errores";
import { requirePermiso, type UsuarioSesion } from "@/lib/permisos";
import type { ActualizarInsumo, CrearInsumo, GuardarNombresCliente } from "@/lib/validacion/catalogo";
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

/**
 * Borra un insumo para siempre, solo si ninguna cotización lo usa: directo en un concepto o, en las
 * cotizaciones anteriores, dentro de su receta. Si alguna lo usa, se pide archivarlo: deja de salir en
 * el catálogo y esas cotizaciones siguen calculando igual.
 */
export async function eliminarInsumo(actor: UsuarioSesion | null, id: string): Promise<void> {
  requirePermiso(actor, "catalogo.editar");
  exigirUuid(id, "Insumo");
  await db.transaction(async (tx) => {
    const [insumo] = await tx.select({ nombre: insumos.nombre }).from(insumos).where(eq(insumos.id, id));
    if (!insumo) noEncontrado("Insumo");

    const enRecetas = await tx
      .select({ recetaId: recetaComponentes.recetaId })
      .from(recetaComponentes)
      .where(eq(recetaComponentes.insumoId, id));
    // Los ids se buscan dentro de la entrada guardada (JSON) de la versión vigente de cada cotización.
    const ids = [id, ...new Set(enRecetas.map((r) => r.recetaId))];
    const enUso = await tx
      .select({ folio: cotizaciones.folio })
      .from(cotizaciones)
      .innerJoin(
        cotizacionVersiones,
        and(eq(cotizacionVersiones.cotizacionId, cotizaciones.id), eq(cotizacionVersiones.version, cotizaciones.versionActual)),
      )
      .where(sql`${cotizacionVersiones.entrada}::text like any (${sql.raw(`array[${ids.map((i) => `'%${i}%'`).join(",")}]`)})`)
      .orderBy(asc(cotizaciones.folio));

    if (enUso.length > 0) {
      const folios = enUso.slice(0, 3).map((c) => c.folio).join(", ");
      const resto = enUso.length > 3 ? ` y ${enUso.length - 3} más` : "";
      throw new ErrorHttp(
        409,
        `No se puede eliminar "${insumo.nombre}": lo usa${enUso.length === 1 ? " la cotización" : "n las cotizaciones"} ${folios}${resto}. ` +
          "Archívalo: deja de aparecer en el catálogo y esas cotizaciones conservan su precio.",
        "INSUMO_EN_USO",
      );
    }

    // Recetas que ninguna cotización usa (ya no hay pantalla de recetas): solo estorban para borrar.
    if (enRecetas.length) await tx.delete(recetaComponentes).where(inArray(recetaComponentes.insumoId, [id]));
    await tx.delete(insumos).where(eq(insumos.id, id));
  });
}

/** Guarda de una vez los nombres para el cliente que alguien revisó. */
export async function guardarNombresCliente(actor: UsuarioSesion | null, { cambios }: GuardarNombresCliente): Promise<number> {
  requirePermiso(actor, "catalogo.editar");
  return db.transaction(async (tx) => {
    let guardados = 0;
    for (const { id, nombreCliente } of cambios) {
      const actualizados = await tx.update(insumos).set({ nombreCliente }).where(eq(insumos.id, id)).returning({ id: insumos.id });
      guardados += actualizados.length;
    }
    return guardados;
  });
}
