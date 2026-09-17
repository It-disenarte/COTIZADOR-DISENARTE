# Cotizador Diseñarte México

Implementación de `SPEC_COTIZADOR_DISENARTE.md` v1. **Estado: fases 1 y 2 terminadas**.

| Fase | Estado |
|---|---|
| 1. Base: proyecto, Postgres, migraciones, auth, roles, configuración inicial del admin, cambio obligatorio de contraseña, usuarios | ✅ Hecha (pruebas pasando) |
| 2. Catálogo: insumos, recetas con componentes, parámetros, clientes y datos semilla | ✅ Hecha (pruebas pasando) |
| 3. Motor de cálculo con sus pruebas | ✅ Hecha (pruebas pasando) |
| 4. Asistente · 5. PDF · 6. Historial · 7. Gemini | Pendientes |

## Stack

Next.js 16 (App Router) + TypeScript estricto · Tailwind 4 con componentes estilo shadcn/ui · Poppins ·
PostgreSQL 16 · Drizzle ORM · Better Auth (email y contraseña, sesiones en BD) · argon2id · Zod · Vitest.
App en **Vercel**; PostgreSQL en el VPS de Hostinger administrado con **Easypanel**.

## Estructura

```text
src/
  app/
    (app)/            pantallas con sesión: inicio, catálogo, clientes, usuarios
    login/            inicio de sesión
    cambiar-password/ cambio de contraseña (obligatorio si es temporal)
    api/auth/         Better Auth
    api/usuarios/     alta, edición, desactivación, restablecer contraseña (solo admin)
    api/insumos/ api/recetas/ api/parametros/
                      catálogo: lectura para todos, edición para admin y agente_admin
    api/clientes/     clientes: todos los roles
    api/cuenta/       cambio de contraseña propia
    api/salud/        healthcheck (app + conexión a Postgres)
  lib/
    motor/            motor de cálculo: módulo puro, sin base de datos ni red (decimal.js)
    permisos.ts       matriz de roles + requirePermiso / requireVerCotizacion
    sesion.ts         lectura de sesión desde BD y bloqueo por contraseña temporal
    servicios/        lógica de negocio (validan permisos en servidor)
    validacion/       esquemas Zod (los decimales viajan como string)
    db/schema.ts      esquema Drizzle
drizzle/              migraciones SQL versionadas (0002 carga los datos semilla del catálogo)
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
nueva, lo deja activo con rol Admin total y cierra sus sesiones.

### Respaldos

- **Opción A:** pestaña **Backups** del servicio `cotizador-db` en Easypanel, con destino externo.
- **Opción B:** copiar `deploy/respaldo.sh` al VPS y programarlo con cron (instrucciones dentro del script).

Restaurar (probarlo antes de salir a producción):

```bash
gunzip -c cotizador-AAAAMMDD-HHMMSS.sql.gz | docker exec -i $(docker ps -qf name=hub_disenarte_cotizador-db) psql -U cotizador -d cotizador
```

## Decisiones de la fase 3

- **Motor puro** en `src/lib/motor/`: recibe la entrada de la cotización y un snapshot del catálogo, y devuelve
  precios, desglose, escenarios y alertas. No toca base de datos ni red, así que se prueba y se reusa en el
  navegador para el precio en vivo.
- **Decimales exactos con decimal.js.** Los parciales nunca se redondean.
- **Redondeo final para que la tabla cuadre:** el unitario se redondea a 2 decimales y todo lo demás sale de ahí,
  así el cliente multiplica unitario × cantidad y le da igual. Efecto: el caso del Versa da $13,741.53, un centavo
  menos que los $13,741.54 de la ficha, que calcula el IVA sobre el precio sin redondear.
- **Instalación que escala por unidad:** en rotulación la instalación se repite en cada unidad, así que es una
  casilla de la cotización (`escalaPorPieza`). Con ella, 25 Versas dan el unitario documentado de $9,926.15.
- **Datos incompletos bloquean, no se inventan:** si un insumo no tiene costo, un rollo no tiene ancho útil o falta
  el precio de la gasolina en un trabajo con traslado, la API responde 400 diciendo qué falta.
- **Alertas que no bloquean** (margen bajo, desvío del precio manual, traslado en cero, foráneo sin hospedaje,
  insumo por revisar, reventa sin verificar, gasolina con más de 7 días) viajan en el resultado para mostrarse
  antes de generar el PDF.
- **`POST /api/cotizaciones/calcular`** calcula sin guardar nada; la fase 4 lo usa para el precio en vivo.

## Decisiones de la fase 2

- **Dos capas de números en el catálogo** (`drizzle/0005_precios_operacion.sql`):
  - **Precios de operación**, de la lista PLANEACIÓN DE TRABAJO – PRECIOS (ficha de desarrollo, sep 2026). Son con
    los que se cotiza de verdad y los que reproducen el caso del Versa: corte de vinil $400/m², trovicel 3 mm con
    impresión $1,200/m² (ya incluye dos caras), vinil UV $1,700/m², fotomural $580.80/m², acrílico 6 mm $2,299/m²,
    MDF $800, chapetón $65, contador $3,000, enmarcado $4,500, amarre $75, cinta doble cara $800, insumos de
    aplicación $200 y tablero dinámico $22,044.
  - **Costos primos del Excel** de agosto 2026 (`drizzle/0002_semilla_catalogo.sql`), como referencia interna. Se
    distinguen con la categoría `Costo primo · …`.
  Todo es editable desde la app; la semilla solo es el punto de partida.
- **Sin merma explícita:** todas las recetas quedan en 0%. Hoy se cotiza sobre el área de la pieza y los precios de
  operación ya absorben el desperdicio (pregunta abierta 2 de la ficha).
- **Costos administrativos e indirectos:** siguen absorbidos dentro del margen del 30%, sin línea propia
  (pregunta abierta 1 de la ficha).
- **Nada inventado:** lo que la especificación deja pendiente (estireno cal. 20 y 40, vinil fotoluminiscente y el
  precio de la gasolina) queda **sin costo**, marcado como "Por revisar", y las recetas que los usan avisan que no
  se pueden cotizar hasta capturarlos.
- **Recetas de estireno:** la propuesta de Gandhi dice "impresión en vinil eco-solvente", así que se arman con la
  impresión Mimaki JV33 (no UV). Siguen sin costo hasta capturar el del estireno.
- **Receta de rotulación:** corte de vinil por m² más insumos de aplicación por unidad, tal como el ejemplo del
  Nissan Versa de la ficha (12 m² × $400 + $200).
- **Decimales:** se guardan en `numeric(14,4)` y viajan como texto entre servidor y navegador, para que el motor
  (fase 3) haga las cuentas con decimales exactos.
- **Archivar, no borrar:** insumos y recetas se archivan. Un insumo archivado no se puede
  agregar a una receta nueva, pero se conserva en las recetas que ya lo usaban.
- **Parámetros:** las claves las fija la semilla porque el motor depende de ellas; desde la app solo se edita el
  valor. Los porcentajes se capturan como fracción (0.30 = 30%) y la app lo valida.
- **Clientes sin pantalla propia:** llenar un directorio antes de poder cotizar era fricción. Los datos del cliente
  se capturan dentro del asistente de cotización (fase 4) y la app los guarda sola; al escribir el nombre sugiere
  los que ya existen con sus kilómetros y zona, para no recapturarlos. La tabla y su API se conservan; lo único
  que se quitó es la sección del menú.
- **Sin bitácora (cambio sobre la especificación):** se quitó a petición del equipo. Solo los roles autorizados
  editan el catálogo y cada versión de cotización guardará su propio snapshot de precios (sección 4), así que la
  trazabilidad de los números no depende de un registro de auditoría.
- **Sin catálogo de reventa (cambio sobre la especificación):** la reventa es esporádica, así que no tiene pestaña
  propia. En la fase 4 los artículos se capturan como **items de reventa** dentro de la cotización: nombre, precio
  de referencia, cantidad y link opcional, escritos al momento. El parámetro `pct_reventa` (35%) se conserva.

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
  por la API propia, que valida permisos y nunca devuelve contraseñas ni hashes.
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
