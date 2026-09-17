import { asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { clientes } from "@/lib/db/schema";
import { requirePermiso, type UsuarioSesion } from "@/lib/permisos";
import type { ActualizarCliente, CrearCliente } from "@/lib/validacion/catalogo";
import { exigirUuid, noEncontrado, soloDefinidos } from "./comun";

export type Cliente = typeof clientes.$inferSelect;

export async function listarClientes(actor: UsuarioSesion | null): Promise<Cliente[]> {
  requirePermiso(actor, "clientes.gestionar");
  return db.select().from(clientes).orderBy(asc(clientes.empresa), asc(clientes.nombreContacto));
}

export async function crearCliente(actor: UsuarioSesion | null, datos: CrearCliente): Promise<Cliente> {
  requirePermiso(actor, "clientes.gestionar");
  return db.transaction(async (tx) => {
    const [nuevo] = await tx.insert(clientes).values(datos).returning();
    return nuevo;
  });
}

export async function actualizarCliente(actor: UsuarioSesion | null, id: string, cambios: ActualizarCliente): Promise<Cliente> {
  requirePermiso(actor, "clientes.gestionar");
  exigirUuid(id, "Cliente");
  return db.transaction(async (tx) => {
    const [antes] = await tx.select().from(clientes).where(eq(clientes.id, id));
    if (!antes) noEncontrado("Cliente");
    const [despues] = await tx.update(clientes).set(soloDefinidos(cambios)).where(eq(clientes.id, id)).returning();
    return despues;
  });
}
