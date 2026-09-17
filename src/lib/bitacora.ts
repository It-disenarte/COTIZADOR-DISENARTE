import { bitacora } from "@/lib/db/schema";

type Accion = (typeof bitacora.$inferInsert)["accion"];

// Acepta `db` o una transacción: cualquier objeto con `insert` de Drizzle.
type Escritor = { insert: (tabla: typeof bitacora) => { values: (v: typeof bitacora.$inferInsert) => PromiseLike<unknown> } };

export async function registrarBitacora(
  escritor: Escritor,
  entrada: {
    usuarioId: string;
    entidad: string;
    entidadId: string | null;
    accion: Accion;
    antes?: unknown;
    despues?: unknown;
  },
) {
  await escritor.insert(bitacora).values({
    usuarioId: entrada.usuarioId,
    entidad: entrada.entidad,
    entidadId: entrada.entidadId,
    accion: entrada.accion,
    antes: entrada.antes ?? null,
    despues: entrada.despues ?? null,
  });
}
