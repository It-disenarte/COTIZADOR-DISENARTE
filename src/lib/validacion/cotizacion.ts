import { z } from "zod";
import { MODOS_COMPONENTE } from "@/lib/catalogo/constantes";
import { PASO, type Pendiente, textoPendiente } from "@/lib/cotizador/pasos";
import { decimal, decimalOpcional, textoOpcional, textoRequerido, urlOpcional, Uuid } from "./comunes";

const entero = z.coerce.number().int().min(0).max(9999);

const enBlanco = (v: unknown) => v === undefined || v === null || String(v).trim() === "" || Number(v) === 0;

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
  if (!hayReventa && llenas.length > 0) return entrada;
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

  const Extra = z.object({
    concepto: texto(200, "Escribe el concepto del extra."),
    monto: numero({ min: 0 }),
    escala: z.enum(["una_vez", "por_pieza"]),
  });

  const objeto = z.object({
    levantamiento: z.object({
      areas: z
        .array(texto(100, "Nombra el área."))
        .min(minimo(1), { error: "Agrega al menos un área." })
        .max(50),
      // El mínimo de una fila se revisa abajo: una venta de pura reventa o maquila no lleva conceptos.
      filas: z.array(FilaLevantamiento).max(500),
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
            // Insumos de cada concepto, por id de fila.
            materiales: z.record(IdLocal, z.array(Componente).max(40)),
            preciosManuales: z.record(IdLocal, decimalOpcional({ min: 0 })).optional(),
            // Descripción de cada concepto para el PDF, una viñeta por renglón.
            descripciones: z.record(IdLocal, textoOpcional(1000)).optional(),
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
  if (borrador) return objeto;
  return z.preprocess(
    quitarFilasEnBlanco,
    objeto.superRefine((entrada, ctx) => {
      if (entrada.levantamiento.filas.length === 0 && entrada.reventa.length === 0) {
        ctx.addIssue({
          code: "custom",
          path: ["levantamiento", "filas"],
          message: "Agrega al menos un concepto, o artículos de reventa o maquila en el paso Reventa y maquila.",
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
      // El nombre y la descripción de la opción se capturan en "Opciones y fotos"; sus insumos, en el levantamiento.
      return campo === "nombre" || campo === "descripcion" ? PASO.opciones : PASO.levantamiento;
    case "tiempoEstimado":
    case "incluyeEnvio":
      return PASO.opciones;
    case "operacion":
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
  const [, subseccion, indice] = ruta;
  const fila = subseccion === "filas" && typeof indice === "number" ? `Concepto ${indice + 1}: ` : "";
  return { paso: pasoDeRuta(ruta), mensaje: `${fila}${problema.message}` };
}

/**
 * Revisa si la entrada está completa para calcular. Devuelve null si lo está o, si no, el
 * primer pendiente dicho para el vendedor: "Levantamiento y materiales: Concepto 2: Escribe el concepto.".
 */
export function pendienteDeEntrada(entrada: unknown): string | null {
  const problema = problemaDeEntrada(entrada);
  return problema ? textoPendiente(problema) : null;
}
