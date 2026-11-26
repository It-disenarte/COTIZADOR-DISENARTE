import { d } from "./numeros";
import type {
  ComponenteConcepto,
  EntradaCotizacion,
  FilaLevantamiento,
  OpcionAnterior,
  OpcionCotizacion,
  RecetaSnapshot,
  Snapshot,
} from "./tipos";

export type FilaConId = FilaLevantamiento & { id: string };

/** La entrada tal como la usa el motor: filas con id y opciones con insumos por concepto. */
export type EntradaNormalizada = Omit<EntradaCotizacion, "levantamiento" | "opciones"> & {
  levantamiento: { areas: string[]; filas: FilaConId[] };
  opciones: OpcionCotizacion[];
};

export const esOpcionAnterior = (opcion: OpcionCotizacion | OpcionAnterior): opcion is OpcionAnterior =>
  "recetaId" in opcion && !("materiales" in opcion);

/** Ids de fila: los que ya trae cada una, o uno por posición para las cotizaciones anteriores. */
function conIds(filas: FilaLevantamiento[]): FilaConId[] {
  const usados = new Set<string>();
  return filas.map((fila, i) => {
    let id = fila.id && !usados.has(fila.id) ? fila.id : `c${i + 1}`;
    for (let n = 2; usados.has(id); n++) id = `c${i + 1}-${n}`;
    usados.add(id);
    return { ...fila, id };
  });
}

/**
 * Insumos de una plantilla (receta) listos para ponerse en un concepto. La merma de la receta
 * se pasa a la cantidad de los insumos por m², que es donde el motor la aplicaba.
 */
export function componentesDeReceta(receta: RecetaSnapshot): ComponenteConcepto[] {
  const merma = d(receta.pctMerma || 0);
  return receta.componentes.map((c) => ({
    insumoId: c.insumoId,
    modo: c.modo,
    cantidad: c.modo === "por_m2" && merma.gt(0) ? d(c.cantidad).times(merma.plus(1)).toString() : String(c.cantidad),
  }));
}

/**
 * Lleva cualquier entrada a la forma actual. Las cotizaciones anteriores tenían una receta por
 * opción aplicada a todo el levantamiento: aquí cada concepto recibe los insumos de esa receta,
 * así que el costo total no cambia. Es idempotente: una entrada ya actual sale igual.
 */
export function normalizarEntrada(entrada: EntradaCotizacion, snapshot: Pick<Snapshot, "recetas">): EntradaNormalizada {
  const filas = conIds(entrada.levantamiento?.filas ?? []);
  const opciones = (entrada.opciones ?? []).map((opcion, i): OpcionCotizacion => {
    if (!esOpcionAnterior(opcion)) {
      return { ...opcion, materiales: opcion.materiales ?? {}, preciosManuales: opcion.preciosManuales ?? {} };
    }
    const receta = snapshot.recetas[opcion.recetaId];
    const componentes = receta ? componentesDeReceta(receta) : [];
    // El unitario manual anterior era de toda la opción: solo se conserva si hay un solo concepto.
    const manual = opcion.precioUnitarioManual;
    const preciosManuales = filas.length === 1 && manual != null && manual !== "" ? { [filas[0].id]: manual } : {};
    return {
      // El id de la receta sigue identificando la opción (así se ligaban sus fotos).
      id: opcion.recetaId,
      nombre: receta?.nombre ?? `Opción ${i + 1}`,
      descripcion: receta?.descripcionPdf ?? null,
      imagenId: opcion.imagenId ?? null,
      materiales: Object.fromEntries(filas.map((f) => [f.id, componentes.map((c) => ({ ...c }))])),
      preciosManuales,
    };
  });
  return repartirFilasPorOpcion({ ...entrada, levantamiento: { ...entrada.levantamiento, filas }, opciones });
}

/**
 * Cada opción es dueña de sus conceptos. Antes la tabla era una sola para todas: esos conceptos sin dueño se
 * copian a cada opción (con sus insumos, precio y descripción), así que nada cambia de precio y desde ahí cada
 * opción se edita por separado. Idempotente: con dueño ya asignado, sale igual.
 */
export function repartirFilasPorOpcion(entrada: EntradaNormalizada): EntradaNormalizada {
  const { opciones } = entrada;
  if (opciones.length === 0) return entrada;
  const { filas } = entrada.levantamiento;
  const idsOpcion = new Set(opciones.map((o) => o.id));
  // Un concepto de una opción que ya no existe se descarta: se fue con ella.
  const vigentes = filas.filter((f) => !f.opcionId || idsOpcion.has(f.opcionId));
  if (vigentes.length === filas.length && filas.every((f) => f.opcionId)) return entrada;

  const usados = new Set(vigentes.map((f) => f.id));
  const nuevas = opciones.map((o) => ({
    ...o,
    materiales: { ...o.materiales },
    preciosManuales: { ...(o.preciosManuales ?? {}) },
    descripciones: { ...(o.descripciones ?? {}) },
  }));
  const repartidas = vigentes.flatMap((fila): FilaConId[] => {
    if (fila.opcionId) return [fila];
    return nuevas.map((opcion, i) => {
      if (i === 0) return { ...fila, opcionId: opcion.id };
      // Id derivado (no al azar): convertir dos veces la misma cotización da lo mismo.
      let id = `${fila.id.slice(0, 34)}-o${i + 1}`;
      for (let n = 2; usados.has(id); n++) id = `${fila.id.slice(0, 30)}-o${i + 1}-${n}`;
      usados.add(id);
      for (const mapa of [opcion.materiales, opcion.preciosManuales, opcion.descripciones] as Record<string, unknown>[]) {
        if (mapa[fila.id] !== undefined) mapa[id] = mapa[fila.id];
        delete mapa[fila.id];
      }
      return { ...fila, id, opcionId: opcion.id };
    });
  });
  return { ...entrada, levantamiento: { ...entrada.levantamiento, filas: repartidas }, opciones: nuevas };
}
