import { and, asc, eq, ne } from "drizzle-orm";
import { db } from "@/lib/db";
import { cuentas, sesiones, usuarios } from "@/lib/db/schema";
import { ErrorHttp } from "@/lib/errores";
import { hashPassword, verifyPassword } from "@/lib/password";
import { requirePermiso, type UsuarioSesion } from "@/lib/permisos";
import type { ActualizarUsuario, CrearUsuario } from "@/lib/validacion/usuarios";

/** Proyección pública: nunca incluye la contraseña. */
const columnasPublicas = {
  id: usuarios.id,
  nombre: usuarios.name,
  email: usuarios.email,
  rol: usuarios.rol,
  activo: usuarios.activo,
  debeCambiarPassword: usuarios.debeCambiarPassword,
  creadoEn: usuarios.createdAt,
};

export type UsuarioPublico = {
  id: string;
  nombre: string;
  email: string;
  rol: UsuarioSesion["rol"];
  activo: boolean;
  debeCambiarPassword: boolean;
  creadoEn: Date;
};

async function buscarPublico(id: string): Promise<UsuarioPublico | undefined> {
  const [fila] = await db.select(columnasPublicas).from(usuarios).where(eq(usuarios.id, id));
  return fila;
}

const esUuid = (v: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

async function buscarOFallar(id: string): Promise<UsuarioPublico> {
  const usuario = esUuid(id) ? await buscarPublico(id) : undefined;
  if (!usuario) throw new ErrorHttp(404, "Usuario no encontrado.", "NO_ENCONTRADO");
  return usuario;
}

export async function listarUsuarios(actor: UsuarioSesion | null): Promise<UsuarioPublico[]> {
  requirePermiso(actor, "usuarios.gestionar");
  return db.select(columnasPublicas).from(usuarios).orderBy(asc(usuarios.name));
}

/**
 * Inserta usuario + cuenta de credenciales. Las contraseñas asignadas por otra persona son temporales
 * (`debeCambiarPassword` true); las que elige el propio usuario no.
 */
export async function insertarUsuarioConPassword(
  tx: Pick<typeof db, "insert">,
  datos: { nombre: string; email: string; rol: UsuarioSesion["rol"]; password: string; debeCambiarPassword?: boolean },
) {
  const [nuevo] = await tx
    .insert(usuarios)
    .values({
      name: datos.nombre,
      email: datos.email.toLowerCase(),
      rol: datos.rol,
      activo: true,
      debeCambiarPassword: datos.debeCambiarPassword ?? true,
      emailVerified: true,
    })
    .returning({ id: usuarios.id });
  await tx.insert(cuentas).values({
    accountId: nuevo.id,
    providerId: "credential",
    userId: nuevo.id,
    password: await hashPassword(datos.password),
  });
  return nuevo.id;
}

export async function crearUsuario(actor: UsuarioSesion | null, datos: CrearUsuario): Promise<UsuarioPublico> {
  requirePermiso(actor, "usuarios.gestionar");

  const [existente] = await db.select({ id: usuarios.id }).from(usuarios).where(eq(usuarios.email, datos.email));
  if (existente) throw new ErrorHttp(409, "Ya existe una cuenta con ese correo.", "CORREO_DUPLICADO");

  const id = await db.transaction(async (tx) => {
    const id = await insertarUsuarioConPassword(tx, {
      nombre: datos.nombre,
      email: datos.email,
      rol: datos.rol,
      password: datos.passwordTemporal,
    });
    return id;
  });

  return buscarOFallar(id);
}

export async function actualizarUsuario(
  actor: UsuarioSesion | null,
  id: string,
  cambios: ActualizarUsuario,
): Promise<UsuarioPublico> {
  requirePermiso(actor, "usuarios.gestionar");
  const antes = await buscarOFallar(id);

  // Evita que el admin se deje fuera a sí mismo.
  if (antes.id === actor.id) {
    if (cambios.activo === false) throw new ErrorHttp(400, "No puedes desactivar tu propia cuenta.", "AUTO_DESACTIVAR");
    if (cambios.rol && cambios.rol !== "admin") {
      throw new ErrorHttp(400, "No puedes quitarte el rol de admin.", "AUTO_DEGRADAR");
    }
  }

  await db.transaction(async (tx) => {
    await tx
      .update(usuarios)
      .set({
        ...(cambios.nombre !== undefined && { name: cambios.nombre }),
        ...(cambios.rol !== undefined && { rol: cambios.rol }),
        ...(cambios.activo !== undefined && { activo: cambios.activo }),
      })
      .where(eq(usuarios.id, id));

    // Una cuenta desactivada pierde sus sesiones abiertas de inmediato.
    if (cambios.activo === false) await tx.delete(sesiones).where(eq(sesiones.userId, id));
  });

  return buscarOFallar(id);
}

export async function restablecerPassword(actor: UsuarioSesion | null, id: string, passwordTemporal: string) {
  requirePermiso(actor, "usuarios.gestionar");
  await buscarOFallar(id);
  const nuevoHash = await hashPassword(passwordTemporal);

  await db.transaction(async (tx) => {
    const actualizadas = await tx
      .update(cuentas)
      .set({ password: nuevoHash })
      .where(and(eq(cuentas.userId, id), eq(cuentas.providerId, "credential")))
      .returning({ id: cuentas.id });
    if (actualizadas.length === 0) {
      await tx.insert(cuentas).values({ accountId: id, providerId: "credential", userId: id, password: nuevoHash });
    }
    await tx.update(usuarios).set({ debeCambiarPassword: true }).where(eq(usuarios.id, id));
    await tx.delete(sesiones).where(eq(sesiones.userId, id));
  });
}

/** Cambio de la contraseña propia. Cierra las demás sesiones y conserva la actual. */
export async function cambiarPasswordPropia(
  sesion: { usuario: UsuarioSesion; token: string },
  datos: { actual: string; nueva: string },
) {
  const { usuario, token } = sesion;
  const [cuenta] = await db
    .select({ id: cuentas.id, password: cuentas.password })
    .from(cuentas)
    .where(and(eq(cuentas.userId, usuario.id), eq(cuentas.providerId, "credential")));

  if (!cuenta?.password || !(await verifyPassword(cuenta.password, datos.actual))) {
    throw new ErrorHttp(400, "La contraseña actual no es correcta.", "PASSWORD_ACTUAL");
  }

  const nuevoHash = await hashPassword(datos.nueva);
  await db.transaction(async (tx) => {
    await tx.update(cuentas).set({ password: nuevoHash }).where(eq(cuentas.id, cuenta.id));
    await tx.update(usuarios).set({ debeCambiarPassword: false }).where(eq(usuarios.id, usuario.id));
    await tx.delete(sesiones).where(and(eq(sesiones.userId, usuario.id), ne(sesiones.token, token)));
  });
}
