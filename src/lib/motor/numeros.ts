import Decimal from "decimal.js";

// 28 dígitos de precisión: los parciales nunca se redondean (regla 3 de la especificación).
Decimal.set({ precision: 28, rounding: Decimal.ROUND_HALF_UP });

export type Numerico = number | string | Decimal;

/** Convierte a Decimal. Vacío, null o undefined valen 0. */
export function d(valor: Numerico | null | undefined): Decimal {
  if (valor === null || valor === undefined || valor === "") return new Decimal(0);
  return valor instanceof Decimal ? valor : new Decimal(valor);
}

export const CERO = new Decimal(0);

export const suma = (valores: Decimal[]): Decimal => valores.reduce((total, v) => total.plus(v), CERO);

/** Redondeo a 2 decimales, solo para lo que se muestra o se guarda como precio final. */
export const round2 = (valor: Decimal): Decimal => valor.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

/** Texto con 2 decimales, listo para guardar o imprimir. */
export const money = (valor: Decimal): string => round2(valor).toFixed(2);

export { Decimal };
