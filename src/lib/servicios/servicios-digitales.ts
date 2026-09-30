import { asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { serviciosDigitales } from "@/lib/db/schema";
import { requirePermiso, type UsuarioSesion } from "@/lib/permisos";
import type { ActualizarServicioDigital, CrearServicioDigital } from "@/lib/validacion/catalogo";
import { exigirUuid, noEncontrado, soloDefinidos } from "./comun";

export type ServicioDigital = typeof serviciosDigitales.$inferSelect;

export async function listarServiciosDigitales(actor: UsuarioSesion | null): Promise<ServicioDigital[]> {
  requirePermiso(actor, "catalogo.ver");
  return db.select().from(serviciosDigitales).orderBy(asc(serviciosDigitales.categoria), asc(serviciosDigitales.nombre));
}

export async function crearServicioDigital(actor: UsuarioSesion | null, datos: CrearServicioDigital): Promise<ServicioDigital> {
  requirePermiso(actor, "catalogo.editar");
  const [nuevo] = await db.insert(serviciosDigitales).values(datos).returning();
  return nuevo;
}

export async function actualizarServicioDigital(
  actor: UsuarioSesion | null,
  id: string,
  cambios: ActualizarServicioDigital,
): Promise<ServicioDigital> {
  requirePermiso(actor, "catalogo.editar");
  exigirUuid(id, "Servicio");
  const [actualizado] = await db.update(serviciosDigitales).set(soloDefinidos(cambios)).where(eq(serviciosDigitales.id, id)).returning();
  if (!actualizado) noEncontrado("Servicio");
  return actualizado;
}
