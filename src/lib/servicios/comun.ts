import { ErrorHttp } from "@/lib/errores";

const PATRON_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Lanza 404 si el id no tiene formato UUID (evita un error de Postgres por tipo inválido). */
export function exigirUuid(id: string, entidad = "Registro") {
  if (!PATRON_UUID.test(id)) throw new ErrorHttp(404, `${entidad} no encontrado.`, "NO_ENCONTRADO");
}

export function noEncontrado(entidad: string): never {
  throw new ErrorHttp(404, `${entidad} no encontrado.`, "NO_ENCONTRADO");
}

/** Copia sin columnas de tiempo, para guardar antes/después legibles en la bitácora. */
export function paraBitacora<T extends Record<string, unknown>>(fila: T) {
  const copia: Record<string, unknown> = { ...fila };
  delete copia.creadoEn;
  delete copia.actualizadoEn;
  return copia;
}

/** Quita llaves con valor undefined (campos que no vienen en un PATCH). */
export function soloDefinidos<T extends Record<string, unknown>>(obj: T): Partial<T> {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as Partial<T>;
}
