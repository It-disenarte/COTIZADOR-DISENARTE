import "server-only";
import { auth } from "@/lib/auth";
import type { Rol } from "@/lib/roles";
import { noAutenticado, prohibido } from "@/lib/errores";
import type { UsuarioSesion } from "@/lib/permisos";

export type SesionActual = { usuario: UsuarioSesion; token: string };

/**
 * Lee la sesión desde la BD (sin caché de cookie), así un cambio de rol o una desactivación
 * aplica en la siguiente petición.
 */
export async function obtenerSesion(headers: Headers): Promise<SesionActual | null> {
  const resultado = await auth.api.getSession({ headers });
  if (!resultado) return null;
  const { user, session } = resultado;
  if (!user.activo) return null;
  return {
    token: session.token,
    usuario: {
      id: user.id,
      nombre: user.name,
      email: user.email,
      rol: user.rol as Rol,
      activo: user.activo,
      debeCambiarPassword: user.debeCambiarPassword,
    },
  };
}

/**
 * Exige sesión activa. Mientras la cuenta deba cambiar su contraseña, solo se permite
 * el endpoint de cambio de contraseña.
 */
export async function requireSesion(
  headers: Headers,
  { permitirCambioPendiente = false } = {},
): Promise<SesionActual> {
  const sesion = await obtenerSesion(headers);
  if (!sesion) throw noAutenticado();
  if (sesion.usuario.debeCambiarPassword && !permitirCambioPendiente) {
    throw prohibido("Debes cambiar tu contraseña antes de continuar.");
  }
  return sesion;
}
