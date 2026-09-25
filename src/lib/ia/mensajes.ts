import "server-only";
import { z } from "zod";
import type { UsuarioSesion } from "@/lib/permisos";
import { consultarGemini } from "./gemini";

/**
 * Redacta la comunicación al cliente conforme al PNO-COM-01:
 *   Fase 2 (7.3) — correo formal con la propuesta.
 *   Fase 3 (7.4) — mensaje breve de WhatsApp, sin cifras, con una pregunta técnica.
 * Los datos salen de la cotización ya autorizada: la IA solo redacta, no calcula.
 */

const MensajesIa = z.object({
  asunto: z.string().trim().min(1).max(200),
  correo: z.string().trim().min(1).max(4000),
  whatsapp: z.string().trim().min(1).max(1200),
  preguntaTecnica: z.string().trim().max(300),
});

export type Mensajes = z.infer<typeof MensajesIa>;

const ESQUEMA = {
  type: "object",
  properties: {
    asunto: { type: "string", description: "Asunto del correo, con el concepto y la empresa." },
    correo: { type: "string", description: "Cuerpo del correo en texto plano, con saltos de línea." },
    whatsapp: { type: "string", description: "Mensaje de WhatsApp, un párrafo breve, sin cifras." },
    preguntaTecnica: { type: "string", description: "La pregunta concreta que se le hace al cliente." },
  },
  required: ["asunto", "correo", "whatsapp", "preguntaTecnica"],
};

const INSTRUCCIONES = `Redactas la comunicación comercial de Diseñarte México (San Juan del Río, Querétaro) siguiendo su
procedimiento PNO-COM-01. Escribes en español de México, en tono cálido y profesional, de usted.

CORREO (Fase 2):
- Dirígete al contacto por su nombre y su puesto cuando los tengas.
- Estructura: saludo; concepto del trabajo; descripción (material, medidas, colores, diseño e instalación);
  lo que NO incluye, dicho de forma clara; las modalidades cuando haya más de una, cada una con su precio;
  las condiciones comerciales (vigencia, tiempo de entrega, forma de pago) y los supuestos; y el cierre con la
  petición de acción que te indiquen.
- Los precios que te doy son de venta. Muéstralos tal cual: subtotal, IVA y total. NUNCA menciones costos, márgenes,
  utilidades ni cómo se calculó el precio: eso es información interna.
- Menciona que la propuesta detallada va adjunta en PDF.
- Cierra con "Quedo atento a sus comentarios." y la firma del asesor con el nombre de la empresa.
- No inventes materiales, garantías, plazos ni descuentos que no estén en los datos.

WHATSAPP (Fase 3):
- Un párrafo breve; no repite el correo ni lo resume entero.
- Avisa que ya se envió la propuesta por correo.
- Enuncia las modalidades en una línea cada una, SIN cifras de ningún tipo.
- Incluye una pregunta técnica concreta que el cliente deba responder (algo pendiente de confirmar: medidas,
  material, accesos, modelo de la unidad, fecha). La misma pregunta va en "preguntaTecnica".
- Reitera la petición de acción en términos coloquiales.
Responde solo con el JSON pedido.`;

export type DatosMensajes = {
  folio: string;
  titulo: string;
  concepto: string | null;
  resumen: string | null;
  empresa: string | null;
  contacto: string;
  puesto: string | null;
  asesor: string | null;
  piezas: string;
  areas: string[];
  tiempoEstimado: string | null;
  incluyeEnvio: boolean;
  incluyeInstalacion: boolean;
  retiroGraficosPrevios: boolean;
  notasSuperficie: string | null;
  noIncluye: string | null;
  supuestos: string | null;
  vigenciaDias: string | null;
  peticionAccion: string | null;
  /** Solo precios de venta: el desglose de costos jamás sale de la empresa. */
  opciones: { nombre: string; descripcion: string | null; modalidad: string; subtotal: string; iva: string; total: string }[];
  reventa: { nombre: string; cantidad: string; subtotal: string }[];
};

const PETICIONES: Record<string, string> = {
  visita: "Solicitar una visita a sus instalaciones o una reunión para revisar la propuesta.",
  piloto: "Solicitar el ingreso de la pieza piloto para ejecutarla.",
  orden_compra: "Solicitar la orden de compra.",
};

export async function redactarMensajes(actor: UsuarioSesion, datos: DatosMensajes): Promise<Mensajes> {
  const dinero = (valor: string) => `$${Number(valor).toLocaleString("es-MX", { minimumFractionDigits: 2 })}`;
  const texto = [
    `Folio: ${datos.folio}`,
    `Concepto: ${datos.concepto || datos.titulo}`,
    datos.resumen ? `Resumen del alcance: ${datos.resumen}` : null,
    `Cliente: ${datos.empresa ?? "sin empresa"} — contacto ${datos.contacto}${datos.puesto ? `, ${datos.puesto}` : ""}`,
    `Asesor que firma: ${datos.asesor ?? "el equipo de Diseñarte México"}`,
    `Piezas: ${datos.piezas}${datos.areas.length ? ` en ${datos.areas.join(", ")}` : ""}`,
    `Tiempo de entrega: ${datos.tiempoEstimado || "por confirmar"}`,
    `Incluye envío: ${datos.incluyeEnvio ? "sí" : "no"}`,
    `Incluye instalación: ${datos.incluyeInstalacion ? "sí" : "no"}`,
    datos.retiroGraficosPrevios ? "Incluye retiro de gráficos previos." : null,
    datos.notasSuperficie ? `Condición de la superficie: ${datos.notasSuperficie}` : null,
    datos.noIncluye ? `NO incluye: ${datos.noIncluye}` : null,
    datos.supuestos ? `Supuestos: ${datos.supuestos}` : null,
    datos.vigenciaDias ? `Vigencia: ${datos.vigenciaDias} días naturales` : null,
    datos.peticionAccion ? `Petición de acción: ${PETICIONES[datos.peticionAccion] ?? datos.peticionAccion}` : null,
    "",
    "PRECIOS DE VENTA (los únicos que se pueden mostrar):",
    ...datos.opciones.map(
      (o) =>
        `- ${o.modalidad}${o.nombre ? ` · ${o.nombre}` : ""}${o.descripcion ? ` (${o.descripcion})` : ""}: ` +
        `subtotal ${dinero(o.subtotal)}, IVA ${dinero(o.iva)}, total ${dinero(o.total)}`,
    ),
    ...(datos.reventa.length
      ? ["Materiales adicionales:", ...datos.reventa.map((r) => `- ${r.cantidad} × ${r.nombre}: ${dinero(r.subtotal)}`)]
      : []),
  ]
    .filter((linea) => linea !== null)
    .join("\n");

  const { datos: mensajes } = await consultarGemini({
    actor,
    tarea: "mensajes",
    instrucciones: INSTRUCCIONES,
    partes: [{ text: texto }],
    esquemaJson: ESQUEMA,
    esquemaZod: MensajesIa,
    resumenEntrada: { folio: datos.folio, opciones: datos.opciones.length },
  });
  return mensajes;
}
