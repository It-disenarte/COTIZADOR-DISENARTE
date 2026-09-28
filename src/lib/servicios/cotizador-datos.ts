import { asc, eq } from "drizzle-orm";
import type { ClienteOpcion } from "@/components/cotizador/pasos-captura";
import { db } from "@/lib/db";
import { clientes, usuarios } from "@/lib/db/schema";
import { tienePermiso, type UsuarioSesion } from "@/lib/permisos";

export async function datosDelAsistente(usuario: UsuarioSesion) {
  const [listaClientes, listaVendedores] = await Promise.all([
    db.select().from(clientes).orderBy(asc(clientes.empresa), asc(clientes.nombreContacto)).limit(500),
    tienePermiso(usuario, "cotizaciones.ver_todas")
      ? db.select({ id: usuarios.id, nombre: usuarios.name }).from(usuarios).where(eq(usuarios.activo, true)).orderBy(asc(usuarios.name))
      : Promise.resolve([{ id: usuario.id, nombre: usuario.nombre }]),
  ]);

  const opcionesCliente: ClienteOpcion[] = listaClientes.map((c) => ({
    id: c.id,
    nombreContacto: c.nombreContacto,
    puesto: c.puesto,
    empresa: c.empresa,
    correo: c.correo,
    telefono: c.telefono,
    direccion: c.direccion,
    kmDesdeSjr: c.kmDesdeSjr,
    zona: c.zona,
    notas: c.notas,
  }));

  return { clientes: opcionesCliente, vendedores: listaVendedores };
}
