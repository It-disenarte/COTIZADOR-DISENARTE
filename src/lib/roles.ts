// Constantes puras (sin dependencias) para compartir entre servidor y cliente.

export const ROLES = ["admin", "agente_admin", "ventas"] as const;
export type Rol = (typeof ROLES)[number];

export const PASSWORD_MIN = 10;
export const PASSWORD_MAX = 128;
