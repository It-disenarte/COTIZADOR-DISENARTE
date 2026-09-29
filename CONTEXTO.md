# Contexto del proyecto — Cotizador Diseñarte México

Documento para quien retome el proyecto (persona o asistente). Explica qué es, cómo está hecho, qué reglas
manda, qué decisiones ya se tomaron y qué falta. El detalle fase por fase está en `README.md`.

---

## 1. Qué es

App web para que el equipo comercial de **Diseñarte México** (San Juan del Río, Querétaro: señalética,
impresión gran formato, rotulación, corte láser) cotice rápido y parejo, y entregue al cliente una propuesta
en PDF idéntica a la que hacían a mano en Canva.

Estado: **terminada y en producción**. Se sigue mejorando por encargos puntuales del dueño del negocio.

### Quién usa la app

| Rol | Puede |
|---|---|
| `admin` | Todo, incluyendo usuarios |
| `agente_admin` | Cotizar, ver todas las cotizaciones, editar catálogo, **autorizar análisis** |
| `ventas` | Cotizar lo suyo; ve el catálogo en solo lectura; **no** autoriza |

---

## 2. El documento que manda: PNO-COM-01

`PNO-COM-01 Elaboración de cotizaciones` v1.0 (julio 2026) es el procedimiento oficial de la empresa y **manda
sobre la especificación original** (`SPEC_COTIZADOR_DISENARTE.md`). Ante cualquier duda de negocio, se sigue el PNO.
Lo esencial, ya implementado y cubierto por `tests/pno.test.ts`:

- **Fórmulas (apartado 6), en este orden:**
  `costo directo` → `× 1.10` (margen de error) → `÷ 0.70` (margen del 30% **sobre venta**) → `× 1.16` (IVA).
  Nunca multiplicar por 1.30. En el código es `factorPrecio()` en `src/lib/motor/motor.ts`.
- **Valores homologados (apartado 5):** día de instalador y de diseño $700; viáticos $250 local / $500 foráneo;
  Hilux a 10 km/L; margen 30%; margen de error 10%; IVA 16%. Viven en la tabla `parametros`, editables.
- **Comprobación de utilidad (6.8):** `(venta − costo) ÷ venta ≈ 0.30`. Es `margenReal` en cada variante y se
  muestra en el paso Resumen.
- **Punto de control de la Fase 1:** ninguna comunicación al cliente sin **autorización** del responsable. Sin
  ella, el PDF y los mensajes responden 409. Cualquier edición posterior borra la autorización.
- **Fase 2:** la propuesta debe decir expresamente **lo que no incluye**, los supuestos y la vigencia. (La
  petición de acción del PNO se quitó por decisión del dueño; ver apartado 7.)
- **Nunca sale el desglose de costos al cliente.** Solo precios de venta. Hay pruebas que lo verifican.
- **Unidades de venta (apartado 9):** rotulación y corte de vinil por **metro lineal**; lona, impresión y
  sustratos por **m²**; láser por **minuto**; tarjetas por **ciento/millar**; cursos por **persona**.

---

## 3. Stack

- **Next.js 16** (App Router). Ojo: esta versión trae cambios; `AGENTS.md` pide leer
  `node_modules/next/dist/docs/` antes de escribir código de framework. `params` y `searchParams` son promesas.
- **React 19**, **TypeScript estricto**, **Tailwind 4** con componentes propios estilo shadcn (`src/components/ui`).
- **Drizzle ORM** + **PostgreSQL 16**. El dinero es `numeric(14,4)` y Drizzle lo devuelve como **string**.
- **Better Auth** (correo y contraseña, sesiones en la base, argon2id).
- **Zod v4** para validar todo lo que entra por la API.
- **decimal.js** en el motor de cálculo: nunca se redondean los parciales.
- **pdf-lib** + fontkit para el PDF. Nada de Chromium.
- **Gemini** (`@google/genai`) para las funciones de IA.
- **Vitest** + **PGlite** (Postgres en memoria que corre las migraciones reales) para las pruebas.

---

## 4. Cómo correr el proyecto

```bash
npm install
cp .env.example .env     # llenar DATABASE_URL y BETTER_AUTH_SECRET
npm run db:local         # Postgres local sin Docker (PGlite), dejar corriendo en otra terminal
npm run db:migrate       # aplica migraciones
npm run dev
```

La primera vez, la app pide crear la cuenta admin en `/configuracion-inicial`.
Si se pierde el acceso: `npm run crear-admin`.

### Verificación obligatoria antes de dar algo por terminado

```bash
npx tsc --noEmit && npx eslint . && npx vitest run && npx next build
```

Las pruebas **no necesitan** base de datos: levantan Postgres en memoria y corren las migraciones de verdad.

---

## 5. Mapa del código

```
src/
  app/
    (app)/            pantallas con sesión: inicio, cotizaciones, catálogo, usuarios
    api/              rutas; todas envueltas en manejador() y validadas con Zod
    login, configuracion-inicial, cambiar-password
  components/
    cotizador/        asistente de 6 pasos y sus piezas (IA, km, fotos, mensajes, checklist)
    catalogo/         insumos, parámetros, importación de costos
    ui/               botones, inputs, cards… (sin librería externa)
  lib/
    motor/            CÁLCULO. Puro, sin base de datos. El corazón del sistema.
    pdf/              documento.ts (arma el PDF), lienzo.ts (dibujo), marca.ts (datos), plantillas/marco.pdf
    servicios/        acceso a datos + permisos; lo que usan las rutas
    validacion/       esquemas Zod
    ia/               tareas de Gemini (levantamiento, reventa, alcance, catálogo, mensajes)
    mapas/            OpenStreetMap: sugerencias de dirección y kilómetros
    importacion/      lectura de Excel y coincidencia de nombres con el catálogo
    db/schema.ts      esquema Drizzle
drizzle/              migraciones SQL, se aplican solas en cada despliegue
tests/                pruebas; tests/pno.test.ts verifica el cumplimiento del PNO
```

**Regla de oro:** el motor (`src/lib/motor`) no sabe de base de datos ni de HTTP. Recibe una `entrada` y un
`snapshot` del catálogo, y devuelve el resultado. Eso permite que una cotización vieja siga mostrando sus
números aunque cambien los precios: el snapshot se guarda con cada versión.

---

## 6. Cómo funciona el cotizador

Asistente de 6 pasos: **Datos → Levantamiento y materiales → Opciones y fotos → Operación → Reventa → Resumen**.

- El **cliente** se captura dentro de la cotización (no hay pantalla de clientes) y se guarda solo.
- El **levantamiento** es una tabla de conceptos con **una sola columna "Cantidad"**. Si algo va en varias áreas,
  **cada área es un concepto distinto** ("Fotomural oficina", "Fotomural comedor"), aunque sean iguales. Se puede
  pegar desde Excel o importar con IA: si el archivo reparte por áreas, cada área entra como concepto. Si el
  material se cobra por pieza, se dejan ancho y alto en 0.
- **Cada concepto lleva sus propios insumos**: se arrastran del catálogo a la fila (o se elige la fila y se
  presiona +). El costo de cada concepto sale de sus insumos y cada uno tiene **su propio precio unitario** y su
  fila en el PDF. Producción y, si se prorratea, la operación se reparten según el costo de cada concepto.
- La cantidad de cada insumo es **automática por medidas** (`por_m2`: ancho × alto × piezas; el recuadro dice
  "Se usan 20 m² · calculado: 5 × 4 m × 1 pieza") o se escribe **a mano como total** con "Escribir otra
  cantidad" (`fijo`, queda marcada "escrito a mano"; p. ej. 2 láminas o el doble por ambas caras). También hay **metros lineales por pieza**
  (rotulación: los metros salen del escaneo) y **por pieza**. Cada insumo muestra lo que calculó, en su unidad de
  compra (`consumoDeInsumo` en el motor), y debajo de la tabla hay un **resumen de insumos** de la opción (total
  y costo por insumo; interno, nunca sale en el PDF).
- **PDF por concepto:** cada fila dice "Concepto:" y "Descripción:" con viñetas. Las viñetas son la descripción
  escrita para ese concepto en el paso 2 o, si está vacía, el **nombre para el cliente** de cada insumo
  (`insumos.nombre_cliente`; si no tiene, su nombre). El concepto del proyecto va arriba de la tabla ("Proyecto:").
  Nunca salen cantidades ni costos de los insumos.
- Desde el catálogo del paso 2, quien edita el catálogo puede **crear un insumo nuevo** o **editar uno** (p. ej. si
  cambió el precio) sin salir de la cotización (`formulario-insumo.tsx`). Se guarda en el catálogo y los precios se
  recalculan al momento; las cotizaciones autorizadas conservan el suyo. Ventas ve el catálogo sin esos botones.
- Las **categorías de los insumos** se eligen de una lista fija (`CATEGORIAS_INSUMO` en `src/lib/catalogo/constantes.ts`)
  en el catálogo, en el asistente y en la importación; una categoría antigua fuera de la lista se sigue mostrando hasta
  que se cambie. Crear y editar insumos (catálogo y asistente) se hace en una ventana (`src/components/modal.tsx`).
- **Rollo completo** (unidad `rollo`): se captura el precio del rollo, su ancho útil y su largo (`largo_rollo_m`);
  el motor lo lleva a costo por metro y por m² y cobra solo lo usado. El resumen de insumos dice cuántos rollos comprar.
- **Ya no hay recetas** (se quitaron en sept. 2026): ni en el catálogo ni en el asistente. Sus tablas siguen en la
  base, sin pantalla, solo para convertir las cotizaciones anteriores.
- Una **opción** es una página del PDF. Casi siempre hay una; si el cliente quiere comparar materiales se agrega
  otra (copia los insumos de la actual). El precio manual se captura por concepto.
- Las cotizaciones anteriores (una receta por opción) se convierten solas al abrirlas o calcularlas
  (`src/lib/motor/normalizar.ts`): cada concepto recibe los insumos de la receta y el costo no cambia.
- Un **borrador** se guarda con solo los datos del paso 1; autorizar, el PDF y los mensajes exigen la cotización
  completa y dicen qué falta.
- El precio se recalcula **en vivo en el navegador** con el mismo motor del servidor.
- **Guardado automático:** dos segundos después de la última edición (en cuanto hay título y contacto), sin
  pantalla de carga; el pie del precio en vivo dice "Cambios sin guardar… / Guardando… / Guardado 3:41" o el error
  con "Intentar de nuevo". Solo guarda si alguien editó (abrir una cotización autorizada no la toca) y las
  escrituras van una a la vez (el primer guardado no se duplica). Si se cierra la pestaña con cambios, el navegador
  pregunta. Al cambiar de paso se guarda lo que falte.
- Los campos numéricos (inputMode `decimal`, `numeric`, `tel`) no aceptan letras: lo filtra `Input` en
  `src/components/ui` (`limpiarNumero`), en toda la app.
- Una cotización **nueva empieza sin operación** (sin envío, diseño, instalación ni viáticos); al marcar
  "Incluye instalación" propone 2 personas × 1 día. El precio en vivo muestra **materiales contra operación** y
  avisa cuando la operación pesa más.
- El precio en vivo suma aparte la **reventa** ("+ Reventa" y "Total de la propuesta"); en el PDF sigue en su propia
  página. Las **alertas** se abren con un clic: cada una dice qué hacer y lleva al paso donde se corrige
  (`pasoDeAlerta` en `src/lib/cotizador/pasos.ts`).
- El PDF se genera al momento, **nunca se guarda en disco**.

---

## 7. Decisiones tomadas (y por qué)

El dueño del negocio fue recortando alcance para que la app sea rápida de usar. **No re-proponer lo eliminado.**

| Decisión | Motivo |
|---|---|
| Sin bitácora de cambios | Solo usuarios autorizados editan; llenaría la base |
| Sin pantalla de clientes | Capturarlos antes era fricción; van dentro de la cotización |
| Sin catálogo de reventa | Es esporádico; se captura dentro de cada cotización |
| **Sin versiones ni historial** | No las quiere; una cotización se guarda sobre sí misma |
| Duplicar en vez de versionar | Para partir de una parecida o rehacer una cerrada |
| Vercel + Postgres en su VPS | Ya tenía esa combinación funcionando en otra app |
| pdf-lib en vez de Playwright | Chromium pesa ~50 MB y arranca lento en serverless |
| OpenStreetMap en vez de Google Maps | No quiere crear cuentas ni registrar tarjeta |
| Margen de error absorbe indirectos | No hay merma explícita; todo va en el 30% |
| Sin "petición de acción" en la propuesta | El dueño la quitó (sept. 2026) aunque el PNO la menciona; no sale en PDF ni mensajes |
| Sin escenario "piloto y volumen" en pantalla | El dueño lo quitó (sept. 2026); el motor lo sigue calculando para cotizaciones anteriores |
| Sin columnas por área | El dueño prefiere un concepto por área; las cotizaciones de antes se abren con un concepto por área (`separarAreasEnConceptos`) |
| Sin recetas | El dueño las quitó (sept. 2026): cada concepto lleva sus insumos directamente; las tablas quedan solo para cotizaciones anteriores |
| Correo y WhatsApp independientes | Son dos canales para mandar la misma propuesta; ninguno da por hecho que se mandó el otro |
| Sin búsqueda de precios de reventa con IA | El dueño la consideró irrelevante (sept. 2026): el precio de compra se captura a mano |
| Se pueden eliminar cotizaciones | Borrado definitivo (con sus fotos) por quien la hizo o quien ve todas; se confirma en pantalla |

---

## 8. El PDF

Se dibuja sobre el **diseño real de Canva**: `scripts/extraer-plantillas.mts` toma el PDF exportado por Canva y
genera `src/lib/pdf/plantillas/marco.pdf` con 6 páginas (portada e interior sin texto, más Bienvenidos, Por qué,
Proceso y Condiciones tal cual). El motor escribe encima. Si cambia el diseño, se vuelve a correr ese script.

Detalles que costaron trabajo y conviene no volver a descubrir:

- Canva exporta con la **MediaBox corrida** (origen en y = 8.58 por el sangrado). Hay que pasarle esa caja a
  `embedPages`, o todo el diseño sube 8.58 pt y queda una franja blanca abajo.
- El marco se copia **una sola vez** por documento; si no, la textura de fondo (~1 MB) se duplica por página.
- Las texturas se reducen a 1400 px al extraer el marco: el PDF pasa de 3.5 MB a ~2 MB.
- La página de cotización del Canva original traía la tabla **como imagen**; por eso el script la quita.

---

## 9. Integraciones externas y sus trampas

### Gemini (`src/lib/ia/`)

Cinco tareas: leer levantamiento, redactar alcance, leer listas de costos, redactar el
mensaje para mandar la propuesta (correo o WhatsApp, cada uno con su botón) y proponer el **nombre para el
cliente** de los insumos (Catálogo → Insumos → "Sugerir con IA"; se revisa antes de guardar). Reglas que ya están aplicadas:

- Todo se pide con **esquema JSON** y se valida con Zod; si no cumple, se muestra error y se captura a mano.
- **Nunca** se llama sola: siempre por un botón.
- Límite de 30 llamadas por usuario por hora (`GEMINI_LIMITE_HORA`), y cada llamada queda en `llamadas_ia`.
- En la importación de costos desde Excel, **cada número que propone la IA se verifica contra la celda real**;
  si no está en esa fila, el renglón se descarta. Así no puede inventar precios.
- A la IA de mensajes solo se le mandan **precios de venta**, jamás costos.
- Vercel no acepta peticiones de más de 4.5 MB: los archivos se limitan a 4 MB y las fotos se reducen en el
  navegador. Las rutas de IA llevan `maxDuration = 60`.

### OpenStreetMap (`src/lib/mapas/osm.ts`)

Sin cuenta ni llave. **Nominatim** busca direcciones, **OSRM** traza la ruta y **Photon** da las sugerencias
mientras se escribe. Trampas ya resueltas (comprobadas contra los servicios reales):

- Photon **solo acepta** `lang` = `default`, `en`, `de`, `fr`. Con `es` rechaza toda la consulta con HTTP 400.
- Nominatim **prohíbe** el autocompletado; por eso las sugerencias van por Photon.
- En México el mapa casi no tiene números de casa: el número **se quita de la búsqueda** (se conserva en el
  texto del usuario) porque arrastra los resultados a otras ciudades.
- Si nada queda cerca del taller, se busca otra vez agregando "San Juan del Río, Querétaro".
- Las sugerencias se ordenan: primero las que sí contienen lo escrito, luego las más cercanas.
- `ORIGEN_COORDENADAS` es el punto de salida; si falta o está mal escrita, hay respaldo y **la pantalla lo avisa**.
- Son servicios donados: se identifican con User-Agent propio y se deja un segundo entre consultas.

---

## 10. Despliegue

- Repo en GitHub → **Vercel** (rama `main`). `vercel-build` corre `db:migrate` y luego `next build`, así que
  **las migraciones se aplican solas** en cada despliegue.
- La base **PostgreSQL** vive en el VPS Hostinger del cliente, administrada con Easypanel.
- Variables de entorno en Vercel: `DATABASE_URL`, `BETTER_AUTH_SECRET`, `GEMINI_API_KEY`, y opcionales
  `GEMINI_MODEL` (por defecto `gemini-3.8-flash`), `GEMINI_LIMITE_HORA`, `ORIGEN_COORDENADAS`, `CONTACTO_MAPAS`,
  `DB_POOL_MAX`.
- Si un despliegue se queda en "Initializing" mucho tiempo, revisar primero
  [vercel-status.com](https://www.vercel-status.com) antes de buscar en el código: ya pasó una vez.

---

## 11. Cómo trabajar en este proyecto

- **Todo en español**: nombres de variables, funciones, comentarios, mensajes de error y textos de pantalla.
- **Fechas siempre en hora del centro de México** (`ZONA_HORARIA` en `src/lib/formato.ts`): Vercel corre en UTC.
- Toda espera del servidor muestra `PantallaCarga` (`src/components/pantalla-carga.tsx`); lo que falta para
  calcular se avisa con el paso donde se captura (`src/lib/cotizador/pasos.ts`).
- Los comentarios explican **por qué**, no qué. Si algo se hizo raro por una limitación externa, se documenta.
- **Cada campo que pueda confundir lleva su texto de ayuda** debajo. Es petición expresa del dueño.
- Los mensajes de error se escriben para el vendedor, no para el programador: dicen qué hacer.
- Las pruebas nuevas describen **comportamiento de negocio**, no implementación.
- Nada de commits ni push sin que el dueño lo pida.
- Al terminar un cambio: `tsc`, `eslint`, `vitest`, `next build`.

---

## 12. Lo que falta / siguientes pasos

**Datos que el dueño debe capturar** (la especificación prohíbe inventarlos):

- Costo real del corte láser: ¿$5.08 o $50.81 por minuto? Cambia el costo de los insumos de acrílico y MDF.
- Precio de la gasolina Magna (hay alerta si tiene más de 7 días sin actualizarse).
- Costo del estireno cal. 20 y cal. 40, y del vinil fotoluminiscente.
- Rendimiento real de la Mazda CX-30 (quedó 14 km/L como punto de partida).
- Respaldo de la base de datos fuera del VPS.

**Mejoras posibles, ya conversadas:**

- Tipografía **Creato Display** en los títulos (falta conseguir los archivos; hoy se usa Poppins).
- Registrar la fecha del siguiente seguimiento (Fase 3 del PNO) y recordarlo.
- Enviar el correo desde la app en vez de copiarlo.
- Que la foto de la opción pueda subirse también desde el celular con la cámara.

---

## 13. Historial corto

Se construyó por fases: base y autenticación → catálogo → motor de cálculo → asistente → PDF → duplicar e IA →
identidad de marca → importación de costos → kilómetros automáticos → alineación con el PNO-COM-01 → correo y
WhatsApp. El `README.md` conserva las decisiones de cada fase con su justificación.
