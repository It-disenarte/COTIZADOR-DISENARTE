import { and, count, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { cuentas, sesiones, usuarios } from "@/lib/db/schema";
import { ErrorHttp } from "@/lib/errores";
import { hashPassword } from "@/lib/password";
import { insertarUsuarioConPassword } from "@/lib/servicios/usuarios";
import { PrimerAdmin } from "@/lib/validacion/usuarios";

// Llave fija para pg_advisory_xact_lock: serializa intentos simultáneos de configuración inicial.
const LLAVE_BLOQUEO = 73_012_026;

/** La configuración inicial solo existe mientras la base no tenga ninguna cuenta. */
export async function requiereConfiguracionInicial(): Promise<boolean> {
  const [{ total }] = await db.select({ total: count() }).from(usuarios);
  return total === 0;
}

/** Crea el primer admin. Falla con 409 si ya existe cualquier cuenta, aun con solicitudes simultáneas. */
export async function crearPrimerAdmin(entrada: PrimerAdmin): Promise<string> {
  const datos = PrimerAdmin.parse(entrada);
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(${LLAVE_BLOQUEO})`);
    const [{ total }] = await tx.select({ total: count() }).from(usuarios);
    if (total > 0) {
      throw new ErrorHttp(409, "La configuración inicial ya se realizó.", "YA_CONFIGURADO");
    }

    const id = await insertarUsuarioConPassword(tx, { ...datos, rol: "admin", debeCambiarPassword: false });
    return id;
  });
}

export type ResultadoCrearAdmin = "creado" | "recuperado";

/**
 * Comando `npm run crear-admin`: crea un admin o recupera el acceso de una cuenta existente
 * (nueva contraseña, rol admin, activa, sesiones cerradas). Solo se ejecuta con acceso a la base.
 */
export async function crearORecuperarAdmin(entrada: PrimerAdmin): Promise<ResultadoCrearAdmin> {
  const datos = PrimerAdmin.parse(entrada);
  return db.transaction(async (tx) => {
    const [existente] = await tx
      .select({ id: usuarios.id, rol: usuarios.rol, activo: usuarios.activo })
      .from(usuarios)
      .where(eq(usuarios.email, datos.email));

    if (!existente) {
      await insertarUsuarioConPassword(tx, { ...datos, rol: "admin", debeCambiarPassword: false });
      return "creado";
    }

    const nuevoHash = await hashPassword(datos.password);
    const actualizadas = await tx
      .update(cuentas)
      .set({ password: nuevoHash })
      .where(and(eq(cuentas.userId, existente.id), eq(cuentas.providerId, "credential")))
      .returning({ id: cuentas.id });
    if (actualizadas.length === 0) {
      await tx.insert(cuentas).values({ accountId: existente.id, providerId: "credential", userId: existente.id, password: nuevoHash });
    }
    await tx
      .update(usuarios)
      .set({ rol: "admin", activo: true, debeCambiarPassword: false })
      .where(eq(usuarios.id, existente.id));
    await tx.delete(sesiones).where(eq(sesiones.userId, existente.id));
    return "recuperado";
  });
}
