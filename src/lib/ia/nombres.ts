import "server-only";
import { and, asc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { insumos } from "@/lib/db/schema";
import { requirePermiso, type UsuarioSesion } from "@/lib/permisos";
import { consultarGemini } from "./gemini";

/**
 * Propone el "nombre para el cliente" de los insumos que no lo tienen: lo que sale en las viñetas
 * de cada concepto en el PDF. No guarda nada: la persona lo revisa y decide qué se queda.
 */

/** Tantos por consulta para que la respuesta no se corte; lo que quede se pide con otro clic. */
const POR_CONSULTA = 60;

const NombresIa = z.object({
  nombres: z.array(z.object({ numero: z.number().int(), nombreCliente: z.string().trim().min(1).max(200) })).max(POR_CONSULTA),
});

const ESQUEMA = {
  type: "object",
  properties: {
    nombres: {
      type: "array",
      items: {
        type: "object",
        properties: {
          numero: { type: "integer", description: "El número del insumo, tal cual se te dio." },
          nombreCliente: { type: "string", description: "Cómo se le describe al cliente, máximo 60 caracteres." },
        },
        required: ["numero", "nombreCliente"],
      },
    },
  },
  required: ["nombres"],
};

const INSTRUCCIONES = `Eres parte del equipo comercial de Diseñarte México, un taller de señalética, impresión de gran
formato, rotulación y corte láser. Te doy los nombres INTERNOS de sus insumos (como aparecen en su catálogo de
costos). Para cada uno escribe cómo se le describe a un CLIENTE en la propuesta, como una viñeta de "Descripción".

Reglas:
- Español de México, claro y profesional, máximo 60 caracteres, sin punto final.
- Quita lo que solo entiende el taller: modelos de máquina (JV33, UV), anchos de rollo (1.22, 1.52),
  claves y abreviaturas internas.
- Conserva lo que al cliente sí le importa: material, espesor y calibre (3 mm, cal. 40), acabado si viene en el nombre.
- Describe el material o el proceso: "Corte de vinil de color", "Impresión digital en vinil transparente",
  "Base de trovicel de 3 mm", "Acrílico de 6 mm con corte láser".
- NO inventes colores, acabados, medidas ni características que no estén en el nombre.
- Si el nombre ya es claro para un cliente, déjalo casi igual.
Responde solo con el JSON pedido, un elemento por cada número que te di.`;

export type SugerenciaNombre = { insumoId: string; nombre: string; categoria: string; nombreCliente: string };

export async function sugerirNombresCliente(
  actor: UsuarioSesion | null,
): Promise<{ sugerencias: SugerenciaNombre[]; pendientes: number; modelo: string | null }> {
  requirePermiso(actor, "catalogo.editar");

  const sinNombre = await db
    .select({ id: insumos.id, nombre: insumos.nombre, categoria: insumos.categoria })
    .from(insumos)
    .where(and(isNull(insumos.nombreCliente), eq(insumos.archivado, false)))
    .orderBy(asc(insumos.categoria), asc(insumos.nombre));
  if (sinNombre.length === 0) return { sugerencias: [], pendientes: 0, modelo: null };

  const lote = sinNombre.slice(0, POR_CONSULTA);
  const lista = lote.map((insumo, i) => `${i + 1}. ${insumo.nombre} (categoría: ${insumo.categoria})`).join("\n");

  const { datos, modelo } = await consultarGemini({
    actor,
    tarea: "nombres",
    instrucciones: INSTRUCCIONES,
    partes: [{ text: lista }],
    esquemaJson: ESQUEMA,
    esquemaZod: NombresIa,
    resumenEntrada: { insumos: lote.length },
  });

  // Solo se aceptan números que sí se mandaron: la IA no puede nombrar un insumo que no existe.
  const vistos = new Set<number>();
  const sugerencias = datos.nombres.flatMap(({ numero, nombreCliente }) => {
    const insumo = lote[numero - 1];
    if (!insumo || vistos.has(numero)) return [];
    vistos.add(numero);
    return [{ insumoId: insumo.id, nombre: insumo.nombre, categoria: insumo.categoria, nombreCliente: nombreCliente.replace(/\.$/, "") }];
  });

  return { sugerencias, pendientes: sinNombre.length - lote.length, modelo };
}
