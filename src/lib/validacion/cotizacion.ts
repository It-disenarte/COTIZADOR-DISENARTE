import { z } from "zod";
import { MODOS_COMPONENTE } from "@/lib/catalogo/constantes";
import { MAX_CONCEPTOS_RAPIDA } from "@/lib/motor/motor";
import { PASO, type Pendiente, textoPendiente } from "@/lib/cotizador/pasos";
import { decimal, decimalOpcional, textoOpcional, textoRequerido, urlOpcional, Uuid } from "./comunes";

const entero = z.coerce.number().int().min(0).max(9999);

const enBlanco = (v: unknown) => v === undefined || v === null || String(v).trim() === "" || Number(v) === 0;

const hayMaquila = (entrada: unknown): boolean => {
  const opciones = (entrada as { opciones?: { maquilas?: unknown[] }[] } | null)?.opciones;
  return Array.isArray(opciones) && opciones.some((o) => !!o?.maquilas?.length);
};

/**
 * En una venta de pura reventa o maquila el levantamiento se queda vacío (la fila en blanco con que
 * empieza toda cotización). Esas filas no cuentan si hay artículos de reventa o si toda la tabla está
 * en blanco; en ese caso el aviso dice que falta un concepto o un artículo.
 */
function quitarFilasEnBlanco(entrada: unknown): unknown {
  if (!entrada || typeof entrada !== "object") return entrada;
  const e = entrada as { reventa?: unknown; levantamiento?: { filas?: unknown } };
  if (!Array.isArray(e.levantamiento?.filas)) return entrada;
  const todas = e.levantamiento.filas as Record<string, unknown>[];
  const llenas = todas.filter(
    (f) =>
      !(
        !String(f?.concepto ?? "").trim() &&
        enBlanco(f?.anchoM) &&
        enBlanco(f?.altoM) &&
        (Array.isArray(f?.cantidades) ? f.cantidades : []).every(enBlanco)
      ),
  );
  const hayReventa = Array.isArray(e.reventa) && e.reventa.length > 0;
  if (!hayReventa && !hayMaquila(entrada) && llenas.length > 0) return entrada;
  return { ...e, levantamiento: { ...e.levantamiento, filas: llenas } };
}

/** Ids que genera el navegador para conceptos y opciones (no son de la base). */
export const IdLocal = z.string().regex(/^[A-Za-z0-9_-]{1,40}$/, { error: "Identificador inválido." });

/**
 * La misma entrada se valida con dos niveles de exigencia:
 * - "borrador": se guarda con lo que haya (basta con los datos del paso 1). Las casillas vacías
 *   se aceptan tal cual, para que el vendedor no pierda lo capturado y siga después.
 * - "completa": lo que necesita el motor para calcular. Se exige para autorizar, generar el PDF
 *   y redactar los mensajes al cliente.
 * Lo que sí se escribió tiene que ser válido en los dos casos: un número mal escrito no pasa.
 */
function esquemaEntrada(modo: "borrador" | "completa") {
  const borrador = modo === "borrador";
  // Vacío = 0: el asistente rellena con 0 los campos que se borran, y si llega vacío se toma igual.
  const numero = (opciones: Parameters<typeof decimal>[0]) =>
    borrador ? z.union([z.literal(""), decimal(opciones)]) : z.union([z.literal("").transform(() => "0"), decimal(opciones)]);
  // Lo que sí hay que escribir aunque sea 0 (un precio que falta no debe pasar como gratis).
  const numeroExigido = (opciones: Parameters<typeof decimal>[0]) =>
    borrador ? z.union([z.literal(""), decimal(opciones)]) : decimal(opciones);
  const texto = (max: number, mensaje: string) => (borrador ? z.string().trim().max(max) : textoRequerido(max, mensaje));
  const minimo = (n: number) => (borrador ? 0 : n);
  // En la tabla, una casilla vacía es cero: un concepto que no va en cierta área, o que se cobra por pieza.
  const medida = (opciones: Parameters<typeof decimal>[0]) =>
    borrador ? numero(opciones) : z.union([z.literal("").transform(() => "0"), decimal(opciones)]);

  const FilaLevantamiento = z.object({
    // Opcional: las cotizaciones anteriores no lo traen; el motor les asigna uno.
    id: IdLocal.optional(),
    // La opción dueña del concepto. Sin ella (cotizaciones anteriores) el motor lo copia a cada opción.
    opcionId: IdLocal.optional(),
    concepto: texto(200, "Escribe el concepto."),
    anchoM: medida({ min: 0 }),
    altoM: medida({ min: 0 }),
    cantidades: z
      .array(medida({ min: 0 }))
      .min(minimo(1), { error: "Captura al menos una cantidad." })
      .max(50),
  });

  const Componente = z.object({
    insumoId: Uuid,
    modo: z.enum(MODOS_COMPONENTE),
    cantidad: numero({ min: 0 }),
  });

  // Producto de maquila: lo que nos hacen fuera más nuestros insumos (en `materiales`) y horas.
  const ProductoMaquila = z.object({
    id: IdLocal,
    nombre: texto(200, "Escribe el nombre del producto de maquila."),
    cantidad: numero({ min: 0 }),
    anchoM: medida({ min: 0 }),
    altoM: medida({ min: 0 }),
    horas: numero({ min: 0, max: 10000 }),
    partes: z
      .array(
        z.object({
          concepto: texto(200, "Escribe qué nos hacen en la maquila."),
          proveedor: textoOpcional(200).optional(),
          // Un costo sin escribir no debe pasar como gratis.
          costo: numeroExigido({ min: 0 }),
        }),
      )
      .max(20),
  });

  const Extra = z.object({
    concepto: texto(200, "Escribe el concepto del extra."),
    monto: numero({ min: 0 }),
    escala: z.enum(["una_vez", "por_pieza"]),
  });

  const objeto = z.object({
    // Presente = cotización rápida: su única variable es el tiempo de desarrollo, en horas.
    rapida: z.object({ horasDesarrollo: numero({ min: 0, max: 10000 }) }).nullable().optional(),
    levantamiento: z.object({
      areas: z
        .array(texto(100, "Nombra el área."))
        .min(minimo(1), { error: "Agrega al menos un área." })
        .max(50),
      // El mínimo de una fila se revisa abajo: una venta de pura reventa o maquila no lleva conceptos.
      // Cada opción lleva sus propios conceptos, así que el tope es de todas juntas.
      filas: z.array(FilaLevantamiento).max(1000),
    }),
    opciones: z
      .array(
        z.union([
          z.object({
            id: IdLocal,
            nombre: texto(150, "Ponle nombre a la opción."),
            // Sale en el PDF, debajo del alcance.
            descripcion: textoOpcional(600).optional(),
            // Foto de referencia para la página de esta opción en el PDF.
            imagenId: Uuid.nullable().optional(),
            maquilas: z.array(ProductoMaquila).max(50).optional(),
            // Insumos de cada concepto, por id de fila.
            materiales: z.record(IdLocal, z.array(Componente).max(40)),
            preciosManuales: z.record(IdLocal, decimalOpcional({ min: 0 })).optional(),
            // Descripción de cada concepto para el PDF, una viñeta por renglón.
            descripciones: z.record(IdLocal, textoOpcional(1000)).optional(),
            // Precio final deseado (subtotal sin IVA): el aumento se reparte entre los conceptos.
            precioObjetivo: decimalOpcional({ min: 0 }).optional(),
            // Aumento en porcentaje sobre el precio calculado (cotización rápida).
            aumentoPct: decimalOpcional({ min: 0, max: 1000 }).optional(),
          }),
          // Forma anterior (una receta para todo el levantamiento): la siguen mandando las
          // pestañas que quedaron abiertas durante un despliegue. El servidor la convierte.
          z.object({
            recetaId: Uuid,
            precioUnitarioManual: decimalOpcional({ min: 0 }),
            imagenId: Uuid.nullable().optional(),
          }),
        ]),
      )
      .min(minimo(1), { error: "Agrega al menos una opción de material." })
      .max(10),
    // Opcional: las cotizaciones guardadas antes de la fase 5 no lo traen.
    tiempoEstimado: textoOpcional(100).optional(),
    // Texto del "Resumen de alcance" del PDF. Opcional: si falta, el PDF usa el título.
    alcance: z
      .object({ concepto: textoOpcional(150), resumen: textoOpcional(600) })
      .nullable()
      .optional(),
    /**
     * Lo que el PNO-COM-01 exige en la comunicación formal (apartado 7.3): delimitar lo que no
     * está incluido, dejar asentados los supuestos, la vigencia y la petición de acción.
     * Opcional en el esquema para que las cotizaciones anteriores sigan siendo válidas; el
     * asistente y el PDF sí las piden.
     */
    propuesta: z
      .object({
        noIncluye: textoOpcional(1000),
        supuestos: textoOpcional(1000),
        vigenciaDias: decimalOpcional({ min: 0, max: 365 }),
        peticionAccion: z.enum(["visita", "piloto", "orden_compra", ""]).optional(),
      })
      .optional(),
    incluyeEnvio: z.boolean(),
    /**
     * Condiciones del sitio que pide revisar el PNO-COM-01 (7.1.7): gráficos previos que haya
     * que retirar y estado de la superficie, porque cambian el tiempo de instalación.
     */
    sitio: z
      .object({ retiroGraficosPrevios: z.boolean().default(false), notasSuperficie: textoOpcional(600) })
      .optional(),
    operacion: z.object({
      trabajoEnInstalacionesDisenarte: z.boolean(),
      diasDiseno: numero({ min: 0 }),
      disenoMontoManual: decimalOpcional({ min: 0 }),
      produccion: z.object({ personas: entero, dias: numero({ min: 0 }) }),
      instalacion: z.object({
        incluye: z.boolean(),
        personas: entero,
        dias: numero({ min: 0 }),
        escalaPorPieza: z.boolean().default(false),
      }),
      viaticos: z.object({
        tipo: z.enum(["local", "foraneo"]),
        personas: entero,
        dias: numero({ min: 0 }),
        montoDiaManual: decimalOpcional({ min: 0 }),
      }),
      hospedaje: z.object({ incluye: z.boolean(), noches: entero, costoNoche: numero({ min: 0 }) }),
      traslado: z.object({
        kmPorTrayecto: numero({ min: 0 }),
        modo: z.enum(["diario", "una_vez"]),
        viajesRedondos: decimalOpcional({ min: 0 }),
        rendimientoKmL: decimalOpcional({ min: 0 }),
        casetasPorViaje: numero({ min: 0 }),
      }),
      extras: z.array(Extra).max(30),
    }),
    presentacion: z.object({
      operacionProrrateada: z.boolean(),
      modalidades: z.enum(["solo_una", "A_y_B", "piloto_y_volumen"]),
      // Unidades del proyecto completo: amortizan el diseño en el escenario por volumen (PNO 7.2.13).
      // Opcional para que sigan siendo válidas las cotizaciones guardadas antes.
      unidadesVolumen: decimalOpcional({ min: 0, max: 100000 }).optional(),
    }),
    ajustes: z.object({
      aplicaMargenError: z.boolean(),
      aplicaConsumibles: z.boolean(),
      margen: decimalOpcional({ min: 0, max: 1, maxExclusivo: true }),
      // Precio final deseado de una venta de pura reventa o maquila (con conceptos va en cada opción).
      precioObjetivo: decimalOpcional({ min: 0 }).optional(),
      descuentoDecisionRapida: z
        .object({ monto: numero({ min: 0 }), nota: textoOpcional(300) })
        .nullable()
        .optional(),
    }),
    reventa: z
      .array(
        z.object({
          nombre: texto(200, "Escribe el nombre del artículo."),
          precioReferencia: numeroExigido({ min: 0 }),
          cantidad: numero({ min: 0 }),
          link: urlOpcional,
          verificado: z.boolean().default(false),
        }),
      )
      .max(50),
  });
  // La cotización rápida admite pocos conceptos; esto se exige también en el borrador.
  const refinado = objeto.superRefine((entrada, ctx) => {
    if (entrada.rapida && entrada.levantamiento.filas.length > MAX_CONCEPTOS_RAPIDA) {
      ctx.addIssue({
        code: "custom",
        path: ["levantamiento", "filas"],
        message: `La cotización rápida admite máximo ${MAX_CONCEPTOS_RAPIDA} conceptos. Para más, usa el asistente completo.`,
      });
    }
  });
  if (borrador) return refinado;
  return z.preprocess(
    quitarFilasEnBlanco,
    refinado.superRefine((entrada, ctx) => {
      if (entrada.levantamiento.filas.length === 0 && entrada.reventa.length === 0 && !hayMaquila(entrada) && !entrada.rapida) {
        ctx.addIssue({
          code: "custom",
          path: ["levantamiento", "filas"],
          message: "Agrega al menos un concepto, un producto en el paso Maquila o artículos en el paso Reventa.",
        });
      }
      if (entrada.rapida && entrada.levantamiento.filas.length === 0) {
        ctx.addIssue({ code: "custom", path: ["levantamiento", "filas"], message: "Agrega al menos un concepto." });
      }
      if (entrada.rapida && !(Number(entrada.rapida.horasDesarrollo) > 0)) {
        ctx.addIssue({
          code: "custom",
          path: ["rapida", "horasDesarrollo"],
          message: "Captura el tiempo de desarrollo en horas (diseño y producción juntos).",
        });
      }
    }),
  );
}

export const EntradaCotizacion = esquemaEntrada("completa");
export type EntradaCotizacion = z.infer<typeof EntradaCotizacion>;

/** Lo que se acepta al guardar un borrador: la misma forma, con casillas vacías permitidas. */
export const EntradaBorrador = esquemaEntrada("borrador");
export type EntradaBorrador = z.infer<typeof EntradaBorrador>;

/** Paso del asistente donde se captura cada parte de la entrada, para decir dónde falta algo. */
function pasoDeRuta(ruta: PropertyKey[]): number {
  const [seccion, , campo] = ruta;
  switch (seccion) {
    case "levantamiento":
      return PASO.levantamiento;
    case "opciones":
      if (campo === "maquilas") return PASO.maquila;
      // El nombre y la descripción de la opción se capturan en "Opciones y fotos"; sus insumos, en el levantamiento.
      return campo === "nombre" || campo === "descripcion" ? PASO.opciones : PASO.levantamiento;
    case "tiempoEstimado":
    case "incluyeEnvio":
      return PASO.opciones;
    case "operacion":
    case "rapida":
    case "sitio":
      return PASO.operacion;
    case "reventa":
      return PASO.reventa;
    default:
      return PASO.resumen;
  }
}

/** Primer pendiente para poder calcular, con el paso donde se captura. null si está completa. */
export function problemaDeEntrada(entrada: unknown): Pendiente | null {
  const revision = EntradaCotizacion.safeParse(entrada);
  if (revision.success) return null;
  let [problema] = revision.error.issues;
  if (!problema) return { paso: PASO.resumen, mensaje: "Faltan datos por capturar." };
  let ruta = problema.path;
  // Las opciones aceptan dos formas; si no cuadra ninguna, el detalle útil es el de la actual.
  if (problema.code === "invalid_union" && problema.errors[0]?.[0]) {
    const interno = problema.errors[0][0];
    ruta = [...ruta, ...interno.path];
    problema = interno;
  }
  const [seccion, subseccion, indice, campo] = ruta;
  const fila = subseccion === "filas" && typeof indice === "number" ? `Concepto ${numeroDeConcepto(entrada, indice)}: ` : "";
  return { paso: pasoDeRuta(ruta), mensaje: `${fila}${problema.message}`, campo: campoDeRuta(entrada, [seccion, subseccion, indice, campo]) };
}

/** Número del concepto como se ve en pantalla: dentro de su opción (la lista guardada las junta todas). */
function numeroDeConcepto(entrada: unknown, indice: number): number {
  const filas = (entrada as { levantamiento?: { filas?: { opcionId?: string }[] } } | null)?.levantamiento?.filas ?? [];
  const opcionId = filas[indice]?.opcionId;
  return filas.slice(0, indice).filter((f) => f.opcionId === opcionId).length + 1;
}

/** Id de la casilla de pantalla donde se corrige lo que señala el esquema (los ids están en los inputs de cada paso). */
function campoDeRuta(entrada: unknown, [seccion, subseccion, indice, campo]: PropertyKey[]): string | undefined {
  const e = (entrada ?? {}) as {
    levantamiento?: { filas?: { id?: string }[] };
    opciones?: { id?: string }[];
  };
  if (seccion === "levantamiento" && subseccion === "filas" && indice === undefined) {
    // Falta al menos un concepto: se marca el primero de la tabla.
    const primera = e.levantamiento?.filas?.[0]?.id;
    return primera ? `fila-${primera}-concepto` : undefined;
  }
  if (seccion === "opciones" && typeof subseccion === "number" && indice === "nombre") {
    const id = e.opciones?.[subseccion]?.id;
    return id ? `nombre-${id}` : undefined;
  }
  if (seccion === "reventa" && typeof subseccion === "number") {
    const columna = { nombre: "nombre", precioReferencia: "precio", cantidad: "cantidad" }[String(indice)];
    return columna ? `reventa-${columna}-${subseccion}` : undefined;
  }
  if (seccion === "operacion" && subseccion === "extras" && typeof indice === "number" && campo === "concepto") {
    return `extra-concepto-${indice}`;
  }
  if (seccion === "rapida") return "horas-desarrollo";
  return undefined;
}

/**
 * Revisa si la entrada está completa para calcular. Devuelve null si lo está o, si no, el
 * primer pendiente dicho para el vendedor: "Levantamiento y materiales: Concepto 2: Escribe el concepto.".
 */
export function pendienteDeEntrada(entrada: unknown): string | null {
  const problema = problemaDeEntrada(entrada);
  return problema ? textoPendiente(problema) : null;
}
