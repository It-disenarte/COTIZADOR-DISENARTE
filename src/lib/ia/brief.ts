import "server-only";
import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { serviciosDigitales } from "@/lib/db/schema";
import { requirePermiso, type UsuarioSesion } from "@/lib/permisos";
import { consultarGemini } from "./gemini";

/**
 * Lee el brief contestado por el cliente y propone cómo armar la cotización de Digitalización:
 * paquete web, servicios extra que el brief pide (logo, página extra, ficha de Google…), el resumen
 * de alcance y lo que no incluye. La IA NUNCA pone precios: solo elige servicios del catálogo, que
 * ya traen el suyo. Nada se aplica sin que el vendedor lo revise.
 */

const PropuestaIa = z.object({
  paquete: z.number().int().nullable(),
  extras: z.array(z.object({ numero: z.number().int(), motivo: z.string().trim().max(300) })).max(20),
  concepto: z.string().trim().max(150),
  resumen: z.string().trim().max(600),
  noIncluye: z.array(z.string().trim().max(300)).max(10),
  supuestos: z.array(z.string().trim().max(300)).max(10),
});

const ESQUEMA = {
  type: "object",
  properties: {
    paquete: { type: "integer", nullable: true, description: "Número del paquete web que corresponde al brief, o null." },
    extras: {
      type: "array",
      items: {
        type: "object",
        properties: {
          numero: { type: "integer", description: "Número del servicio del catálogo." },
          motivo: { type: "string", description: "Qué dijo el cliente que lo justifica, en una frase." },
        },
        required: ["numero", "motivo"],
      },
    },
    concepto: { type: "string", description: "Frase corta de lo que se cotiza." },
    resumen: { type: "string", description: "Resumen del alcance, máximo 60 palabras." },
    noIncluye: { type: "array", items: { type: "string" }, description: "Cosas que el cliente podría dar por hechas y no van." },
    supuestos: { type: "array", items: { type: "string" }, description: "Datos que se suponen porque el cliente no los confirmó." },
  },
  required: ["paquete", "extras", "concepto", "resumen", "noIncluye", "supuestos"],
};

const INSTRUCCIONES = `Eres parte del equipo comercial de Diseñarte México y lees el brief que contestó un cliente para su
página web o sus servicios digitales. Te doy el catálogo de servicios numerado y las respuestas del brief.

Propón:
- paquete: el número del paquete web que corresponde (el nombre del archivo o las preguntas suelen decir cuál
  eligió: Hola Mundo, Next Level o Rockstar Digital). null si no aplica.
- extras: servicios del catálogo que el cliente PIDE o NECESITA según sus respuestas. Ejemplos: no tiene logo y
  pidió cotizarlo → Logotipo y Mini manual; pide una página más de las incluidas → Página adicional; quiere tienda
  con carrito → Tienda en línea; no tiene ficha de Google o no la controla → alta o recuperación de ficha; pide
  redactar artículos → Redacción de artículo de blog; no tiene aviso de privacidad → Aviso de privacidad.
  Incluye solo lo que tenga sustento en el brief, con el motivo en una frase. No repitas el paquete.
- concepto y resumen: el alcance para la propuesta, con los datos reales del cliente (giro, lo que quiere lograr,
  secciones que pidió). Tono formal y claro, español de México, de usted.
- noIncluye: lo que el cliente podría dar por hecho y no va (p. ej. fotografía profesional si usará fotos de banco).
- supuestos: lo que se asume porque el cliente no lo confirmó o lo entregará después (logo en alta calidad,
  permisos de fotos, textos pendientes).

Reglas: usa SOLO números del catálogo que te doy. No pongas precios ni cantidades de dinero. No inventes datos
que no estén en el brief. Responde solo con el JSON pedido.`;

export type PropuestaBrief = {
  paqueteId: string | null;
  extras: { servicioId: string; nombre: string; motivo: string }[];
  concepto: string;
  resumen: string;
  noIncluye: string[];
  supuestos: string[];
  modelo: string;
};

export async function analizarBrief(
  actor: UsuarioSesion | null,
  datos: { archivo: string; respuestas: { pregunta: string; respuesta: string }[] },
): Promise<PropuestaBrief> {
  requirePermiso(actor, "cotizaciones.propias");

  // El catálogo lo lee el servidor: la IA solo puede elegir servicios que existen.
  const catalogo = await db
    .select({ id: serviciosDigitales.id, nombre: serviciosDigitales.nombre, categoria: serviciosDigitales.categoria, cobro: serviciosDigitales.cobro })
    .from(serviciosDigitales)
    .where(eq(serviciosDigitales.archivado, false))
    .orderBy(asc(serviciosDigitales.categoria), asc(serviciosDigitales.nombre));

  const texto = [
    `Archivo del brief: ${datos.archivo}`,
    "",
    "CATÁLOGO DE SERVICIOS:",
    ...catalogo.map((s, i) => `${i + 1}. ${s.nombre} (${s.categoria}${s.cobro === "paquete" ? ", paquete web" : ""})`),
    "",
    "RESPUESTAS DEL BRIEF:",
    ...datos.respuestas.map((r) => `- ${r.pregunta}: ${r.respuesta}`),
  ].join("\n");

  const { datos: propuesta, modelo } = await consultarGemini({
    actor,
    tarea: "brief",
    instrucciones: INSTRUCCIONES,
    partes: [{ text: texto }],
    esquemaJson: ESQUEMA,
    esquemaZod: PropuestaIa,
    resumenEntrada: { archivo: datos.archivo, respuestas: datos.respuestas.length },
  });

  // Solo se aceptan números del catálogo; el paquete tiene que ser un paquete web.
  const servicio = (n: number | null) => (n != null ? catalogo[n - 1] : undefined);
  const paquete = servicio(propuesta.paquete);
  const vistos = new Set<string>(paquete ? [paquete.id] : []);
  const extras = propuesta.extras.flatMap(({ numero, motivo }) => {
    const s = servicio(numero);
    if (!s || vistos.has(s.id) || s.cobro === "paquete") return [];
    vistos.add(s.id);
    return [{ servicioId: s.id, nombre: s.nombre, motivo }];
  });

  return {
    paqueteId: paquete?.cobro === "paquete" ? paquete.id : null,
    extras,
    concepto: propuesta.concepto,
    resumen: propuesta.resumen,
    noIncluye: propuesta.noIncluye.filter(Boolean),
    supuestos: propuesta.supuestos.filter(Boolean),
    modelo,
  };
}
