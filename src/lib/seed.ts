import { eq } from "drizzle-orm";
import { usuarios } from "@/lib/db/schema";
import { PASSWORD_MIN } from "@/lib/roles";
import { insertarUsuarioConPassword } from "@/lib/servicios/usuarios";
import type { DB } from "@/lib/db";

export type ResultadoSeed = "creado" | "ya_existia";

/**
 * Crea la cuenta admin una sola vez. Si el correo ya existe no toca nada
 * (ni la contraseña, ni el rol), así el seed puede correr en cada arranque.
 */
export async function sembrarAdmin(
  db: Pick<DB, "select" | "transaction">,
  { email, password, nombre = "Administrador" }: { email?: string; password?: string; nombre?: string },
): Promise<ResultadoSeed> {
  if (!email || !password) throw new Error("Faltan ADMIN_EMAIL o ADMIN_PASSWORD en el entorno.");
  if (password.length < PASSWORD_MIN) {
    throw new Error(`ADMIN_PASSWORD debe tener al menos ${PASSWORD_MIN} caracteres.`);
  }

  const correo = email.trim().toLowerCase();
  const [existente] = await db.select({ id: usuarios.id }).from(usuarios).where(eq(usuarios.email, correo));
  if (existente) return "ya_existia";

  await db.transaction((tx) => insertarUsuarioConPassword(tx, { nombre, email: correo, rol: "admin", password }));
  return "creado";
}
