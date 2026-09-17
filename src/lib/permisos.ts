import type { Rol } from "@/lib/roles";
import { noAutenticado, prohibido } from "@/lib/errores";

// Matriz de la sección 3 de la especificación. Módulo puro: se usa en servidor para validar
// y en cliente solo para decidir qué mostrar (esconder botones no es seguridad).
export const PERMISOS = {
  /** Crear, editar y descargar sus cotizaciones; ver su propio historial */
  "cotizaciones.propias": ["admin", "agente_admin", "ventas"],
  /** Ver historial y cotizaciones de todas las cuentas */
  "cotizaciones.ver_todas": ["admin", "agente_admin"],
  /** Ver insumos, recetas, parámetros y costos */
  "catalogo.ver": ["admin", "agente_admin", "ventas"],
  /** Agregar, editar y archivar insumos, recetas y parámetros */
  "catalogo.editar": ["admin", "agente_admin"],
  /** Dar de alta y editar clientes: se capturan dentro del asistente de cotización, sin pantalla propia */
  "clientes.gestionar": ["admin", "agente_admin", "ventas"],
  /** Crear, editar, desactivar cuentas y cambiar roles */
  "usuarios.gestionar": ["admin"],
} as const satisfies Record<string, readonly Rol[]>;

export type Permiso = keyof typeof PERMISOS;

export type UsuarioSesion = {
  id: string;
  nombre: string;
  email: string;
  rol: Rol;
  activo: boolean;
  debeCambiarPassword: boolean;
};

export const ETIQUETA_ROL: Record<Rol, string> = {
  admin: "Admin total",
  agente_admin: "Agente administrador",
  ventas: "Agente de ventas",
};

export function tienePermiso(usuario: Pick<UsuarioSesion, "rol" | "activo"> | null, permiso: Permiso): boolean {
  if (!usuario?.activo) return false;
  return (PERMISOS[permiso] as readonly Rol[]).includes(usuario.rol);
}

/** Lanza 401 sin sesión y 403 sin permiso. Usar en cada server action y route handler. */
export function requirePermiso(usuario: UsuarioSesion | null, permiso: Permiso): asserts usuario is UsuarioSesion {
  if (!usuario) throw noAutenticado();
  if (!tienePermiso(usuario, permiso)) throw prohibido();
}

/** Una cotización la ve su vendedor, o quien tenga permiso de ver todas. */
export function requireVerCotizacion(
  usuario: UsuarioSesion | null,
  cotizacion: { vendedorId: string },
): asserts usuario is UsuarioSesion {
  requirePermiso(usuario, "cotizaciones.propias");
  if (cotizacion.vendedorId !== usuario.id && !tienePermiso(usuario, "cotizaciones.ver_todas")) {
    throw prohibido("No tienes permiso para ver esta cotización.");
  }
}
