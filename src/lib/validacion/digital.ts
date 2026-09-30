import { z } from "zod";
import { COBROS_DIGITALES, MODALIDADES_WEB } from "@/lib/catalogo/constantes";
import { PASO_DIGITAL, PASOS_DIGITAL, type Pendiente, textoPendiente } from "@/lib/cotizador/pasos";
import { decimal, decimalOpcional, fechaOpcional, textoOpcional, textoRequerido, Uuid } from "./comunes";
import { IdLocal } from "./cotizacion";

/**
 * Entrada de una cotización de Digitalización, con los mismos dos niveles que la física: el
 * borrador se guarda con lo que haya; la completa se exige para autorizar y generar el PDF.
 * Los precios pueden venir vacíos en los dos: si faltan, el cálculo dice cuál (SIN_PRECIO_DIGITAL).
 */
function esquemaEntradaDigital(modo: "borrador" | "completa") {
  const borrador = modo === "borrador";
  const texto = (max: number, mensaje: string) => (borrador ? z.string().trim().max(max) : textoRequerido(max, mensaje));
  const cantidad = borrador ? z.union([z.literal(""), decimal({ min: 0 })]) : decimal({ min: 0 });

  const Linea = z.object({
    id: IdLocal,
    servicioId: Uuid.nullable().optional(),
    nombre: texto(200, "Escribe el nombre del servicio."),
    descripcion: textoOpcional(2000).optional(),
    cobro: z.enum(COBROS_DIGITALES),
    cantidad,
    precio: decimalOpcional({ min: 0 }),
    precioMensual: decimalOpcional({ min: 0 }).optional(),
    activacion: decimalOpcional({ min: 0 }).optional(),
    mesesRenta: decimalOpcional({ min: 1, max: 60 }).optional(),
    tiempoEntrega: textoOpcional(100).optional(),
  });

  const Promocion = z.object({
    id: IdLocal,
    nombre: texto(120, "Ponle nombre a la promoción."),
    descuentoPct: decimalOpcional({ min: 0, max: 100 }),
    regalo: textoOpcional(300).optional(),
    validaHasta: fechaOpcional.optional(),
    activa: z.boolean(),
  });

  return z.object({
    tipo: z.literal("digital"),
    modalidadWeb: z.enum(MODALIDADES_WEB),
    lineas: z
      .array(Linea)
      .min(borrador ? 0 : 1, { error: "Agrega al menos un servicio." })
      .max(60),
    anticipoPct: decimalOpcional({ min: 0, max: 100 }),
    promociones: z.array(Promocion).max(10),
    tiempoEstimado: textoOpcional(100).optional(),
    alcance: z.object({ concepto: textoOpcional(150), resumen: textoOpcional(600) }).nullable().optional(),
    propuesta: z
      .object({
        noIncluye: textoOpcional(2000),
        supuestos: textoOpcional(2000),
        vigenciaDias: decimalOpcional({ min: 0, max: 365 }),
      })
      .optional(),
    // Respuestas del brief (interno): se guardan como referencia para quien diseñe o duplique.
    brief: z
      .object({
        archivo: z.string().trim().max(200),
        respuestas: z
          .array(z.object({ pregunta: z.string().trim().max(500), respuesta: z.string().trim().max(5000) }))
          .max(200),
      })
      .nullable()
      .optional(),
  });
}

export const EntradaDigital = esquemaEntradaDigital("completa");
export const EntradaDigitalBorrador = esquemaEntradaDigital("borrador");

function pasoDeRuta([seccion]: PropertyKey[]): number {
  if (seccion === "lineas" || seccion === "modalidadWeb") return PASO_DIGITAL.servicios;
  if (seccion === "anticipoPct" || seccion === "promociones") return PASO_DIGITAL.pago;
  return PASO_DIGITAL.resumen;
}

/** Primer pendiente de una cotización de Digitalización, con el paso donde se captura. */
export function problemaDeEntradaDigital(entrada: unknown): Pendiente | null {
  const revision = EntradaDigital.safeParse(entrada);
  if (revision.success) return null;
  const [problema] = revision.error.issues;
  if (!problema) return { paso: PASO_DIGITAL.resumen, mensaje: "Faltan datos por capturar." };
  const [seccion, indice] = problema.path;
  const renglon = seccion === "lineas" && typeof indice === "number" ? `Servicio ${indice + 1}: ` : "";
  return { paso: pasoDeRuta(problema.path), mensaje: `${renglon}${problema.message}` };
}

export const pendienteDeEntradaDigital = (entrada: unknown): string | null => {
  const problema = problemaDeEntradaDigital(entrada);
  return problema ? textoPendiente(problema, PASOS_DIGITAL) : null;
};
