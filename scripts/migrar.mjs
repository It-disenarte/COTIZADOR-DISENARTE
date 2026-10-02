// Aplica las migraciones de drizzle/ al arrancar el contenedor en el VPS.
// En JavaScript plano (no TypeScript) porque la imagen final no trae tsx.
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";

if (!process.env.DATABASE_URL) {
  console.error("[migrar] Falta DATABASE_URL: captúrala en Easypanel (Entorno).");
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1, connectionTimeoutMillis: 15_000 });
try {
  await migrate(drizzle(pool), { migrationsFolder: "drizzle" });
  console.log("[migrar] migraciones aplicadas");
} catch (error) {
  console.error("[migrar] falló:", error);
  process.exitCode = 1;
} finally {
  await pool.end();
}
