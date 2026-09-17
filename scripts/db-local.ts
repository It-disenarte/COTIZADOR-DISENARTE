/**
 * Postgres local SIN Docker, solo para desarrollo y pruebas en una PC:
 * PGlite (Postgres compilado a WASM) expuesto por el protocolo normal de Postgres.
 * Datos en ./.pglite. En el VPS se usa postgres:16 de docker-compose.
 *
 *   npm run db:local     (dejar abierto en otra terminal)
 */
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";

const PUERTO = Number(process.env.PGLITE_PORT ?? 5433);

async function main() {
  const db = await PGlite.create({ dataDir: "./.pglite" });
  const servidor = new PGLiteSocketServer({ db, port: PUERTO, host: "127.0.0.1", maxConnections: 20 });
  await servidor.start();
  console.log(`[db-local] Postgres (PGlite) escuchando en 127.0.0.1:${PUERTO}`);
  console.log(`[db-local] DATABASE_URL=postgres://postgres:postgres@127.0.0.1:${PUERTO}/postgres`);

  const cerrar = async () => {
    await servidor.stop();
    await db.close();
    process.exit(0);
  };
  process.on("SIGINT", cerrar);
  process.on("SIGTERM", cerrar);
}

main().catch((error) => {
  console.error("[db-local] falló:", error);
  process.exit(1);
});
