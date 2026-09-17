import { asc, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { insumos, recetaComponentes, recetas } from "@/lib/db/schema";
import { ErrorHttp } from "@/lib/errores";
import { requirePermiso, type UsuarioSesion } from "@/lib/permisos";
import type { ActualizarReceta, CrearReceta } from "@/lib/validacion/catalogo";
import { exigirUuid, noEncontrado, soloDefinidos } from "./comun";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Lector = Pick<typeof db, "select">;

export type Receta = typeof recetas.$inferSelect;
export type ComponenteDetalle = {
  id: string;
  insumoId: string;
  modo: (typeof recetaComponentes.$inferSelect)["modo"];
  cantidad: string;
  insumo: {
    nombre: string;
    unidadCosto: (typeof insumos.$inferSelect)["unidadCosto"];
    costo: string | null;
    requiereRevision: boolean;
    archivado: boolean;
  };
};
export type RecetaDetalle = Receta & { componentes: ComponenteDetalle[] };


async function cargarComponentes(lector: Lector, recetaIds: string[]): Promise<Map<string, ComponenteDetalle[]>> {
  const mapa = new Map<string, ComponenteDetalle[]>();
  if (recetaIds.length === 0) return mapa;
  const filas = await lector
    .select({
      id: recetaComponentes.id,
      recetaId: recetaComponentes.recetaId,
      insumoId: recetaComponentes.insumoId,
      modo: recetaComponentes.modo,
      cantidad: recetaComponentes.cantidad,
      nombre: insumos.nombre,
      unidadCosto: insumos.unidadCosto,
      costo: insumos.costo,
      requiereRevision: insumos.requiereRevision,
      archivado: insumos.archivado,
    })
    .from(recetaComponentes)
    .innerJoin(insumos, eq(recetaComponentes.insumoId, insumos.id))
    .where(inArray(recetaComponentes.recetaId, recetaIds))
    .orderBy(asc(recetaComponentes.creadoEn), asc(insumos.nombre));

  for (const f of filas) {
    const lista = mapa.get(f.recetaId) ?? [];
    lista.push({
      id: f.id,
      insumoId: f.insumoId,
      modo: f.modo,
      cantidad: f.cantidad,
      insumo: {
        nombre: f.nombre,
        unidadCosto: f.unidadCosto,
        costo: f.costo,
        requiereRevision: f.requiereRevision,
        archivado: f.archivado,
      },
    });
    mapa.set(f.recetaId, lista);
  }
  return mapa;
}

async function detalle(lector: Lector, id: string): Promise<RecetaDetalle | undefined> {
  const [receta] = await lector.select().from(recetas).where(eq(recetas.id, id));
  if (!receta) return undefined;
  const componentes = (await cargarComponentes(lector, [id])).get(id) ?? [];
  return { ...receta, componentes };
}

export async function listarRecetas(actor: UsuarioSesion | null): Promise<RecetaDetalle[]> {
  requirePermiso(actor, "catalogo.ver");
  const lista = await db.select().from(recetas).orderBy(asc(recetas.familia), asc(recetas.nombre));
  const componentes = await cargarComponentes(db, lista.map((r) => r.id));
  return lista.map((r) => ({ ...r, componentes: componentes.get(r.id) ?? [] }));
}

export async function obtenerReceta(actor: UsuarioSesion | null, id: string): Promise<RecetaDetalle> {
  requirePermiso(actor, "catalogo.ver");
  exigirUuid(id, "Receta");
  return (await detalle(db, id)) ?? noEncontrado("Receta");
}

/**
 * Valida los insumos de los componentes: deben existir y no estar archivados,
 * salvo los que la receta ya usaba (se permite conservarlos).
 */
async function validarInsumos(tx: Tx, componentes: { insumoId: string }[], yaUsados: Set<string> = new Set()) {
  const ids = [...new Set(componentes.map((c) => c.insumoId))];
  const encontrados = await tx
    .select({ id: insumos.id, nombre: insumos.nombre, archivado: insumos.archivado })
    .from(insumos)
    .where(inArray(insumos.id, ids));
  if (encontrados.length !== ids.length) {
    throw new ErrorHttp(400, "Algún insumo de la receta no existe.", "INSUMO_INEXISTENTE");
  }
  const archivado = encontrados.find((i) => i.archivado && !yaUsados.has(i.id));
  if (archivado) {
    throw new ErrorHttp(400, `El insumo "${archivado.nombre}" está archivado.`, "INSUMO_ARCHIVADO");
  }
}

export async function crearReceta(actor: UsuarioSesion | null, datos: CrearReceta): Promise<RecetaDetalle> {
  requirePermiso(actor, "catalogo.editar");
  return db.transaction(async (tx) => {
    await validarInsumos(tx, datos.componentes);
    const { componentes, ...campos } = datos;
    const [nueva] = await tx.insert(recetas).values(campos).returning();
    await tx.insert(recetaComponentes).values(componentes.map((c) => ({ ...c, recetaId: nueva.id })));
    const resultado = (await detalle(tx, nueva.id))!;
    return resultado;
  });
}

export async function actualizarReceta(actor: UsuarioSesion | null, id: string, cambios: ActualizarReceta): Promise<RecetaDetalle> {
  requirePermiso(actor, "catalogo.editar");
  exigirUuid(id, "Receta");
  return db.transaction(async (tx) => {
    const antes = await detalle(tx, id);
    if (!antes) noEncontrado("Receta");

    const { componentes, ...campos } = cambios;
    const valores = soloDefinidos(campos);
    if (Object.keys(valores).length > 0) {
      await tx.update(recetas).set(valores).where(eq(recetas.id, id));
    }
    if (componentes) {
      await validarInsumos(tx, componentes, new Set(antes.componentes.map((c) => c.insumoId)));
      // Los componentes se reemplazan completos: las cotizaciones guardan su propio snapshot.
      await tx.delete(recetaComponentes).where(eq(recetaComponentes.recetaId, id));
      await tx.insert(recetaComponentes).values(componentes.map((c) => ({ ...c, recetaId: id })));
    } else if (Object.keys(valores).length === 0) {
      throw new ErrorHttp(400, "No hay cambios.", "SIN_CAMBIOS");
    }

    const despues = (await detalle(tx, id))!;
    return despues;
  });
}
