/**
 * Relacionar un renglón de un archivo de costos con un insumo del catálogo.
 * Funciones puras (sin base de datos) para poder probarlas solas.
 */

/** Minúsculas, sin acentos ni signos, espacios simples: "Acrílico 6 mm." → "acrilico 6 mm" */
export function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, " ")
    .replace(/(^|\s)\.|\.(\s|$)/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Clave con la que se recuerda cómo aparece un insumo en el archivo: "sección|nombre". */
export function claveImportacion(seccion: string | null | undefined, nombre: string): string {
  const s = normalizar(seccion ?? "");
  return s ? `${s}|${normalizar(nombre)}` : normalizar(nombre);
}

const palabras = (texto: string) => new Set(normalizar(texto).split(" ").filter(Boolean));

function pares(texto: string): string[] {
  const t = normalizar(texto).replace(/ /g, "");
  return Array.from({ length: Math.max(t.length - 1, 0) }, (_, i) => t.slice(i, i + 2));
}

/**
 * Parecido entre dos nombres, de 0 a 1. Toma el mejor de dos medidas: palabras en común
 * ("Acrílico 6 mm Sencillo" ~ "Acrílico 6 mm corte láser sencillo") y pares de letras,
 * que tolera abreviaturas y errores de dedo ("Estireno cal 40 bco" ~ "Estireno cal. 40 blanco").
 */
export function similitud(a: string, b: string): number {
  const pa = palabras(a);
  const pb = palabras(b);
  const comunes = [...pa].filter((p) => pb.has(p)).length;
  const porPalabras = pa.size + pb.size ? (2 * comunes) / (pa.size + pb.size) : 0;

  const ba = pares(a);
  const bb = pares(b);
  const restantes = [...bb];
  let coincidencias = 0;
  for (const par of ba) {
    const i = restantes.indexOf(par);
    if (i !== -1) {
      coincidencias++;
      restantes.splice(i, 1);
    }
  }
  const porLetras = ba.length + bb.length ? (2 * coincidencias) / (ba.length + bb.length) : 0;

  return Math.max(porPalabras, porLetras);
}

export const SIMILITUD_MINIMA = 0.6;

/** Palabras que no distinguen un material de otro. */
const PALABRAS_VACIAS = new Set([
  "de", "del", "la", "las", "el", "los", "con", "para", "por", "y", "en", "a", "al",
  "precio", "costo", "material", "mts", "mt",
]);

/** Palabras que sí distinguen: números (medidas, calibres) y palabras de 3 letras o más. */
function palabrasDistintivas(texto: string): string[] {
  return normalizar(texto)
    .split(" ")
    .filter((p) => p && !PALABRAS_VACIAS.has(p) && (/\d/.test(p) || p.length >= 3));
}

/** "bco" es abreviatura de "blanco": mismas letras en orden, misma inicial. */
function esAbreviatura(corta: string, larga: string): boolean {
  if (corta[0] !== larga[0]) return false;
  let j = 0;
  for (const letra of larga) if (letra === corta[j]) j++;
  return j === corta.length;
}

/**
 * Toda palabra distintiva del archivo tiene que estar en el nombre del catálogo (igual, como
 * inicio o como abreviatura; los números, exactos). Así "Vinil holográfico" no cae en
 * "Vinil de corte" ni "Acrílico 3 mm" en "Acrílico 6 mm", aunque se parezcan.
 */
export function palabrasCubiertas(delArchivo: string, delCatalogo: string): boolean {
  const catalogo = normalizar(delCatalogo).split(" ");
  return palabrasDistintivas(delArchivo).every((p) =>
    catalogo.some((c) => c === p || (!/\d/.test(p) && (c.startsWith(p) || esAbreviatura(p, c)))),
  );
}

export type InsumoParaCoincidir = { id: string; nombre: string; clavesImportacion: string[] };
export type Coincidencia = { insumoId: string; metodo: "memoria" | "ia" | "similitud"; similitud: number } | null;

/**
 * Orden de confianza: 1) una importación anterior ya confirmó esta clave; 2) la IA dijo con
 * qué insumo del catálogo corresponde (y el nombre existe); 3) el nombre más parecido.
 */
export function buscarCoincidencia(
  renglon: { seccion: string | null; nombre: string; sugerenciaIa: string | null },
  catalogo: InsumoParaCoincidir[],
): Coincidencia {
  const clave = claveImportacion(renglon.seccion, renglon.nombre);
  const recordado = catalogo.find((i) => i.clavesImportacion.includes(clave));
  if (recordado) return { insumoId: recordado.id, metodo: "memoria", similitud: 1 };

  if (renglon.sugerenciaIa) {
    const sugerido = catalogo.find((i) => normalizar(i.nombre) === normalizar(renglon.sugerenciaIa ?? ""));
    if (sugerido) return { insumoId: sugerido.id, metodo: "ia", similitud: similitud(renglon.nombre, sugerido.nombre) };
  }

  // Se compara con y sin la sección: en el catálogo "Lona Umag" de la sección JV33 se llama
  // "Impresión JV33 lona Umag".
  let mejor: Coincidencia = null;
  for (const insumo of catalogo) {
    if (!palabrasCubiertas(renglon.nombre, insumo.nombre)) continue;
    const puntaje = Math.max(
      similitud(renglon.nombre, insumo.nombre),
      renglon.seccion ? similitud(`${renglon.seccion} ${renglon.nombre}`, insumo.nombre) : 0,
    );
    if (puntaje >= SIMILITUD_MINIMA && (!mejor || puntaje > mejor.similitud)) {
      mejor = { insumoId: insumo.id, metodo: "similitud", similitud: puntaje };
    }
  }
  return mejor;
}
