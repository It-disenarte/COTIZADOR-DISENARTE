import { eq } from "drizzle-orm";
import { usuarios } from "@/lib/db/schema";
import { PASSWORD_MIN } from "@/lib/roles";
import { insertarUsuarioConPassword } from "@/lib/servicios/usuarios";
import type { DB } from "@/lib/db";

export type ResultadoSeed = "creado" | "ya_existia" | "omitido";

/**
 * Crea la cuenta admin una sola vez. Corre en cada build de producción:
 * - sin ADMIN_EMAIL o ADMIN_PASSWORD no hace nada (se pueden borrar tras el primer despliegue);
 * - si el correo ya existe no toca nada (ni contraseña ni rol).
 */
export async function sembrarAdmin(
  db: Pick<DB, "select" | "transaction">,
  { email, password, nombre }: { email?: string; password?: string; nombre?: string },
): Promise<ResultadoSeed> {
  if (!email || !password) return "omitido";

  const correo = email.trim().toLowerCase();
  const [existente] = await db.select({ id: usuarios.id }).from(usuarios).where(eq(usuarios.email, correo));
  if (existente) return "ya_existia";

  if (password.length < PASSWORD_MIN) {
    throw new Error(`ADMIN_PASSWORD debe tener al menos ${PASSWORD_MIN} caracteres.`);
  }

  await db.transaction((tx) =>
    insertarUsuarioConPassword(tx, { nombre: nombre || "Administrador", email: correo, rol: "admin", password }),
  );
  return "creado";
}
