# Imagen del cotizador para el VPS (Easypanel construye este archivo desde GitHub).
# Tres etapas: dependencias, compilación y una imagen final chica con el servidor "standalone" de Next.
# Debian (slim) y no Alpine: el módulo nativo de argon2 y sharp vienen compilados para glibc.

FROM node:24-slim AS dependencias
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:24-slim AS compilacion
WORKDIR /app
COPY --from=dependencias /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# Better Auth exige un secreto al cargar sus módulos, también al compilar. Este solo vive en la
# compilación; el real se captura en Easypanel y se lee al arrancar.
RUN BETTER_AUTH_SECRET=solo-para-compilar-no-se-usa-en-produccion npm run build

FROM node:24-slim AS final
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

RUN groupadd --system --gid 1001 app && useradd --system --uid 1001 --gid app app

# Servidor mínimo de Next y lo que no copia solo: estáticos, public, el marco y las fuentes del PDF.
COPY --from=compilacion --chown=app:app /app/.next/standalone ./
COPY --from=compilacion --chown=app:app /app/.next/static ./.next/static
COPY --from=compilacion --chown=app:app /app/public ./public
COPY --from=compilacion --chown=app:app /app/src/lib/pdf/fuentes ./src/lib/pdf/fuentes
COPY --from=compilacion --chown=app:app /app/src/lib/pdf/plantillas ./src/lib/pdf/plantillas

# Migraciones al arrancar: los SQL y los paquetes que usa el migrador (el servidor standalone solo
# trae los archivos que la app importa, no el migrador de Drizzle).
COPY --from=compilacion --chown=app:app /app/drizzle ./drizzle
COPY --from=compilacion --chown=app:app /app/scripts/migrar.mjs ./scripts/migrar.mjs
COPY --from=dependencias /app/node_modules/drizzle-orm ./node_modules/drizzle-orm
COPY --from=dependencias /app/node_modules/pg ./node_modules/pg
COPY --from=dependencias /app/node_modules/pg-connection-string ./node_modules/pg-connection-string
COPY --from=dependencias /app/node_modules/pg-pool ./node_modules/pg-pool
COPY --from=dependencias /app/node_modules/pg-protocol ./node_modules/pg-protocol
COPY --from=dependencias /app/node_modules/pg-types ./node_modules/pg-types
COPY --from=dependencias /app/node_modules/pg-int8 ./node_modules/pg-int8
COPY --from=dependencias /app/node_modules/pgpass ./node_modules/pgpass
COPY --from=dependencias /app/node_modules/postgres-array ./node_modules/postgres-array
COPY --from=dependencias /app/node_modules/postgres-bytea ./node_modules/postgres-bytea
COPY --from=dependencias /app/node_modules/postgres-date ./node_modules/postgres-date
COPY --from=dependencias /app/node_modules/postgres-interval ./node_modules/postgres-interval
COPY --from=dependencias /app/node_modules/split2 ./node_modules/split2
COPY --from=dependencias /app/node_modules/xtend ./node_modules/xtend

USER app
EXPOSE 3000

# Como en Vercel: primero las migraciones y, si salen bien, la app. Si fallan, el contenedor no
# arranca y Easypanel sigue sirviendo la versión anterior.
CMD ["sh", "-c", "node scripts/migrar.mjs && node server.js"]
