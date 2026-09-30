import type { CobroDigital, ModalidadWeb } from "@/lib/catalogo/constantes";
import { CERO, d, type Decimal, money, round2, suma } from "./numeros";
import type { Numerico } from "./numeros";
import { type Alerta, ErrorMotor } from "./tipos";

/**
 * Cotizaciones de Digitalización (páginas web, identidad, redes, Google…). A diferencia de la
 * publicidad física no hay costo ni fórmula del PNO: cada servicio tiene precio de lista. Aquí solo
 * se arman las formas de pago:
 * - Paquete web en renta: mensualidad + activación, con IVA incluido.
 * - Paquete web como dueño, y cualquier servicio de pago único: precio + IVA, con anticipo y finiquito.
 * - Servicios mensuales (redes sociales): precio al mes + IVA.
 * Módulo puro, como el motor: no sabe de base de datos ni de HTTP.
 */

export type LineaDigital = {
  id: string;
  /** Servicio del catálogo del que salió (null = escrito solo para esta cotización). */
  servicioId: string | null;
  nombre: string;
  /** Viñetas para el PDF, una por renglón. */
  descripcion?: string | null;
  cobro: CobroDigital;
  cantidad: Numerico;
  /** Pago único, mensual, o precio como dueño del paquete. Sin IVA. */
  precio: Numerico | null;
  /** Paquete en renta, con IVA incluido. */
  precioMensual?: Numerico | null;
  activacion?: Numerico | null;
  mesesRenta?: Numerico | null;
  tiempoEntrega?: string | null;
};

export type PromocionDigital = {
  id: string;
  nombre: string;
  /** Porcentaje de descuento sobre los pagos únicos: "10" = 10%. */
  descuentoPct: Numerico;
  /** Lo que se regala con la promoción ("Capacitación del proyecto"). */
  regalo?: string | null;
  /** Fecha límite (AAAA-MM-DD). */
  validaHasta?: string | null;
  activa: boolean;
};

export type EntradaDigital = {
  tipo: "digital";
  modalidadWeb: ModalidadWeb;
  lineas: LineaDigital[];
  /** Porcentaje de anticipo de los pagos únicos: "70" = 70% al inicio y 30% al entregar. */
  anticipoPct: Numerico;
  promociones: PromocionDigital[];
  tiempoEstimado?: string | null;
  alcance?: { concepto?: string | null; resumen?: string | null } | null;
  propuesta?: { noIncluye?: string | null; supuestos?: string | null; vigenciaDias?: Numerico | null };
  /** Respuestas del brief del cliente (interno, nunca sale en el PDF). */
  brief?: { archivo: string; respuestas: { pregunta: string; respuesta: string }[] } | null;
};

export type FilaDigital = {
  concepto: string;
  descripcion: string[];
  cantidad: string;
  unitario: string;
  subtotal: string;
  /** "12 mensualidades · IVA incluido", "Precio al mes"… */
  nota: string | null;
  /** Tiempo de entrega del servicio ("4 días hábiles"); null = el general de la cotización. */
  tiempo: string | null;
};

export type PromocionResultado = {
  nombre: string;
  descuentoPct: string;
  descuento: string;
  subtotal: string;
  iva: string;
  total: string;
  regalo: string | null;
  validaHasta: string | null;
};

export type EscenarioDigital = {
  clave: "renta" | "dueno" | "unico";
  etiqueta: string;
  filasUnicas: FilaDigital[];
  unico: {
    subtotal: string;
    iva: string;
    total: string;
    anticipoPct: string;
    anticipo: string;
    finiquito: string;
    promociones: PromocionResultado[];
  } | null;
  filasRenta: FilaDigital[];
  renta: { activacion: string; mensualidad: string; meses: number; totalPrimerAno: string } | null;
  filasMensuales: FilaDigital[];
  mensual: { subtotal: string; iva: string; total: string } | null;
};

export type ResultadoDigital = {
  tipo: "digital";
  escenarios: EscenarioDigital[];
  alertas: Alerta[];
  /** Lo que se paga al contratar con el primer escenario (para la lista de cotizaciones). */
  total: string;
};

const vacio = (v: unknown) => v === null || v === undefined || v === "";

const vinetas = (texto?: string | null) =>
  (texto ?? "")
    .split(/\r?\n/)
    .map((r) => r.replace(/^\s*[-•*]\s*/, "").trim())
    .filter(Boolean);

function exigir(valor: unknown, linea: LineaDigital, queFalta: string): Decimal {
  if (vacio(valor)) {
    throw new ErrorMotor(
      `Falta ${queFalta} de "${linea.nombre || "un servicio"}". Escríbelo en la cotización o captúralo en el catálogo.`,
      "SIN_PRECIO_DIGITAL",
    );
  }
  return d(valor as never);
}

const fila = (linea: LineaDigital, unitario: Decimal, cantidad: Decimal, nota: string | null): FilaDigital => ({
  concepto: linea.nombre,
  descripcion: vinetas(linea.descripcion),
  cantidad: cantidad.toString(),
  unitario: money(unitario),
  subtotal: money(unitario.times(cantidad)),
  nota,
  tiempo: linea.tiempoEntrega?.trim() || null,
});

export function calcularDigital(entrada: EntradaDigital, iva: Numerico, hoy = new Date()): ResultadoDigital {
  const lineas = entrada.lineas.filter((l) => !vacio(l.cantidad) && d(l.cantidad as never).gt(0));
  if (lineas.length === 0) throw new ErrorMotor("Agrega al menos un servicio.", "SIN_SERVICIOS");

  const tasaIva = d(iva);
  const hayPaquete = lineas.some((l) => l.cobro === "paquete");
  const claves: EscenarioDigital["clave"][] = !hayPaquete
    ? ["unico"]
    : entrada.modalidadWeb === "renta"
      ? ["renta"]
      : entrada.modalidadWeb === "dueno"
        ? ["dueno"]
        : ["renta", "dueno"];

  const pctAnticipo = vacio(entrada.anticipoPct) ? d(70) : d(entrada.anticipoPct as never);
  if (pctAnticipo.lt(0) || pctAnticipo.gt(100)) {
    throw new ErrorMotor("El anticipo debe estar entre 0 y 100%.", "ANTICIPO_INVALIDO");
  }

  const escenarios = claves.map((clave): EscenarioDigital => {
    const filasUnicas: FilaDigital[] = [];
    const filasRenta: FilaDigital[] = [];
    const filasMensuales: FilaDigital[] = [];
    let activacion = CERO;
    let mensualidad = CERO;
    let meses = 0;

    for (const linea of lineas) {
      const cantidad = d(linea.cantidad as never);
      if (linea.cobro === "paquete" && clave === "renta") {
        const mensual = exigir(linea.precioMensual, linea, "la mensualidad");
        const alta = exigir(linea.activacion, linea, "la activación");
        const mesesLinea = vacio(linea.mesesRenta) ? 12 : Number(linea.mesesRenta);
        activacion = activacion.plus(alta.times(cantidad));
        mensualidad = mensualidad.plus(mensual.times(cantidad));
        meses = Math.max(meses, mesesLinea);
        filasRenta.push(
          fila(linea, mensual, cantidad, `${mesesLinea} mensualidades · activación ${money(alta)} · IVA incluido`),
        );
      } else if (linea.cobro === "mensual") {
        filasMensuales.push(fila(linea, exigir(linea.precio, linea, "el precio mensual"), cantidad, "Precio al mes"));
      } else {
        // Pago único, o el paquete como dueño.
        const nota = linea.cobro === "paquete" ? "Modalidad dueño: el sitio es tuyo" : null;
        filasUnicas.push(fila(linea, exigir(linea.precio, linea, "el precio"), cantidad, nota));
      }
    }

    const subtotalUnico = suma(filasUnicas.map((f) => d(f.subtotal)));
    const conIva = (subtotal: Decimal) => {
      const total = round2(subtotal.times(tasaIva.plus(1)));
      return { subtotal: subtotal.toFixed(2), iva: total.minus(subtotal).toFixed(2), total: total.toFixed(2) };
    };

    let unico: EscenarioDigital["unico"] = null;
    if (filasUnicas.length) {
      const base = conIva(subtotalUnico);
      const anticipo = round2(d(base.total).times(pctAnticipo).div(100));
      unico = {
        ...base,
        anticipoPct: pctAnticipo.toString(),
        anticipo: anticipo.toFixed(2),
        finiquito: d(base.total).minus(anticipo).toFixed(2),
        // Las promociones de contado se aplican a los pagos únicos, no a la renta.
        promociones: entrada.promociones
          .filter((p) => p.activa && !vacio(p.descuentoPct))
          .map((p) => {
            const pct = d(p.descuentoPct as never);
            const descuento = round2(subtotalUnico.times(pct).div(100));
            return {
              nombre: p.nombre,
              descuentoPct: pct.toString(),
              descuento: descuento.toFixed(2),
              ...conIva(subtotalUnico.minus(descuento)),
              regalo: p.regalo?.trim() || null,
              validaHasta: p.validaHasta || null,
            };
          }),
      };
    }

    const subtotalMensual = suma(filasMensuales.map((f) => d(f.subtotal)));
    return {
      clave,
      etiqueta: clave === "renta" ? "Modalidad renta" : clave === "dueno" ? "Modalidad dueño" : "Propuesta",
      filasUnicas,
      unico,
      filasRenta,
      renta: filasRenta.length
        ? {
            activacion: activacion.toFixed(2),
            mensualidad: mensualidad.toFixed(2),
            meses,
            totalPrimerAno: activacion.plus(mensualidad.times(meses)).toFixed(2),
          }
        : null,
      filasMensuales,
      mensual: filasMensuales.length ? conIva(subtotalMensual) : null,
    };
  });

  const alertas: Alerta[] = [];
  const hoyTexto = hoy.toISOString().slice(0, 10);
  for (const p of entrada.promociones) {
    if (p.activa && p.validaHasta && p.validaHasta < hoyTexto) {
      alertas.push({ codigo: "PROMOCION_VENCIDA", mensaje: `La promoción "${p.nombre}" venció el ${p.validaHasta}.` });
    }
    if (p.activa && !vacio(p.descuentoPct) && d(p.descuentoPct as never).gt(30)) {
      alertas.push({ codigo: "DESCUENTO_ALTO", mensaje: `La promoción "${p.nombre}" da más del 30% de descuento.` });
    }
  }
  if (!escenarios.some((e) => e.unico) && entrada.promociones.some((p) => p.activa)) {
    alertas.push({
      codigo: "PROMOCION_SIN_PAGO_UNICO",
      mensaje: "Hay promociones activas, pero no hay pagos únicos a los que aplicarlas (solo renta o mensualidades).",
    });
  }

  const primero = escenarios[0];
  const total = suma([
    d(primero.unico?.total ?? 0),
    d(primero.renta?.activacion ?? 0),
    d(primero.mensual?.total ?? 0),
  ]).toFixed(2);

  return { tipo: "digital", escenarios, alertas, total };
}
