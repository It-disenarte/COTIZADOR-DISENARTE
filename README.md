# Cotizador Diseñarte México

Implementación de `SPEC_COTIZADOR_DISENARTE.md` v1. **Estado: Fase 1 (Base)**.

| Fase | Estado |
|---|---|
| 1. Base: proyecto, Docker, Postgres, migraciones, auth, roles, admin por seed, cambio obligatorio de contraseña, usuarios | ✅ Hecha (pruebas pasando) |
| 2. Catálogo · 3. Motor · 4. Asistente · 5. PDF · 6. Historial · 7. Gemini | Pendientes |

## Stack

Next.js 16 (App Router) + TypeScript estricto · Tailwind 4 con componentes estilo shadcn/ui · Poppins ·
PostgreSQL 16 · Drizzle ORM · Better Auth (email y contraseña, sesiones en BD) · argon2id · Zod · Vitest ·
Despliegue con `Dockerfile` en el VPS de Hostinger administrado con **Easypanel** (dominio y HTTPS los pone Easypanel).

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
scripts/              migrate, seed, db-local
tests/                Vitest (permisos por rol + API contra Postgres en memoria)
deploy/respaldo.sh    pg_dump diario con retención de 14 días (alternativa a respaldos de Easypanel)
Dockerfile            imagen que Easypanel construye
```

## Desarrollo local (Windows, sin Docker)

```bash
npm install
cp .env.example .env        # llenar BETTER_AUTH_SECRET, ADMIN_EMAIL, ADMIN_PASSWORD
npm run db:local            # terminal 1: Postgres embebido (PGlite) en 127.0.0.1:5433, datos en ./.pglite
npm run db:migrate          # terminal 2
npm run db:seed
npm run dev                 # http://localhost:3000
```

`db:local` es solo para probar en una PC sin Docker. En el VPS se usa el Postgres de Easypanel.

## Pruebas

```bash
npm test          # Vitest: matriz de permisos + flujo completo de API con Postgres en memoria
npm run typecheck
npm run lint
```

Las pruebas de API corren las **mismas migraciones** de producción sobre PGlite y llaman directamente a los
route handlers con cookies reales de Better Auth.

## Despliegue en el VPS (Easypanel)

La app **crea sus tablas sola**: al arrancar el contenedor corre `db:migrate` (migraciones de `drizzle/`),
luego `db:seed` (crea la cuenta admin una sola vez) y después inicia Next.js.

### 1. Base de datos

En el proyecto `hub_disenarte`: **+ Service → Postgres**.

| Campo | Valor |
|---|---|
| Service Name | `cotizador-db` |
| Database Name | `cotizador` |
| User | `cotizador` |
| Password | vacío (genera una aleatoria) |
| Docker Image | `postgres:16` |

No expongas su puerto a internet. Copia la **Internal Connection URL** del servicio (host
`hub_disenarte_cotizador-db`, puerto 5432): es la `DATABASE_URL` de la app.

### 2. App

1. **+ Service → App**, nombre `cotizador`.
2. **Source:** GitHub → repositorio y rama `main` (la primera vez hay que conectar GitHub en los ajustes de Easypanel).
3. **Build:** `Dockerfile` (ruta `Dockerfile`).
4. **Environment:**
   ```
   DATABASE_URL=<Internal Connection URL del paso 1>
   BETTER_AUTH_SECRET=<openssl rand -base64 32>
   BETTER_AUTH_URL=https://cotizador.disenartemx.com
   ADMIN_EMAIL=<correo del admin>
   ADMIN_NOMBRE=Administrador
   ADMIN_PASSWORD=<temporal, mínimo 10 caracteres>
   ```
5. **Domains:** `cotizador.disenartemx.com` → puerto **3000**, HTTPS activado. En el DNS, registro `A` del
   subdominio apuntando a la IP del VPS.
6. **Deploy.** En los logs debe aparecer:
   ```
   [migrate] migraciones aplicadas
   [seed] cuenta admin creada para ...
   ```
7. Entrar con `ADMIN_EMAIL` / `ADMIN_PASSWORD`; la app obliga a cambiar la contraseña. Después se puede borrar
   `ADMIN_PASSWORD` de Environment (el seed no vuelve a tocar una cuenta existente).

`BETTER_AUTH_URL` debe ser exactamente el dominio final con `https://`, o el inicio de sesión falla.

**Actualizar:** hacer push a `main` y dar **Deploy** en Easypanel (o activar auto deploy). Las migraciones
nuevas se aplican solas.

**Fase 5 (PDF):** agregar en la app un **Mount → Volume** en `/data/pdfs` para que los PDF sobrevivan a los redeploys.

### Respaldos

- **Opción A:** pestaña **Backups** del servicio `cotizador-db` en Easypanel, con destino externo.
- **Opción B:** copiar `deploy/respaldo.sh` al VPS y programarlo con cron (instrucciones dentro del script).

Restaurar (probarlo antes de salir a producción):

```bash
gunzip -c cotizador-AAAAMMDD-HHMMSS.sql.gz | docker exec -i $(docker ps -qf name=hub_disenarte_cotizador-db) psql -U cotizador -d cotizador
```

Falta definir el destino de la copia fuera del VPS (Google Drive con rclone u otro).

## Decisiones de la fase 1

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
- **Migraciones al arrancar:** `scripts/migrate.ts` usa el migrador de `drizzle-orm`, que aplica la misma carpeta
  `drizzle/` y la misma tabla de control que `drizzle-kit migrate`.
- **Despliegue:** Easypanel en lugar del `docker-compose` + Caddy de la sección 11 de la especificación; Easypanel
  cumple el mismo papel (contenedores, red interna sin exponer Postgres, HTTPS automático).
- **Caso 5:** los 403 de crear usuario se prueban contra la API real. "Editar insumo" y "ver cotización ajena" se
  prueban hoy a nivel de `requirePermiso` / `requireVerCotizacion`; esos endpoints nacen en las fases 2 y 6 y ahí
  se agregan sus pruebas HTTP.
- **Colores:** la paleta vive en variables CSS de `src/app/globals.css` (`--primary`, `--accent`); falta ajustarla
  a los colores oficiales de la marca.
