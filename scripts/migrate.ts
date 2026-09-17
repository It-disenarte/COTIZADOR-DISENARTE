import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { omitirFueraDeProduccion } from "./entorno";

// Equivalente a `drizzle-kit migrate`. En Vercel corre dentro de `vercel-build`.
async function main() {
  if (omitirFueraDeProduccion("migrate")) return;
  if (!process.env.DATABASE_URL) throw new Error("Falta DATABASE_URL.");
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
  try {
    await migrate(drizzle(pool), { migrationsFolder: "drizzle" });
    console.log("[migrate] migraciones aplicadas");
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error("[migrate] falló:", error);
  process.exit(1);
});
