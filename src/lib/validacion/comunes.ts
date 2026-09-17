import { z } from "zod";

const vacioANull = (v: unknown) => (typeof v === "string" && v.trim() === "" ? null : v);

/**
 * Número decimal validado y normalizado como string (así se guarda en numeric sin pasar por float).
 * Acepta number o string ("1,234.50" también).
 */
export function decimal({ min, max, maxExclusivo = false, escala = 4 }: { min?: number; max?: number; maxExclusivo?: boolean; escala?: number } = {}) {
  return z
    .union([z.number(), z.string()])
    .transform((v) => (typeof v === "number" ? String(v) : v.trim().replace(/,/g, "")))
    .refine((v) => /^-?\d+(\.\d+)?$/.test(v), { error: "Escribe un número válido." })
    .refine((v) => (v.split(".")[1]?.length ?? 0) <= escala, { error: `Máximo ${escala} decimales.` })
    .refine((v) => min === undefined || Number(v) >= min, { error: `Debe ser mayor o igual a ${min}.` })
    .refine((v) => max === undefined || (maxExclusivo ? Number(v) < max : Number(v) <= max), {
      error: maxExclusivo ? `Debe ser menor a ${max}.` : `Debe ser menor o igual a ${max}.`,
    });
}

/** Decimal opcional: "" o null → null. */
export const decimalOpcional = (opciones?: Parameters<typeof decimal>[0]) =>
  z.preprocess(vacioANull, decimal(opciones).nullable());

/** Texto opcional: "" → null. */
export const textoOpcional = (max = 500) => z.preprocess(vacioANull, z.string().trim().max(max).nullable());

export const textoRequerido = (max = 200, mensaje = "Este campo es obligatorio.") =>
  z.string().trim().min(1, { error: mensaje }).max(max);

export const urlOpcional = z.preprocess(vacioANull, z.url({ error: "URL inválida." }).max(2000).nullable());

/** Fecha YYYY-MM-DD opcional. */
export const fechaOpcional = z.preprocess(
  vacioANull,
  z.iso.date({ error: "Fecha inválida." }).nullable(),
);

export const Uuid = z.uuid({ error: "Identificador inválido." });
