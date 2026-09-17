import { boolean, date, index, jsonb, numeric, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
// Imports relativos: drizzle-kit lee este archivo fuera de Next y no resuelve el alias "@/".
import { FAMILIAS_RECETA, MODOS_COMPONENTE, UNIDADES_COSTO, ZONAS } from "../catalogo/constantes";
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
  (t) => [index("bitacora_entidad_idx").on(t.entidad, t.entidadId), index("bitacora_creado_idx").on(t.creadoEn)],
);

// ---------------------------------------------------------------------------
// Catálogo (fase 2). Montos en numeric(14,4); Drizzle los devuelve como string
// para no perder precisión: se convierten con decimal.js en el motor.
// ---------------------------------------------------------------------------

export const unidadCostoEnum = pgEnum("unidad_costo", UNIDADES_COSTO);
export const familiaRecetaEnum = pgEnum("familia_receta", FAMILIAS_RECETA);
export const modoComponenteEnum = pgEnum("modo_componente", MODOS_COMPONENTE);
export const zonaEnum = pgEnum("zona", ZONAS);

const dinero = (nombre: string) => numeric(nombre, { precision: 14, scale: 4 });
const medida = (nombre: string) => numeric(nombre, { precision: 12, scale: 4 });

export const insumos = pgTable(
  "insumos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    nombre: text("nombre").notNull(),
    categoria: text("categoria").notNull(),
    /** null mientras no se conozca la presentación de compra */
    unidadCosto: unidadCostoEnum("unidad_costo"),
    /** Costo sin IVA y sin margen. null = por capturar. */
    costo: dinero("costo"),
    /** Rollos: convierte costo por ML a costo por m² */
    anchoUtilM: medida("ancho_util_m"),
    /** Láminas: convierte costo por lámina a costo por m² */
    areaLaminaM2: medida("area_lamina_m2"),
    fuente: text("fuente"),
    requiereRevision: boolean("requiere_revision").notNull().default(false),
    archivado: boolean("archivado").notNull().default(false),
    ...tiempos,
  },
  (t) => [index("insumos_nombre_idx").on(t.nombre)],
);

export const recetas = pgTable("recetas", {
  id: uuid("id").primaryKey().defaultRandom(),
  nombre: text("nombre").notNull(),
  familia: familiaRecetaEnum("familia").notNull(),
  descripcionPdf: text("descripcion_pdf"),
  pctMerma: numeric("pct_merma", { precision: 6, scale: 4 }).notNull().default("0"),
  archivado: boolean("archivado").notNull().default(false),
  ...tiempos,
});

export const recetaComponentes = pgTable(
  "receta_componentes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    recetaId: uuid("receta_id")
      .notNull()
      .references(() => recetas.id, { onDelete: "cascade" }),
    // restrict: un insumo usado en recetas se archiva, no se borra.
    insumoId: uuid("insumo_id")
      .notNull()
      .references(() => insumos.id, { onDelete: "restrict" }),
    modo: modoComponenteEnum("modo").notNull(),
    cantidad: medida("cantidad").notNull().default("1"),
    ...tiempos,
  },
  (t) => [index("receta_componentes_receta_idx").on(t.recetaId)],
);

export const articulosReventa = pgTable("articulos_reventa", {
  id: uuid("id").primaryKey().defaultRandom(),
  nombre: text("nombre").notNull(),
  /** null = por capturar */
  precioReferencia: dinero("precio_referencia"),
  linkReferencia: text("link_referencia"),
  verificadoEn: date("verificado_en"),
  archivado: boolean("archivado").notNull().default(false),
  ...tiempos,
});

export const parametros = pgTable("parametros", {
  id: uuid("id").primaryKey().defaultRandom(),
  clave: text("clave").notNull().unique(),
  /** null = por capturar */
  valor: dinero("valor"),
  descripcion: text("descripcion").notNull(),
  unidad: text("unidad").notNull(),
  ...tiempos,
});

export const clientes = pgTable(
  "clientes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    nombreContacto: text("nombre_contacto").notNull(),
    empresa: text("empresa"),
    correo: text("correo"),
    telefono: text("telefono"),
    direccion: text("direccion"),
    kmDesdeSjr: medida("km_desde_sjr"),
    zona: zonaEnum("zona").notNull().default("local"),
    notas: text("notas"),
    ...tiempos,
  },
  (t) => [index("clientes_nombre_idx").on(t.nombreContacto), index("clientes_empresa_idx").on(t.empresa)],
);
