import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

// Equivalente a `drizzle-kit migrate`, sin necesitar drizzle-kit en la imagen de producción.
async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
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
