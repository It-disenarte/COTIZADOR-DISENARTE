/**
 * Lectura del brief que exporta Google Forms (Respuestas → Hojas de cálculo → Descargar CSV). Cada
 * renglón es un cliente; cada columna, una pregunta. Las respuestas traen comas, comillas y saltos
 * de línea, así que no basta con partir por comas. Módulo puro: lo usan la pantalla y las pruebas.
 */

export type RespuestaBrief = { pregunta: string; respuesta: string };

/** CSV según el estándar (RFC 4180): comillas dobles, "" como comilla escapada y saltos de línea dentro. */
export function leerCsv(texto: string): string[][] {
  const renglones: string[][] = [];
  let renglon: string[] = [];
  let celda = "";
  let entreComillas = false;
  const limpio = texto.replace(/^﻿/, "");

  for (let i = 0; i < limpio.length; i++) {
    const c = limpio[i];
    if (entreComillas) {
      if (c === '"' && limpio[i + 1] === '"') {
        celda += '"';
        i++;
      } else if (c === '"') {
        entreComillas = false;
      } else {
        celda += c;
      }
    } else if (c === '"') {
      entreComillas = true;
    } else if (c === ",") {
      renglon.push(celda);
      celda = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && limpio[i + 1] === "\n") i++;
      renglon.push(celda);
      renglones.push(renglon);
      renglon = [];
      celda = "";
    } else {
      celda += c;
    }
  }
  if (celda !== "" || renglon.length) {
    renglon.push(celda);
    renglones.push(renglon);
  }
  return renglones.filter((r) => r.some((c) => c.trim() !== ""));
}

export type BriefLeido = { encabezados: string[]; clientes: { etiqueta: string; respuestas: RespuestaBrief[] }[] };

const LARGO_MAXIMO = 5000;

/** Encabezados y un cliente por renglón, con una etiqueta para elegirlo (negocio y fecha). */
export function leerBrief(texto: string): BriefLeido {
  const [encabezados = [], ...renglones] = leerCsv(texto);
  if (encabezados.length < 2 || renglones.length === 0) {
    throw new Error("El archivo no parece un brief: no trae preguntas o no tiene respuestas.");
  }
  const columna = (patron: RegExp) => encabezados.findIndex((e) => patron.test(e));
  const colNegocio = columna(/nombre del negocio|nombre de la empresa/i);
  const colPersona = columna(/nombre completo/i);
  const colFecha = columna(/marca temporal/i);

  return {
    encabezados,
    clientes: renglones.map((r, i) => {
      const nombre = (colNegocio >= 0 && r[colNegocio]?.trim()) || (colPersona >= 0 && r[colPersona]?.trim()) || `Respuesta ${i + 1}`;
      const fecha = colFecha >= 0 ? r[colFecha]?.trim() : "";
      return {
        etiqueta: fecha ? `${nombre} · ${fecha}` : nombre,
        respuestas: encabezados
          .map((pregunta, j) => ({ pregunta: pregunta.trim(), respuesta: (r[j] ?? "").trim().slice(0, LARGO_MAXIMO) }))
          .filter((x) => x.pregunta && x.respuesta),
      };
    }),
  };
}
