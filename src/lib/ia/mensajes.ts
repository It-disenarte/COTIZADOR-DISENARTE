import "server-only";
import { z } from "zod";
import type { UsuarioSesion } from "@/lib/permisos";
import { consultarGemini } from "./gemini";

/**
 * Redacta la comunicación con la que se manda la propuesta al cliente (PNO-COM-01, 7.3). Hay dos
 * canales independientes, correo o WhatsApp: el vendedor elige por dónde la manda y cada mensaje
 * se sostiene solo, sin dar por hecho que se mandó el otro.
 * Los datos salen de la cotización ya autorizada: la IA solo redacta, no calcula.
 */

export const CANALES = ["correo", "whatsapp"] as const;
export type Canal = (typeof CANALES)[number];

const CorreoIa = z.object({
  asunto: z.string().trim().min(1).max(200),
  correo: z.string().trim().min(1).max(4000),
});
const WhatsappIa = z.object({
  whatsapp: z.string().trim().min(1).max(1500),
});

export type Mensaje = ({ canal: "correo" } & z.infer<typeof CorreoIa>) | ({ canal: "whatsapp" } & z.infer<typeof WhatsappIa>);

const ESQUEMA_CORREO = {
  type: "object",
  properties: {
    asunto: { type: "string", description: "Asunto del correo, con el concepto y la empresa." },
    correo: { type: "string", description: "Cuerpo del correo en texto plano, con saltos de línea." },
  },
  required: ["asunto", "correo"],
};
const ESQUEMA_WHATSAPP = {
  type: "object",
  properties: { whatsapp: { type: "string", description: "Mensaje de WhatsApp en texto plano, con saltos de línea." } },
  required: ["whatsapp"],
};

const REGLAS_COMUNES = `Redactas la comunicación comercial de Diseñarte México (San Juan del Río, Querétaro) siguiendo su
procedimiento PNO-COM-01. Escribes en español de México, en tono cálido y profesional, de usted.
- Dirígete al contacto por su nombre y su puesto cuando los tengas.
- Los precios que te doy son de venta. Muéstralos tal cual. NUNCA menciones costos, márgenes, utilidades ni cómo
  se calculó el precio: eso es información interna.
- Menciona que la propuesta detallada va adjunta en PDF.
- No inventes materiales, garantías, plazos ni descuentos que no estén en los datos.
- No des por hecho que el cliente recibió otro mensaje: este mensaje es por sí solo el envío de la propuesta.`;

const INSTRUCCIONES: Record<Canal, string> = {
  correo: `${REGLAS_COMUNES}

CORREO:
- Estructura: saludo; concepto del trabajo; descripción (material, medidas, colores, diseño e instalación);
  lo que NO incluye, dicho de forma clara; las opciones o modalidades cuando haya más de una, cada una con su
  subtotal, IVA y total; las condiciones comerciales (vigencia, tiempo de entrega) y los supuestos.
- Cierra invitando a resolver cualquier duda, con "Quedo atento a sus comentarios." y la firma del asesor con el
  nombre de la empresa.
Responde solo con el JSON pedido.`,
  whatsapp: `${REGLAS_COMUNES}

WHATSAPP:
- Breve y fácil de leer en el celular: saludo con su nombre, el concepto en una línea, y una línea por cada opción
  o modalidad con su total con IVA incluido.
- Agrega el tiempo de entrega y la vigencia si los tengo, y lo que NO incluye en una frase si lo hay.
- Cierra invitándolo a resolver dudas por este medio y firma con el nombre del asesor y de la empresa.
- Sin viñetas de Markdown ni negritas con asteriscos dobles; puedes usar saltos de línea y guiones simples.
Responde solo con el JSON pedido.`,
};

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
  /** Solo precios de venta: el desglose de costos jamás sale de la empresa. */
  opciones: { nombre: string; descripcion: string | null; modalidad: string; subtotal: string; iva: string; total: string }[];
  reventa: { nombre: string; cantidad: string; subtotal: string }[];
};

export async function redactarMensaje(actor: UsuarioSesion, datos: DatosMensajes, canal: Canal): Promise<Mensaje> {
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

  const consulta = {
    actor,
    tarea: "mensajes" as const,
    partes: [{ text: texto }],
    resumenEntrada: { folio: datos.folio, canal, opciones: datos.opciones.length },
  };
  if (canal === "correo") {
    const { datos: correo } = await consultarGemini({
      ...consulta,
      instrucciones: INSTRUCCIONES.correo,
      esquemaJson: ESQUEMA_CORREO,
      esquemaZod: CorreoIa,
    });
    return { canal, ...correo };
  }
  const { datos: whatsapp } = await consultarGemini({
    ...consulta,
    instrucciones: INSTRUCCIONES.whatsapp,
    esquemaJson: ESQUEMA_WHATSAPP,
    esquemaZod: WhatsappIa,
  });
  return { canal, ...whatsapp };
}
