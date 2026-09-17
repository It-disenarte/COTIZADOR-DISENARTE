import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError } from "better-auth/api";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { cuentas, ROLES, sesiones, usuarios, verificaciones } from "@/lib/db/schema";
import { hashPassword, verifyPassword } from "@/lib/password";
import { PASSWORD_MAX, PASSWORD_MIN } from "@/lib/roles";

// En Vercel, si no se define BETTER_AUTH_URL, se usa el dominio de producción del proyecto
// (el personalizado si se asignó uno; si no, el *.vercel.app).
const urlProduccionVercel = process.env.VERCEL_PROJECT_PRODUCTION_URL
  ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
  : undefined;
const baseURL = process.env.BETTER_AUTH_URL || urlProduccionVercel;

export const auth = betterAuth({
  appName: "Cotizador Diseñarte",
  baseURL,
  trustedOrigins: [baseURL, urlProduccionVercel].filter((u): u is string => Boolean(u)),
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: { user: usuarios, session: sesiones, account: cuentas, verification: verificaciones },
  }),
  emailAndPassword: {
    enabled: true,
    // Las cuentas solo las crea un admin desde /usuarios.
    disableSignUp: true,
    minPasswordLength: PASSWORD_MIN,
    maxPasswordLength: PASSWORD_MAX,
    password: {
      hash: hashPassword,
      verify: ({ hash, password }) => verifyPassword(hash, password),
    },
  },
  user: {
    additionalFields: {
      rol: { type: [...ROLES], required: true, defaultValue: "ventas", input: false },
      activo: { type: "boolean", required: true, defaultValue: true, input: false },
      debeCambiarPassword: { type: "boolean", required: true, defaultValue: true, input: false },
    },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7,
    updateAge: 60 * 60 * 24,
  },
  // Rutas que no se usan: las altas, cambios de perfil y contraseñas pasan por la API propia
  // para validar permisos y dejar rastro en la bitácora.
  disabledPaths: [
    "/sign-up/email",
    "/update-user",
    "/change-email",
    "/delete-user",
    "/change-password",
    "/set-password",
    "/request-password-reset",
    "/reset-password",
  ],
  advanced: {
    database: { generateId: "uuid" },
  },
  databaseHooks: {
    session: {
      create: {
        // Una cuenta desactivada no puede iniciar sesión.
        before: async (session) => {
          const [usuario] = await db
            .select({ activo: usuarios.activo })
            .from(usuarios)
            .where(eq(usuarios.id, session.userId));
          if (!usuario?.activo) {
            throw new APIError("FORBIDDEN", { message: "La cuenta está desactivada.", code: "CUENTA_DESACTIVADA" });
          }
        },
      },
    },
  },
});
