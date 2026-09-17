import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

// Reusar el pool entre recargas de `next dev`.
const globalParaDb = globalThis as unknown as { poolCotizador?: Pool };

const pool = globalParaDb.poolCotizador ?? new Pool({ connectionString: process.env.DATABASE_URL, max: 10 });
if (process.env.NODE_ENV !== "production") globalParaDb.poolCotizador = pool;

export const db = drizzle(pool, { schema });
export type DB = typeof db;
