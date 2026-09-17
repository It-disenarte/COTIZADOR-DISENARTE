import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

// Reusar el pool entre recargas de `next dev` y entre invocaciones de la misma función en Vercel.
const globalParaDb = globalThis as unknown as { poolCotizador?: Pool };

// En Vercel cada instancia de función abre su propio pool: se mantiene chico para no agotar
// las conexiones de Postgres (max_connections = 100 por defecto).
const maxConexiones = Number(process.env.DB_POOL_MAX ?? (process.env.VERCEL ? 3 : 10));

const pool =
  globalParaDb.poolCotizador ??
  new Pool({
    connectionString: process.env.DATABASE_URL,
    max: maxConexiones,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000,
  });
globalParaDb.poolCotizador = pool;

export const db = drizzle(pool, { schema });
export type DB = typeof db;
