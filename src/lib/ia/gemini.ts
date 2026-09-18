import "server-only";
import { GoogleGenAI, type Part } from "@google/genai";
import { and, count, eq, gte } from "drizzle-orm";
import type { z } from "zod";
import { db } from "@/lib/db";
import { llamadasIa } from "@/lib/db/schema";
import { ErrorHttp } from "@/lib/errores";
import type { UsuarioSesion } from "@/lib/permisos";

/**
 * Gemini se usa solo desde el servidor y solo cuando alguien presiona un botón.
 * Variables de entorno:
 *   GEMINI_API_KEY      obligatoria para usar la IA (sin ella los botones avisan y se captura a mano)
 *   GEMINI_MODEL        opcional; por defecto el Flash estable más reciente
 *   GEMINI_LIMITE_HORA  opcional; llamadas por usuario por hora (30 por defecto)
 */
export const MODELO_PREDETERMINADO = "gemini-3.8-flash";
const TIEMPO_MAXIMO_MS = 55_000;

export const modeloGemini = () => process.env.GEMINI_MODEL?.trim() || MODELO_PREDETERMINADO;
const limitePorHora = () => Number(process.env.GEMINI_LIMITE_HORA) || 30;

export type Fuente = { titulo: string; url: string };

type Consulta<T> = {
  actor: UsuarioSesion;
  /** Nombre corto de la tarea, para el registro y el límite. */
  tarea: "levantamiento" | "reventa" | "alcance" | "catalogo";
  instrucciones: string;
  partes: Part[];
  /** Esquema JSON que se le pide a Gemini. */
  esquemaJson: Record<string, unknown>;
  /** Validación de lo que devuelve: si no cumple, no se usa. */
  esquemaZod: z.ZodType<T>;
  /** Búsqueda en Google (grounding) para tener fuentes reales. */
  busqueda?: boolean;
  /** Lo que se guarda de la entrada (nunca archivos completos). */
  resumenEntrada: Record<string, unknown>;
};

let cliente: GoogleGenAI | null = null;
function obtenerCliente(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    throw new ErrorHttp(
      503,
      "La IA no está configurada todavía (falta GEMINI_API_KEY). Mientras tanto, captura a mano.",
      "IA_SIN_CONFIGURAR",
    );
  }
  cliente ??= new GoogleGenAI({ apiKey });
  return cliente;
}

async function exigirCupo(usuarioId: string) {
  const haceUnaHora = new Date(Date.now() - 60 * 60 * 1000);
  const [{ total }] = await db
    .select({ total: count() })
    .from(llamadasIa)
    .where(and(eq(llamadasIa.usuarioId, usuarioId), gte(llamadasIa.creadoEn, haceUnaHora)));
  const limite = limitePorHora();
  if (total >= limite) {
    throw new ErrorHttp(429, `Llegaste al límite de ${limite} consultas a la IA por hora. Intenta más tarde.`, "IA_LIMITE");
  }
}

/**
 * Saca el JSON de la respuesta. Con salida estructurada llega limpio; con búsqueda
 * en Google algunos modelos lo envuelven en ```json … ```, así que se tolera.
 */
export function extraerJson(texto: string): unknown {
  const limpio = texto.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try {
    return JSON.parse(limpio);
  } catch {
    const inicio = limpio.indexOf("{");
    const fin = limpio.lastIndexOf("}");
    if (inicio === -1 || fin <= inicio) throw new Error("sin JSON");
    return JSON.parse(limpio.slice(inicio, fin + 1));
  }
}

export async function consultarGemini<T>(consulta: Consulta<T>): Promise<{ datos: T; fuentes: Fuente[]; modelo: string }> {
  const ia = obtenerCliente();
  await exigirCupo(consulta.actor.id);

  const modelo = modeloGemini();
  const inicio = Date.now();
  const registrar = (exito: boolean, salida: unknown) =>
    db.insert(llamadasIa).values({
      usuarioId: consulta.actor.id,
      tarea: consulta.tarea,
      modelo,
      exito,
      entrada: consulta.resumenEntrada,
      salida: salida ?? null,
      duracionMs: Date.now() - inicio,
    });

  let texto: string;
  let fuentes: Fuente[] = [];
  try {
    const respuesta = await ia.models.generateContent({
      model: modelo,
      contents: [{ role: "user", parts: consulta.partes }],
      config: {
        systemInstruction: consulta.instrucciones,
        responseMimeType: "application/json",
        responseJsonSchema: consulta.esquemaJson,
        temperature: 0.2,
        tools: consulta.busqueda ? [{ googleSearch: {} }] : undefined,
        httpOptions: { timeout: TIEMPO_MAXIMO_MS },
      },
    });
    texto = respuesta.text ?? "";
    fuentes = (respuesta.candidates?.[0]?.groundingMetadata?.groundingChunks ?? [])
      .map((c) => ({ titulo: c.web?.title ?? "", url: c.web?.uri ?? "" }))
      .filter((f) => f.url);
  } catch (error) {
    const detalle = error instanceof Error ? error.message : String(error);
    await registrar(false, { error: detalle.slice(0, 500) });
    console.error("[ia] Gemini falló", detalle);
    throw new ErrorHttp(502, "No se pudo consultar a la IA en este momento. Intenta de nuevo o captura a mano.", "IA_FALLO");
  }

  let datos: T;
  try {
    datos = consulta.esquemaZod.parse(extraerJson(texto));
  } catch {
    await registrar(false, { error: "respuesta inválida", texto: texto.slice(0, 2000) });
    throw new ErrorHttp(
      502,
      "La IA respondió algo que no se pudo leer. Intenta de nuevo o captura a mano.",
      "IA_RESPUESTA_INVALIDA",
    );
  }

  await registrar(true, { datos, fuentes });
  return { datos, fuentes, modelo };
}
