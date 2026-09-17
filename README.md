# Cotizador Diseñarte México

Implementación de `SPEC_COTIZADOR_DISENARTE.md` v1. **Estado: Fase 1 (Base)**.

| Fase | Estado |
|---|---|
| 1. Base: proyecto, Postgres, migraciones, auth, roles, configuración inicial del admin, cambio obligatorio de contraseña, usuarios | ✅ Hecha (pruebas pasando) |
| 2. Catálogo · 3. Motor · 4. Asistente · 5. PDF · 6. Historial · 7. Gemini | Pendientes |

## Stack

Next.js 16 (App Router) + TypeScript estricto · Tailwind 4 con componentes estilo shadcn/ui · Poppins ·
PostgreSQL 16 · Drizzle ORM · Better Auth (email y contraseña, sesiones en BD) · argon2id · Zod · Vitest.
App en **Vercel**; PostgreSQL en el VPS de Hostinger administrado con **Easypanel**.

## Estructura

```text
src/
  app/
    (app)/            pantallas con sesión: inicio, usuarios
    login/            inicio de sesión
    cambiar-password/ cambio de contraseña (obligatorio si es temporal)
    api/auth/         Better Auth
    api/usuarios/     alta, edición, desactivación, restablecer contraseña (solo admin)
    api/cuenta/       cambio de contraseña propia
    api/salud/        healthcheck (app + conexión a Postgres)
  lib/
    permisos.ts       matriz de roles + requirePermiso / requireVerCotizacion
    sesion.ts         lectura de sesión desde BD y bloqueo por contraseña temporal
    servicios/        lógica de negocio (validan permisos en servidor)
    db/schema.ts      esquema Drizzle
drizzle/              migraciones SQL versionadas
scripts/              migrate (corre en el build de Vercel), crear-admin, db-local
tests/                Vitest (permisos por rol + API contra Postgres en memoria)
deploy/respaldo.sh    pg_dump diario con retención de 14 días (alternativa a respaldos de Easypanel)
```

## Desarrollo local (Windows, sin Docker)

```bash
npm install
cp .env.example .env        # llenar BETTER_AUTH_SECRET
npm run db:local            # terminal 1: Postgres embebido (PGlite) en 127.0.0.1:5433, datos en ./.pglite
npm run db:migrate          # terminal 2
npm run dev                 # http://localhost:3000 → pantalla de configuración inicial
```

`db:local` es solo para probar en una PC. En producción se usa el Postgres de Easypanel.

## Pruebas

```bash
npm test          # Vitest: matriz de permisos + flujo completo de API con Postgres en memoria
npm run typecheck
npm run lint
```

Las pruebas de API corren las **mismas migraciones** de producción sobre PGlite y llaman directamente a los
route handlers con cookies reales de Better Auth.

## Despliegue: Vercel + Postgres en el VPS

La app **crea sus tablas sola**: el build de producción de Vercel (`vercel-build`) corre `db:migrate` y después
`next build`. En los despliegues *preview* (otras ramas) las migraciones se omiten para no tocar la base.

### 1. Base de datos (Easypanel)

En el proyecto `hub_disenarte`: **+ Service → Postgres**.

| Campo | Valor |
|---|---|
| Service Name | `cotizador-db` |
| Database Name | `cotizador` |
| User | `cotizador` |
| Password | vacío (genera una aleatoria y larga) |
| Docker Image | `postgres:16` |

Exponer su puerto igual que `inventario-db`, con un puerto distinto. La URL queda así:

```
postgres://cotizador:PASSWORD@IP_DEL_VPS:PUERTO_EXPUESTO/cotizador
```

La base queda accesible desde internet: la seguridad depende de que la contraseña sea larga y aleatoria.

### 2. App (Vercel)

1. **Add New → Project** → importar el repositorio de GitHub. Vercel detecta Next.js y usa `vercel-build`.
2. **Environment Variables:**
   ```
   DATABASE_URL=postgres://cotizador:PASSWORD@IP_DEL_VPS:PUERTO_EXPUESTO/cotizador
   BETTER_AUTH_SECRET=<ver .env.example para generarlo>
   ```
   `BETTER_AUTH_URL` es opcional: si no se define, se usa el dominio de producción del proyecto en Vercel.
3. **Settings → Functions → Region:** la más cercana al VPS (menos latencia por consulta).
4. **Deploy.** En el log del build debe aparecer `[migrate] migraciones aplicadas`.
5. **En cuanto termine el despliegue**, abrir la app: aparece la **Configuración inicial**. Capturar nombre, correo
   y contraseña del Admin total. Esa pantalla desaparece para siempre al existir la primera cuenta.

**Actualizar:** push a `main`. Las migraciones nuevas se aplican solas en el build.

### Recuperar el acceso de admin

Si se pierde la contraseña del admin o todas las cuentas admin quedan desactivadas, desde una PC con el proyecto:

```bash
npm install
# en .env: DATABASE_URL=<URL pública de la base de producción>
npm run crear-admin
```

Pide el correo y la contraseña (oculta). Si el correo no existe crea un admin; si existe, le pone la contraseña
nueva, lo deja activo con rol Admin total y cierra sus sesiones. Queda registrado en la bitácora.

### Respaldos

- **Opción A:** pestaña **Backups** del servicio `cotizador-db` en Easypanel, con destino externo.
- **Opción B:** copiar `deploy/respaldo.sh` al VPS y programarlo con cron (instrucciones dentro del script).

Restaurar (probarlo antes de salir a producción):

```bash
gunzip -c cotizador-AAAAMMDD-HHMMSS.sql.gz | docker exec -i $(docker ps -qf name=hub_disenarte_cotizador-db) psql -U cotizador -d cotizador
```

## Decisiones de la fase 1

- **Cuenta inicial (cambio sobre la sección 3):** en lugar de `ADMIN_EMAIL` / `ADMIN_PASSWORD` en variables de
  entorno, una pantalla de configuración inicial que solo existe mientras la base no tiene cuentas (protegida con
  bloqueo en Postgres contra solicitudes simultáneas) y el comando `npm run crear-admin` para recuperar acceso.
  Ninguna contraseña queda en variables, archivos ni logs.
- **Roles y permisos:** matriz única en `src/lib/permisos.ts`. Cada route handler llama `requireSesion` +
  `requirePermiso` en servidor; el menú solo oculta enlaces.
- **Sesiones:** sin caché de cookie; rol, desactivación y restablecimientos aplican en la siguiente petición.
  Desactivar o restablecer la contraseña borra las sesiones abiertas de esa cuenta.
- **Contraseña temporal:** mientras `debe_cambiar_password = true`, toda la API responde 403 salvo
  `POST /api/cuenta/password`, y las pantallas redirigen a `/cambiar-password`.
- **Registro público deshabilitado** y rutas de Better Auth de perfil/contraseña deshabilitadas: esos cambios pasan
  por la API propia para validar permisos y escribir en `bitacora` (sin guardar contraseñas ni hashes).
- **Protección contra auto-bloqueo:** el admin no puede desactivarse ni quitarse el rol a sí mismo.
- **Contraseñas:** mínimo 10 caracteres; argon2id (19 MiB, 2 pasadas).
- **Migraciones:** `scripts/migrate.ts` usa el migrador de `drizzle-orm`, que aplica la misma carpeta `drizzle/` y
  la misma tabla de control que `drizzle-kit migrate`.
- **Despliegue:** app en Vercel y Postgres en el VPS (Easypanel), en lugar de todo en Docker en el VPS
  (sección 11). Migraciones en el build de producción; pool de 3 conexiones por instancia.
- **PDF (fase 5):** se generan al momento y se descargan; no se guardan en disco (cambio sobre la sección 10.2).
- **Caso 5:** los 403 de crear usuario se prueban contra la API real. "Editar insumo" y "ver cotización ajena" se
  prueban hoy a nivel de `requirePermiso` / `requireVerCotizacion`; esos endpoints nacen en las fases 2 y 6 y ahí
  se agregan sus pruebas HTTP.
- **Colores:** la paleta vive en variables CSS de `src/app/globals.css` (`--primary`, `--accent`); falta ajustarla
  a los colores oficiales de la marca.
