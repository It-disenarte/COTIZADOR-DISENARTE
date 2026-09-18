import { eq, inArray, sql } from "drizzle-orm";
import { type UnidadCosto } from "@/lib/catalogo/constantes";
import { db } from "@/lib/db";
import { insumos } from "@/lib/db/schema";
import { ErrorHttp } from "@/lib/errores";
import { interpretarListaCostos } from "@/lib/ia/catalogo";
import { buscarCoincidencia, claveImportacion } from "@/lib/importacion/coincidencias";
import { esXlsx, type Hoja, hojasComoTexto, leerExcel, verificarEnFila } from "@/lib/importacion/excel";
import { requirePermiso, type UsuarioSesion } from "@/lib/permisos";
import type { AplicarImportacion } from "@/lib/validacion/importacion";

/** Vercel no acepta peticiones de más de 4.5 MB. */
export const TAMANO_MAXIMO_IMPORTACION = 4 * 1024 * 1024;
const TIPOS_DOCUMENTO = ["application/pdf", "image/jpeg", "image/png", "image/webp"];

/** Un cambio de precio mayor a esto se resalta; mayor al doble de esto, no se preselecciona. */
const CAMBIO_GRANDE = 0.3;

export type Accion = "actualizar" | "crear" | "ignorar";

export type RenglonPropuesto = {
  id: number;
  origen: { hoja: string; fila: number; seccion: string; columna: string | null; encabezado: string | null };
  nombre: string;
  /** Costo exacto (en Excel, el valor real de la celda). */
  costo: string;
  unidad: UnidadCosto | null;
  anchoUtilM: string | null;
  confianza: number;
  nota: string | null;
  /** true: el número se encontró en la celda del Excel. En PDF no se puede comprobar. */
  verificado: boolean;
  clave: string;
  coincidencia: {
    insumoId: string;
    nombre: string;
    categoria: string;
    metodo: "memoria" | "ia" | "similitud";
    similitud: number;
    costoActual: string | null;
    unidadActual: UnidadCosto | null;
    cambio: number | null;
  } | null;
  avisos: string[];
  accionSugerida: Accion;
};

export type PropuestaImportacion = {
  archivo: string;
  tipo: "excel" | "documento";
  renglones: RenglonPropuesto[];
  notas: string[];
  /** Renglones que la IA propuso pero cuyo número no apareció en el Excel: se descartan. */
  descartados: number;
  modelo: string;
};

const redondear4 = (n: number) => String(Number(n.toFixed(4)));

/**
 * Lee un archivo de costos y propone cambios al catálogo. No guarda nada: la persona
 * revisa y aplica solo lo que confirme (ver aplicarImportacion).
 */
export async function analizarArchivoCostos(
  actor: UsuarioSesion | null,
  archivo: { nombre: string; tipo: string; bytes: Uint8Array },
): Promise<PropuestaImportacion> {
  requirePermiso(actor, "catalogo.editar");
  if (archivo.bytes.byteLength === 0) throw new ErrorHttp(400, "El archivo está vacío.", "ARCHIVO_VACIO");
  if (archivo.bytes.byteLength > TAMANO_MAXIMO_IMPORTACION) {
    throw new ErrorHttp(413, "El archivo pesa más de 4 MB.", "ARCHIVO_PESADO");
  }

  const excel = esXlsx(archivo.bytes);
  if (!excel && !TIPOS_DOCUMENTO.includes(archivo.tipo)) {
    throw new ErrorHttp(415, "Sube un Excel (.xlsx), un PDF o una imagen.", "TIPO_ARCHIVO");
  }

  let hojas: Hoja[] = [];
  if (excel) {
    try {
      hojas = await leerExcel(archivo.bytes);
    } catch {
      throw new ErrorHttp(400, "No se pudo leer el Excel. Guárdalo como .xlsx (no .xls ni .csv) e intenta de nuevo.", "EXCEL_INVALIDO");
    }
    if (hojas.every((h) => h.filas.length === 0)) throw new ErrorHttp(400, "El Excel no tiene datos.", "EXCEL_VACIO");
  }

  const catalogo = await db
    .select({
      id: insumos.id,
      nombre: insumos.nombre,
      categoria: insumos.categoria,
      unidadCosto: insumos.unidadCosto,
      costo: insumos.costo,
      clavesImportacion: insumos.clavesImportacion,
    })
    .from(insumos)
    .where(eq(insumos.archivado, false));

  const { datos, modelo } = await interpretarListaCostos(
    actor,
    excel ? { tipo: "tabla", texto: hojasComoTexto(hojas) } : { tipo: "archivo", mime: archivo.tipo, bytes: archivo.bytes },
    catalogo.map((i) => ({ nombre: i.nombre, categoria: i.categoria, unidad: i.unidadCosto })),
    { archivo: archivo.nombre, tipo: excel ? "xlsx" : archivo.tipo, bytes: archivo.bytes.byteLength },
  );

  let descartados = 0;
  const renglones: RenglonPropuesto[] = [];

  for (const r of datos.filas) {
    if (r.costo <= 0) continue;

    // En Excel el número tiene que existir en esa fila; si no, se descarta (la IA no inventa precios).
    let costo = redondear4(r.costo);
    let columna: string | null = null;
    let encabezado: string | null = r.columnaCosto || null;
    if (excel) {
      const celda = verificarEnFila(hojas, r.hoja, r.fila, r.costo);
      if (!celda) {
        descartados++;
        continue;
      }
      costo = redondear4(celda.valor);
      columna = celda.columna;
      encabezado = celda.encabezado ?? encabezado;
    }

    const unidad = r.unidad === "desconocida" ? null : r.unidad;
    const clave = claveImportacion(r.seccion, r.nombre);
    const encontrada = buscarCoincidencia(
      { seccion: r.seccion || null, nombre: r.nombre, sugerenciaIa: r.coincideCon || null },
      catalogo,
    );
    const insumo = encontrada ? catalogo.find((i) => i.id === encontrada.insumoId) : undefined;

    const avisos: string[] = [];
    if (!excel) avisos.push("Leído de un documento: compara el precio contra el archivo.");
    if (r.confianza < 0.7) avisos.push("La IA no está segura de este renglón.");
    if (!unidad) avisos.push("No se sabe la unidad: elígela.");

    let coincidencia: RenglonPropuesto["coincidencia"] = null;
    let accion: Accion;
    if (insumo && encontrada) {
      const actual = insumo.costo === null ? null : Number(insumo.costo);
      const cambio = actual && actual > 0 ? (Number(costo) - actual) / actual : null;
      coincidencia = {
        insumoId: insumo.id,
        nombre: insumo.nombre,
        categoria: insumo.categoria,
        metodo: encontrada.metodo,
        similitud: encontrada.similitud,
        costoActual: insumo.costo,
        unidadActual: insumo.unidadCosto,
        cambio,
      };
      const unidadDistinta = unidad !== null && insumo.unidadCosto !== null && unidad !== insumo.unidadCosto;
      if (unidadDistinta) avisos.push(`La unidad del archivo (${unidad}) no es la del catálogo (${insumo.unidadCosto}).`);
      if (cambio !== null && Math.abs(cambio) > CAMBIO_GRANDE) avisos.push("Cambio de precio grande: revisa la unidad.");
      if (encontrada.metodo === "similitud") avisos.push("Relacionado por nombre parecido: confirma que es el mismo insumo.");

      const riesgoso =
        unidadDistinta ||
        (cambio !== null && Math.abs(cambio) > CAMBIO_GRANDE * 2) ||
        (!unidad && !insumo.unidadCosto) ||
        r.confianza < 0.7;
      const igual = insumo.costo !== null && Number(insumo.costo) === Number(costo) && (!unidad || unidad === insumo.unidadCosto);
      accion = igual || riesgoso ? "ignorar" : "actualizar";
      if (igual) avisos.unshift("Sin cambios: el costo ya es el mismo.");
    } else {
      // Nuevo: solo se propone crear si es claro; si no, se deja para que la persona decida.
      accion = unidad && r.confianza >= 0.8 ? "crear" : "ignorar";
    }

    renglones.push({
      id: renglones.length,
      origen: { hoja: r.hoja, fila: r.fila, seccion: r.seccion, columna, encabezado },
      nombre: r.nombre,
      costo,
      unidad,
      anchoUtilM: r.anchoUtilM > 0 ? redondear4(r.anchoUtilM) : null,
      confianza: r.confianza,
      nota: r.nota || null,
      verificado: excel,
      clave,
      coincidencia,
      avisos,
      accionSugerida: accion,
    });
  }

  if (renglones.length === 0) {
    throw new ErrorHttp(502, "No se encontraron costos que se puedan importar en el archivo.", "IMPORTACION_VACIA");
  }

  const notas = [...datos.notas];
  if (descartados > 0) {
    notas.push(`${descartados} renglón(es) se descartaron porque su precio no aparece en la fila indicada del Excel.`);
  }
  return { archivo: archivo.nombre, tipo: excel ? "excel" : "documento", renglones, notas, descartados, modelo };
}

/** Aplica al catálogo solo los cambios confirmados, todo o nada. */
export async function aplicarImportacion(
  actor: UsuarioSesion | null,
  datos: AplicarImportacion,
): Promise<{ actualizados: number; creados: number }> {
  requirePermiso(actor, "catalogo.editar");
  const fecha = new Date().toLocaleDateString("es-MX", { timeZone: "America/Mexico_City" });
  const fuente = `Importación: ${datos.archivo} (${fecha})`;

  return db.transaction(async (tx) => {
    const ids = datos.cambios.flatMap((c) => (c.accion === "actualizar" ? [c.insumoId] : []));
    const existentes = ids.length
      ? await tx.select({ id: insumos.id }).from(insumos).where(inArray(insumos.id, ids))
      : [];
    const faltante = ids.find((id) => !existentes.some((e) => e.id === id));
    if (faltante) throw new ErrorHttp(404, "Uno de los insumos ya no existe. Vuelve a analizar el archivo.", "NO_ENCONTRADO");

    let actualizados = 0;
    let creados = 0;
    for (const cambio of datos.cambios) {
      if (cambio.accion === "actualizar") {
        await tx
          .update(insumos)
          .set({
            costo: cambio.costo,
            unidadCosto: cambio.unidadCosto,
            ...(cambio.anchoUtilM ? { anchoUtilM: cambio.anchoUtilM } : {}),
            fuente,
            requiereRevision: false,
            // Se recuerda cómo aparece en el archivo para reconocerlo directo la próxima vez.
            clavesImportacion: sql`(select array(select distinct unnest(${insumos.clavesImportacion} || array[${cambio.clave}]::text[])))`,
          })
          .where(eq(insumos.id, cambio.insumoId));
        actualizados++;
      } else {
        await tx.insert(insumos).values({
          nombre: cambio.nombre,
          categoria: cambio.categoria,
          costo: cambio.costo,
          unidadCosto: cambio.unidadCosto,
          anchoUtilM: cambio.anchoUtilM ?? null,
          fuente,
          requiereRevision: false,
          clavesImportacion: [cambio.clave],
        });
        creados++;
      }
    }
    return { actualizados, creados };
  });
}
