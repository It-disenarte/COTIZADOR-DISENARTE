import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import type { DB } from "@/lib/db";
import * as schema from "@/lib/db/schema";

/**
 * Postgres en memoria (PGlite) con las mismas migraciones que producción.
 * Se tipa como el `db` real porque ambas son instancias de PgDatabase de Drizzle.
 */
export async function crearDbPrueba(): Promise<DB> {
  const cliente = new PGlite();
  const db = drizzle(cliente, { schema });
  await migrate(db, { migrationsFolder: "drizzle" });
  return db as unknown as DB;
}
