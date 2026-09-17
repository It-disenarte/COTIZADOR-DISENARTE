import { boolean, index, jsonb, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
// Import relativo: drizzle-kit lee este archivo fuera de Next y no resuelve el alias "@/".
import { ROLES } from "../roles";

export { ROLES, type Rol } from "../roles";

export const rolEnum = pgEnum("rol", ROLES);
export const accionBitacoraEnum = pgEnum("accion_bitacora", ["crear", "editar", "archivar"]);

// Columnas de tiempo. Las tablas de Better Auth exigen las llaves createdAt/updatedAt en TS;
// en SQL todas las tablas usan creado_en / actualizado_en.
const tiemposAuth = {
  createdAt: timestamp("creado_en", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("actualizado_en", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

const tiempos = {
  creadoEn: timestamp("creado_en", { withTimezone: true }).notNull().defaultNow(),
  actualizadoEn: timestamp("actualizado_en", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

// ---------------------------------------------------------------------------
// Tablas de Better Auth (las llaves TS son las que espera el adaptador)
// ---------------------------------------------------------------------------

export const usuarios = pgTable("usuarios", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("nombre").notNull(),
  email: text("correo").notNull().unique(),
  emailVerified: boolean("correo_verificado").notNull().default(false),
  image: text("imagen"),
  rol: rolEnum("rol").notNull().default("ventas"),
  activo: boolean("activo").notNull().default(true),
  debeCambiarPassword: boolean("debe_cambiar_password").notNull().default(true),
  ...tiemposAuth,
});

export const sesiones = pgTable(
  "sesiones",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    expiresAt: timestamp("expira_en", { withTimezone: true }).notNull(),
    token: text("token").notNull().unique(),
    ipAddress: text("ip"),
    userAgent: text("user_agent"),
    userId: uuid("usuario_id")
      .notNull()
      .references(() => usuarios.id, { onDelete: "cascade" }),
    ...tiemposAuth,
  },
  (t) => [index("sesiones_usuario_idx").on(t.userId)],
);

export const cuentas = pgTable(
  "cuentas",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: text("cuenta_id").notNull(),
    providerId: text("proveedor_id").notNull(),
    userId: uuid("usuario_id")
      .notNull()
      .references(() => usuarios.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expira_en", { withTimezone: true }),
    refreshTokenExpiresAt: timestamp("refresh_token_expira_en", { withTimezone: true }),
    scope: text("scope"),
    password: text("password"),
    ...tiemposAuth,
  },
  (t) => [index("cuentas_usuario_idx").on(t.userId)],
);

export const verificaciones = pgTable("verificaciones", {
  id: uuid("id").primaryKey().defaultRandom(),
  identifier: text("identificador").notNull(),
  value: text("valor").notNull(),
  expiresAt: timestamp("expira_en", { withTimezone: true }).notNull(),
  ...tiemposAuth,
});

// ---------------------------------------------------------------------------
// Bitácora de cambios de catálogo, parámetros y usuarios
// ---------------------------------------------------------------------------

export const bitacora = pgTable(
  "bitacora",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    usuarioId: uuid("usuario_id").references(() => usuarios.id),
    entidad: text("entidad").notNull(),
    entidadId: uuid("entidad_id"),
    accion: accionBitacoraEnum("accion").notNull(),
    antes: jsonb("antes"),
    despues: jsonb("despues"),
    ...tiempos,
  },
  (t) => [index("bitacora_entidad_idx").on(t.entidad, t.entidadId)],
);
