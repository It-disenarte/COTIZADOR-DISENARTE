import { and, count, desc, eq, gte, lt, type SQL } from "drizzle-orm";
import { z } from "zod";
import { ENTIDADES_BITACORA } from "@/lib/catalogo/constantes";
import { db } from "@/lib/db";
import { bitacora, usuarios } from "@/lib/db/schema";
import { requirePermiso, type UsuarioSesion } from "@/lib/permisos";

export const POR_PAGINA = 50;

const vacio = (v: unknown) => (v === "" || v == null ? undefined : v);

export const FiltrosBitacora = z.object({
  entidad: z.preprocess(vacio, z.enum(Object.keys(ENTIDADES_BITACORA) as [string, ...string[]]).optional()),
  usuarioId: z.preprocess(vacio, z.uuid().optional()),
  desde: z.preprocess(vacio, z.iso.date().optional()),
  hasta: z.preprocess(vacio, z.iso.date().optional()),
  pagina: z.preprocess(vacio, z.coerce.number().int().min(1).optional()),
});
export type FiltrosBitacora = z.infer<typeof FiltrosBitacora>;

export type RegistroBitacora = {
  id: string;
  creadoEn: Date;
  entidad: string;
  entidadId: string | null;
  accion: "crear" | "editar" | "archivar";
  antes: unknown;
  despues: unknown;
  usuarioId: string | null;
  usuarioNombre: string | null;
};

export async function listarBitacora(actor: UsuarioSesion | null, filtros: FiltrosBitacora) {
  requirePermiso(actor, "bitacora.ver");

  const condiciones: SQL[] = [];
  if (filtros.entidad) condiciones.push(eq(bitacora.entidad, filtros.entidad));
  if (filtros.usuarioId) condiciones.push(eq(bitacora.usuarioId, filtros.usuarioId));
  if (filtros.desde) condiciones.push(gte(bitacora.creadoEn, new Date(`${filtros.desde}T00:00:00-06:00`)));
  if (filtros.hasta) {
    // "hasta" incluye el día completo (hora de Ciudad de México).
    const fin = new Date(`${filtros.hasta}T00:00:00-06:00`);
    fin.setUTCDate(fin.getUTCDate() + 1);
    condiciones.push(lt(bitacora.creadoEn, fin));
  }
  const donde = condiciones.length ? and(...condiciones) : undefined;
  const pagina = filtros.pagina ?? 1;

  const [registros, [{ total }]] = await Promise.all([
    db
      .select({
        id: bitacora.id,
        creadoEn: bitacora.creadoEn,
        entidad: bitacora.entidad,
        entidadId: bitacora.entidadId,
        accion: bitacora.accion,
        antes: bitacora.antes,
        despues: bitacora.despues,
        usuarioId: bitacora.usuarioId,
        usuarioNombre: usuarios.name,
      })
      .from(bitacora)
      .leftJoin(usuarios, eq(bitacora.usuarioId, usuarios.id))
      .where(donde)
      .orderBy(desc(bitacora.creadoEn))
      .limit(POR_PAGINA)
      .offset((pagina - 1) * POR_PAGINA),
    db.select({ total: count() }).from(bitacora).where(donde),
  ]);

  return { registros: registros as RegistroBitacora[], total, pagina, paginas: Math.max(1, Math.ceil(total / POR_PAGINA)) };
}

/** Lista de usuarios para el filtro de la bitácora. */
export async function autoresBitacora(actor: UsuarioSesion | null) {
  requirePermiso(actor, "bitacora.ver");
  return db.select({ id: usuarios.id, nombre: usuarios.name }).from(usuarios).orderBy(usuarios.name);
}
