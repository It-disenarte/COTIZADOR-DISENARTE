import "server-only";
import type { Part } from "@google/genai";
import { z } from "zod";
import { UNIDADES_COSTO } from "@/lib/catalogo/constantes";
import type { UsuarioSesion } from "@/lib/permisos";
import { consultarGemini } from "./gemini";

/**
 * Lectura de listas de costos (el Excel de costos de Diseñarte o listas de proveedores).
 * La IA solo interpreta: qué renglones son insumos, qué columna es el costo y la unidad.
 * Los números de un Excel se comprueban después contra la celda real.
 */

const UNIDADES_IA = [...UNIDADES_COSTO, "desconocida"] as const;

const ListaCostosIa = z.object({
  filas: z
    .array(
      z.object({
        hoja: z.string().max(200),
        fila: z.number().int().min(0).max(100_000),
        seccion: z.string().max(200),
        nombre: z.string().trim().min(1).max(200),
        costo: z.number().min(0).max(100_000_000),
        columnaCosto: z.string().max(200),
        unidad: z.enum(UNIDADES_IA),
        anchoUtilM: z.number().min(0).max(10),
        coincideCon: z.string().max(200),
        confianza: z.number().min(0).max(1),
        nota: z.string().max(500),
      }),
    )
    .max(500),
  notas: z.array(z.string().max(500)).max(20),
});

export type RenglonCostoIa = z.infer<typeof ListaCostosIa>["filas"][number];

const ESQUEMA = {
  type: "object",
  properties: {
    filas: {
      type: "array",
      items: {
        type: "object",
        properties: {
          hoja: { type: "string", description: "Nombre de la hoja del Excel; vacío si es PDF." },
          fila: { type: "integer", description: "Número de fila del Excel (el que va antes de los dos puntos); en PDF, 0." },
          seccion: { type: "string", description: "Título de la sección o tabla donde está el renglón; vacío si no hay." },
          nombre: { type: "string", description: "Nombre del material tal como viene en el archivo." },
          costo: { type: "number", description: "Costo unitario SIN IVA y SIN utilidad, copiado exacto del archivo." },
          columnaCosto: { type: "string", description: "Encabezado de la columna de donde sacaste el costo." },
          unidad: { type: "string", enum: [...UNIDADES_IA] },
          anchoUtilM: { type: "number", description: "Ancho del rollo en metros si el nombre o la tabla lo dice (p. ej. 1.22); si no, 0." },
          coincideCon: { type: "string", description: "Nombre EXACTO del insumo del catálogo al que corresponde, o vacío." },
          confianza: { type: "number", description: "De 0 a 1." },
          nota: { type: "string", description: "Dudas: IVA, utilidad incluida, unidad supuesta. Vacío si no hay." },
        },
        required: ["hoja", "fila", "seccion", "nombre", "costo", "columnaCosto", "unidad", "anchoUtilM", "coincideCon", "confianza", "nota"],
      },
    },
    notas: { type: "array", items: { type: "string" } },
  },
  required: ["filas", "notas"],
};

const INSTRUCCIONES = `Eres asistente de costos de Diseñarte México (señalética, impresión gran formato, rotulación, corte láser).
Te dan una lista de costos (el Excel interno de la empresa o la lista de un proveedor) y el catálogo actual de insumos.
Extrae SOLO los materiales o procesos con costo unitario. Reglas:
- costo: el costo SIN IVA y SIN utilidad ni margen. Si hay varias columnas (precio de compra, subtotal, IVA, costo, utilidad),
  usa la que representa el costo sin IVA y sin utilidad (en el Excel de Diseñarte suele ser "Sub total"). Copia el número tal cual.
  Si solo existe un precio con utilidad o con IVA incluidos, úsalo, baja la confianza y explícalo en "nota".
- unidad: m2 (metro cuadrado), ml (metro lineal de rollo), pieza, lamina (hoja completa de material). Deduce de encabezados
  como "/ ML", "PRECIO DE M2" o "por pieza". Si no se puede saber, "desconocida". No inventes.
- Ignora: calculadoras, simuladores o cotizadores de ejemplo, filas de totales, parámetros sueltos (tinta por mL, merma, etc.),
  renglones sin costo o en 0, y productos terminados que combinan varios materiales.
- coincideCon: si el renglón es el mismo material que un insumo del catálogo, escribe el nombre del catálogo EXACTO. Ojo:
  la misma tela en secciones distintas (p. ej. impresión JV33 y UV) son insumos distintos. Si no hay uno claro, deja vacío.
- hoja y fila: de dónde salió el renglón, para poder comprobarlo. En PDF, hoja vacía y fila 0.
Responde solo con el JSON pedido.`;

export type ItemCatalogo = { nombre: string; categoria: string; unidad: string | null };

export async function interpretarListaCostos(
  actor: UsuarioSesion,
  fuente: { tipo: "tabla"; texto: string } | { tipo: "archivo"; mime: string; bytes: Uint8Array },
  catalogo: ItemCatalogo[],
  resumenEntrada: Record<string, unknown>,
) {
  const listaCatalogo = catalogo
    .map((i) => `- ${i.nombre} (${i.categoria}${i.unidad ? `, por ${i.unidad}` : ""})`)
    .join("\n");

  const partes: Part[] =
    fuente.tipo === "tabla"
      ? [{ text: `ARCHIVO (una línea por fila, "número: COLUMNA=valor"):\n${fuente.texto}` }]
      : [{ inlineData: { mimeType: fuente.mime, data: Buffer.from(fuente.bytes).toString("base64") } }];
  partes.push({ text: `CATÁLOGO ACTUAL DE INSUMOS:\n${listaCatalogo || "(vacío)"}` });

  return consultarGemini({
    actor,
    tarea: "catalogo",
    instrucciones: INSTRUCCIONES,
    partes,
    esquemaJson: ESQUEMA,
    esquemaZod: ListaCostosIa,
    resumenEntrada,
  });
}
