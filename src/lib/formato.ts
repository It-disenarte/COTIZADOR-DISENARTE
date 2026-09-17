// Formatos de presentación (es-MX). Los cálculos nunca usan estos valores.

const moneda = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 2 });
const numero = new Intl.NumberFormat("es-MX", { maximumFractionDigits: 4 });
const fechaCorta = new Intl.DateTimeFormat("es-MX", { dateStyle: "medium" });
const fechaHora = new Intl.DateTimeFormat("es-MX", { dateStyle: "medium", timeStyle: "short" });

export const SIN_DATO = "Por capturar";

export const formatoMoneda = (valor: string | number | null | undefined) =>
  valor == null || valor === "" ? SIN_DATO : moneda.format(Number(valor));

export const formatoNumero = (valor: string | number | null | undefined) =>
  valor == null || valor === "" ? "—" : numero.format(Number(valor));

/** 0.30 → "30%" */
export const formatoFraccion = (valor: string | number | null | undefined) =>
  valor == null || valor === "" ? SIN_DATO : `${numero.format(Number(valor) * 100)}%`;

export const formatoFecha = (valor: Date | string | null | undefined) =>
  valor == null || valor === "" ? "—" : fechaCorta.format(new Date(typeof valor === "string" && valor.length === 10 ? `${valor}T12:00:00` : valor));

export const formatoFechaHora = (valor: Date | string) => fechaHora.format(new Date(valor));

/** Días transcurridos desde una fecha (para el aviso de la gasolina). */
export const diasDesde = (valor: Date | string) =>
  Math.floor((Date.now() - new Date(valor).getTime()) / 86_400_000);
