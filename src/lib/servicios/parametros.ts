import { asc, eq } from "drizzle-orm";
import { registrarBitacora } from "@/lib/bitacora";
import { db } from "@/lib/db";
import { parametros } from "@/lib/db/schema";
import { ErrorHttp } from "@/lib/errores";
import { requirePermiso, type UsuarioSesion } from "@/lib/permisos";
import { noEncontrado, paraBitacora } from "./comun";

export type Parametro = typeof parametros.$inferSelect;

/** Las claves las fija la semilla: el motor depende de ellas, así que solo se edita el valor. */
export async function listarParametros(actor: UsuarioSesion | null): Promise<Parametro[]> {
  requirePermiso(actor, "catalogo.ver");
  return db.select().from(parametros).orderBy(asc(parametros.clave));
}

export async function actualizarParametro(actor: UsuarioSesion | null, clave: string, valor: string | null): Promise<Parametro> {
  requirePermiso(actor, "catalogo.editar");
  return db.transaction(async (tx) => {
    const [antes] = await tx.select().from(parametros).where(eq(parametros.clave, clave));
    if (!antes) noEncontrado("Parámetro");
    // Porcentajes y márgenes se guardan como fracción (0.30 = 30%).
    if (antes.unidad === "fracción" && valor != null && Number(valor) >= 1) {
      throw new ErrorHttp(400, "Este parámetro es una fracción: escribe 0.30 para 30%.", "VALIDACION");
    }
    const [despues] = await tx.update(parametros).set({ valor }).where(eq(parametros.clave, clave)).returning();
    await registrarBitacora(tx, {
      usuarioId: actor.id,
      entidad: "parametros",
      entidadId: antes.id,
      accion: "editar",
      antes: paraBitacora(antes),
      despues: paraBitacora(despues),
    });
    return despues;
  });
}
