import "server-only";
import { z } from "zod";
import { ErrorHttp } from "@/lib/errores";
import { requirePermiso, type UsuarioSesion } from "@/lib/permisos";
import { consultarGemini, type Fuente } from "./gemini";

// 9.1 Leer levantamiento ----------------------------------------------------------------------

/** PDF o imagen. Vercel no acepta peticiones de más de 4.5 MB, por eso el tope es 4 MB. */
export const TIPOS_LEVANTAMIENTO = ["application/pdf", "image/jpeg", "image/png", "image/webp"] as const;
export const TAMANO_MAXIMO_LEVANTAMIENTO = 4 * 1024 * 1024;

const LevantamientoIa = z.object({
  areas: z.array(z.string().trim().max(100)).max(30),
  filas: z
    .array(
      z.object({
        concepto: z.string().trim().max(200),
        anchoM: z.number().min(0).max(100),
        altoM: z.number().min(0).max(100),
        cantidades: z.array(z.number().min(0).max(1_000_000)).max(30),
        confianza: z.number().min(0).max(1),
      }),
    )
    .max(500),
  notas: z.array(z.string().max(500)).max(20),
});

export type FilaLevantamientoIa = {
  concepto: string;
  anchoM: string;
  altoM: string;
  cantidades: string[];
  confianza: number;
};
export type ResultadoLevantamientoIa = { areas: string[]; filas: FilaLevantamientoIa[]; notas: string[] };

const ESQUEMA_LEVANTAMIENTO = {
  type: "object",
  properties: {
    areas: { type: "array", items: { type: "string" }, description: "Nombres de las áreas o ubicaciones (columnas)." },
    filas: {
      type: "array",
      items: {
        type: "object",
        properties: {
          concepto: { type: "string" },
          anchoM: { type: "number", description: "Ancho en metros; 0 si se cobra por pieza." },
          altoM: { type: "number", description: "Alto en metros; 0 si se cobra por pieza." },
          cantidades: { type: "array", items: { type: "number" }, description: "Una cantidad por área, en el mismo orden." },
          confianza: { type: "number", description: "De 0 a 1: qué tan seguro estás de esta fila." },
        },
        required: ["concepto", "anchoM", "altoM", "cantidades", "confianza"],
      },
    },
    notas: { type: "array", items: { type: "string" }, description: "Dudas o supuestos que el vendedor debe revisar." },
  },
  required: ["areas", "filas", "notas"],
};

const INSTRUCCIONES_LEVANTAMIENTO = `Eres asistente de cotización de Diseñarte México (señalética, impresión, rotulación, fotomurales).
Te dan un levantamiento: lista de piezas que el cliente necesita. Extrae una tabla con:
- areas: las ubicaciones o zonas en que el documento reparte las cantidades (por ejemplo CENDI, Primaria, Secundaria). Si no hay reparto por áreas, usa una sola llamada "General".
- filas: una por concepto distinto (misma pieza y misma medida). "cantidades" lleva una cantidad por área, en el mismo orden que "areas"; usa 0 donde no aplique.
- Medidas SIEMPRE en metros: 20 cm = 0.2, 1500 mm = 1.5. Si el documento no dice la unidad y los números son como 20x30, son centímetros. Si una pieza se cobra por pieza o no trae medida, pon 0 y 0.
- No inventes piezas, medidas ni cantidades. Si algo es ilegible o ambiguo, pon tu mejor lectura con confianza menor a 0.7 y explícalo en "notas".
- Conserva el nombre del concepto como lo escribe el cliente, corto y en español.
Responde solo con el JSON pedido.`;

function numeroTexto(valor: number, decimales: number): string {
  return String(Number(valor.toFixed(decimales)));
}

export async function leerLevantamiento(
  actor: UsuarioSesion | null,
  archivo: { nombre: string; tipo: string; bytes: Uint8Array },
  instruccion: string,
): Promise<ResultadoLevantamientoIa & { modelo: string }> {
  requirePermiso(actor, "cotizaciones.propias");
  if (!(TIPOS_LEVANTAMIENTO as readonly string[]).includes(archivo.tipo)) {
    throw new ErrorHttp(415, "Sube un PDF o una imagen (JPG, PNG o WebP).", "IA_TIPO_ARCHIVO");
  }
  if (archivo.bytes.byteLength > TAMANO_MAXIMO_LEVANTAMIENTO) {
    throw new ErrorHttp(413, "El archivo pesa más de 4 MB. Divídelo o sube capturas de las páginas.", "IA_ARCHIVO_PESADO");
  }

  const { datos, modelo } = await consultarGemini({
    actor,
    tarea: "levantamiento",
    instrucciones: INSTRUCCIONES_LEVANTAMIENTO,
    partes: [
      { inlineData: { mimeType: archivo.tipo, data: Buffer.from(archivo.bytes).toString("base64") } },
      { text: instruccion.trim() ? `Indicaciones del vendedor: ${instruccion.trim()}` : "Extrae el levantamiento." },
    ],
    esquemaJson: ESQUEMA_LEVANTAMIENTO,
    esquemaZod: LevantamientoIa,
    resumenEntrada: {
      archivo: archivo.nombre,
      tipo: archivo.tipo,
      bytes: archivo.bytes.byteLength,
      instruccion: instruccion.slice(0, 500),
    },
  });

  // La tabla del asistente necesita al menos un área y una cantidad por área en cada fila.
  const areas = datos.areas.filter(Boolean).length ? datos.areas.filter(Boolean) : ["General"];
  const filas = datos.filas
    .filter((f) => f.concepto)
    .map((f) => ({
      concepto: f.concepto,
      anchoM: numeroTexto(f.anchoM, 3),
      altoM: numeroTexto(f.altoM, 3),
      cantidades: areas.map((_, i) => numeroTexto(f.cantidades[i] ?? 0, 0)),
      confianza: f.confianza,
    }));

  if (filas.length === 0) {
    throw new ErrorHttp(502, "La IA no encontró piezas en el archivo. Revisa que sea el levantamiento correcto.", "IA_SIN_FILAS");
  }
  return { areas, filas, notas: datos.notas, modelo };
}

// 9.2 Precio de referencia de reventa ---------------------------------------------------------

const ReventaIa = z.object({
  nombre: z.string().trim().min(1).max(200),
  precioReferencia: z.number().min(0).max(10_000_000),
  fuentes: z.array(z.object({ titulo: z.string().max(300), url: z.string().max(2000) })).max(10),
  notas: z.string().max(500).optional(),
});

const ESQUEMA_REVENTA = {
  type: "object",
  properties: {
    nombre: { type: "string", description: "Nombre claro del artículo encontrado." },
    precioReferencia: { type: "number", description: "Precio unitario en pesos mexicanos; 0 si no lo encontraste." },
    fuentes: {
      type: "array",
      items: { type: "object", properties: { titulo: { type: "string" }, url: { type: "string" } }, required: ["titulo", "url"] },
    },
    notas: { type: "string", description: "Aclaraciones: si el precio incluye IVA, presentación, rango de precios." },
  },
  required: ["nombre", "precioReferencia", "fuentes"],
};

const INSTRUCCIONES_REVENTA = `Buscas el precio de compra de un artículo que Diseñarte México revende (extintores, botiquines, detectores, lámparas de emergencia, etc.).
Usa la búsqueda de Google para encontrar precios actuales en tiendas o proveedores de México, en pesos mexicanos (MXN).
- precioReferencia: precio unitario típico de lo que encontraste (si hay varios, uno representativo, no el más caro ni el más barato).
- Si no encuentras un precio confiable, pon 0 y explícalo en notas. No inventes precios ni links.
- En notas di si el precio incluye IVA y cualquier diferencia con lo que se pidió (presentación, capacidad).
Responde solo con el JSON pedido.`;

export async function precioDeReventa(
  actor: UsuarioSesion | null,
  articulo: { nombre: string },
): Promise<{ nombre: string; precioReferencia: string; fuentes: Fuente[]; notas: string | null; modelo: string }> {
  requirePermiso(actor, "cotizaciones.propias");

  const { datos, fuentes: fuentesBusqueda, modelo } = await consultarGemini({
    actor,
    tarea: "reventa",
    instrucciones: INSTRUCCIONES_REVENTA,
    partes: [{ text: `Artículo: ${articulo.nombre}` }],
    esquemaJson: ESQUEMA_REVENTA,
    esquemaZod: ReventaIa,
    busqueda: true,
    resumenEntrada: { nombre: articulo.nombre },
  });

  // Primero las fuentes que devolvió la búsqueda de Google (son las verificables); luego
  // las que mencione el modelo y sean links http(s), sin repetir.
  const vistas = new Set<string>();
  const fuentes = [...fuentesBusqueda, ...datos.fuentes]
    .filter((f) => /^https?:\/\//i.test(f.url))
    .filter((f) => (vistas.has(f.url) ? false : (vistas.add(f.url), true)))
    .slice(0, 5)
    .map((f) => ({ titulo: f.titulo || new URL(f.url).hostname, url: f.url }));

  return {
    nombre: datos.nombre,
    precioReferencia: numeroTexto(datos.precioReferencia, 2),
    fuentes,
    notas: datos.notas?.trim() || null,
    modelo,
  };
}

// 9.3 Redactar alcance ------------------------------------------------------------------------

const AlcanceIa = z.object({
  concepto: z.string().trim().min(1).max(150),
  resumen: z.string().trim().min(1).max(500),
});

const ESQUEMA_ALCANCE = {
  type: "object",
  properties: {
    concepto: { type: "string", description: "Frase corta de lo que se cotiza, sin la palabra 'Concepto'." },
    resumen: { type: "string", description: "Máximo 40 palabras." },
  },
  required: ["concepto", "resumen"],
};

const INSTRUCCIONES_ALCANCE = `Redactas el "Resumen de alcance" de una propuesta económica de Diseñarte México.
- concepto: frase corta de lo que se cotiza (ej. "Señalética para protección civil").
- resumen: máximo 40 palabras, tono formal y claro, en español de México. Di qué se entrega y para qué áreas.
- Usa SOLO los datos que te dan. No inventes materiales, acabados, garantías, tiempos ni características que no estén en los datos.
- No repitas precios. No uses viñetas ni emojis.
Responde solo con el JSON pedido.`;

export type DatosAlcance = {
  titulo: string;
  areas: string[];
  piezas: string;
  recetas: { nombre: string; descripcion: string | null }[];
  tiempoEstimado: string | null;
  incluyeEnvio: boolean;
  incluyeInstalacion: boolean;
};

export async function redactarAlcance(
  actor: UsuarioSesion | null,
  datos: DatosAlcance,
): Promise<{ concepto: string; resumen: string; modelo: string }> {
  requirePermiso(actor, "cotizaciones.propias");

  const descripcion = [
    `Título del proyecto: ${datos.titulo}`,
    `Áreas: ${datos.areas.join(", ") || "sin especificar"}`,
    `Piezas: ${datos.piezas}`,
    `Material(es): ${datos.recetas.map((r) => (r.descripcion ? `${r.nombre} (${r.descripcion})` : r.nombre)).join("; ")}`,
    `Tiempo estimado: ${datos.tiempoEstimado || "sin especificar"}`,
    `Incluye envío: ${datos.incluyeEnvio ? "sí" : "no"}`,
    `Incluye instalación: ${datos.incluyeInstalacion ? "sí" : "no"}`,
  ].join("\n");

  const { datos: alcance, modelo } = await consultarGemini({
    actor,
    tarea: "alcance",
    instrucciones: INSTRUCCIONES_ALCANCE,
    partes: [{ text: descripcion }],
    esquemaJson: ESQUEMA_ALCANCE,
    esquemaZod: AlcanceIa,
    resumenEntrada: { datos },
  });

  return { concepto: alcance.concepto.replace(/^concepto:\s*/i, ""), resumen: alcance.resumen, modelo };
}
