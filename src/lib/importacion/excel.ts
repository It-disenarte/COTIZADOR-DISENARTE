import "server-only";
import readXlsxFile from "read-excel-file/node";

export type Celda = string | number | null;
export type Hoja = { nombre: string; filas: Celda[][] };

/** Tope para no mandarle a la IA hojas enormes (un archivo de costos real tiene ~100 filas). */
const FILAS_MAXIMAS_POR_HOJA = 400;
const COLUMNAS_MAXIMAS = 26;

/** Un .xlsx es un ZIP: empieza con "PK". */
export const esXlsx = (bytes: Uint8Array) => bytes[0] === 0x50 && bytes[1] === 0x4b;

export async function leerExcel(bytes: Uint8Array): Promise<Hoja[]> {
  const hojas = await readXlsxFile(Buffer.from(bytes), { trim: true });
  return hojas.map((h) => ({
    nombre: h.sheet.trim(),
    filas: h.data.slice(0, FILAS_MAXIMAS_POR_HOJA).map((fila) =>
      fila.slice(0, COLUMNAS_MAXIMAS).map((c): Celda => {
        if (c === null || c === undefined) return null;
        if (typeof c === "number") return c;
        if (typeof c === "boolean") return c ? "Sí" : "No";
        if (c instanceof Date) return c.toISOString().slice(0, 10);
        const texto = String(c).trim();
        return texto === "" ? null : texto;
      }),
    ),
  }));
}

export const letraColumna = (indice: number) => String.fromCharCode(65 + indice);

/** Redondeo para mostrar: evita 106.14999999999999 sin perder los centavos. */
const numeroLegible = (n: number) => String(Number(n.toFixed(4)));

/**
 * El Excel como texto para la IA: una línea por fila, con número de fila y letra de
 * columna, para que pueda decir de qué celda sacó cada número y se pueda comprobar.
 */
export function hojasComoTexto(hojas: Hoja[]): string {
  return hojas
    .map((hoja) => {
      const lineas = hoja.filas
        .map((fila, i) => {
          const celdas = fila
            .map((c, j) => (c === null ? null : `${letraColumna(j)}=${typeof c === "number" ? numeroLegible(c) : c}`))
            .filter(Boolean);
          return celdas.length ? `${i + 1}: ${celdas.join(" | ")}` : null;
        })
        .filter(Boolean);
      return `### Hoja "${hoja.nombre}"\n${lineas.join("\n")}`;
    })
    .join("\n\n");
}

/**
 * Comprueba que un número que dio la IA existe de verdad en esa fila del Excel.
 * Devuelve el valor exacto de la celda y el encabezado de su columna (el texto más
 * cercano hacia arriba en la misma columna), o null si no está.
 */
export function verificarEnFila(
  hojas: Hoja[],
  hojaNombre: string,
  fila: number,
  valor: number,
): { valor: number; columna: string; encabezado: string | null } | null {
  const hoja = hojas.find((h) => h.nombre.toLowerCase() === hojaNombre.trim().toLowerCase());
  const celdas = hoja?.filas[fila - 1];
  if (!hoja || !celdas) return null;

  const indice = celdas.findIndex((c) => typeof c === "number" && Math.abs(c - valor) <= 0.01);
  if (indice === -1) return null;

  let encabezado: string | null = null;
  for (let i = fila - 2; i >= 0; i--) {
    const arriba = hoja.filas[i]?.[indice];
    if (typeof arriba === "string") {
      encabezado = arriba;
      break;
    }
  }
  return { valor: celdas[indice] as number, columna: letraColumna(indice), encabezado };
}
