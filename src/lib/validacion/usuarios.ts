import { z } from "zod";
import { PASSWORD_MAX, PASSWORD_MIN, ROLES } from "@/lib/roles";

const password = z
  .string()
  .min(PASSWORD_MIN, { error: `Mínimo ${PASSWORD_MIN} caracteres.` })
  .max(PASSWORD_MAX, { error: `Máximo ${PASSWORD_MAX} caracteres.` });

/**
 * Correo: primero se limpian espacios y mayúsculas y después se revisa el formato; al revés, un correo
 * pegado con un espacio al final se rechazaba.
 */
const correo = z.string().trim().toLowerCase().pipe(z.email({ error: "Correo inválido." }));

const nombre = z.string().trim().min(2, { error: "Escribe el nombre." }).max(120);

export const CrearUsuario = z.object({
  nombre,
  email: correo,
  rol: z.enum(ROLES),
  passwordTemporal: password,
});
export type CrearUsuario = z.infer<typeof CrearUsuario>;

/** Primer admin (pantalla de configuración inicial) o admin creado desde el comando crear-admin. */
export const PrimerAdmin = z.object({
  nombre,
  email: correo,
  password,
});
export type PrimerAdmin = z.infer<typeof PrimerAdmin>;

export const ActualizarUsuario = z
  .object({
    nombre: nombre.optional(),
    // Es con lo que la persona inicia sesión: la contraseña no cambia.
    email: correo.optional(),
    rol: z.enum(ROLES).optional(),
    activo: z.boolean().optional(),
  })
  .refine((d) => Object.values(d).some((v) => v !== undefined), { error: "No hay cambios." });
export type ActualizarUsuario = z.infer<typeof ActualizarUsuario>;

export const RestablecerPassword = z.object({ passwordTemporal: password });

export const CambiarPassword = z
  .object({
    actual: z.string().min(1, { error: "Escribe tu contraseña actual." }),
    nueva: password,
  })
  .refine((d) => d.actual !== d.nueva, { error: "La nueva contraseña debe ser distinta.", path: ["nueva"] });
