import { z } from "zod";
import { decimal, decimalOpcional, textoOpcional, textoRequerido, urlOpcional, Uuid } from "./comunes";

const cantidad = decimal({ min: 0 });
const entero = z.coerce.number().int().min(0).max(9999);

const FilaLevantamiento = z.object({
  concepto: textoRequerido(200, "Escribe el concepto."),
  anchoM: decimal({ min: 0 }),
  altoM: decimal({ min: 0 }),
  cantidades: z.array(cantidad).min(1, { error: "Captura al menos una cantidad." }).max(50),
});

const Extra = z.object({
  concepto: textoRequerido(200, "Escribe el concepto del extra."),
  monto: decimal({ min: 0 }),
  escala: z.enum(["una_vez", "por_pieza"]),
});

export const EntradaCotizacion = z.object({
  levantamiento: z.object({
    areas: z.array(textoRequerido(100, "Nombra el área.")).min(1).max(50),
    filas: z.array(FilaLevantamiento).min(1, { error: "El levantamiento necesita al menos una fila." }).max(500),
  }),
  opciones: z
    .array(
      z.object({
        recetaId: Uuid,
        precioUnitarioManual: decimalOpcional({ min: 0 }),
        // Foto de referencia para la página de esta opción en el PDF.
        imagenId: Uuid.nullable().optional(),
      }),
    )
    .min(1, { error: "Elige al menos una opción de material." })
    .max(10),
  // Opcional: las cotizaciones guardadas antes de la fase 5 no lo traen.
  tiempoEstimado: textoOpcional(100).optional(),
  incluyeEnvio: z.boolean(),
  operacion: z.object({
    trabajoEnInstalacionesDisenarte: z.boolean(),
    diasDiseno: decimal({ min: 0 }),
    disenoMontoManual: decimalOpcional({ min: 0 }),
    produccion: z.object({ personas: entero, dias: decimal({ min: 0 }) }),
    instalacion: z.object({
      incluye: z.boolean(),
      personas: entero,
      dias: decimal({ min: 0 }),
      escalaPorPieza: z.boolean().default(false),
    }),
    viaticos: z.object({
      tipo: z.enum(["local", "foraneo"]),
      personas: entero,
      dias: decimal({ min: 0 }),
      montoDiaManual: decimalOpcional({ min: 0 }),
    }),
    hospedaje: z.object({ incluye: z.boolean(), noches: entero, costoNoche: decimal({ min: 0 }) }),
    traslado: z.object({
      kmPorTrayecto: decimal({ min: 0 }),
      modo: z.enum(["diario", "una_vez"]),
      viajesRedondos: decimalOpcional({ min: 0 }),
      rendimientoKmL: decimalOpcional({ min: 0 }),
      casetasPorViaje: decimal({ min: 0 }),
    }),
    extras: z.array(Extra).max(30),
  }),
  presentacion: z.object({
    operacionProrrateada: z.boolean(),
    modalidades: z.enum(["solo_una", "A_y_B"]),
  }),
  ajustes: z.object({
    aplicaMargenError: z.boolean(),
    aplicaConsumibles: z.boolean(),
    margen: decimalOpcional({ min: 0, max: 1, maxExclusivo: true }),
    descuentoDecisionRapida: z
      .object({ monto: decimal({ min: 0 }), nota: textoOpcional(300) })
      .nullable()
      .optional(),
  }),
  reventa: z
    .array(
      z.object({
        nombre: textoRequerido(200, "Escribe el nombre del artículo."),
        precioReferencia: decimal({ min: 0 }),
        cantidad: decimal({ min: 0 }),
        link: urlOpcional,
        verificado: z.boolean().default(false),
      }),
    )
    .max(50),
});

export type EntradaCotizacion = z.infer<typeof EntradaCotizacion>;
