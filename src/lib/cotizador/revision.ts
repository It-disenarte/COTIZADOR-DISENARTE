// Revisión de lo capturado, casilla por casilla. Módulo puro: lo usa el asistente para decir qué falta, llevar a
// la persona a esa casilla y marcarla. Los `campo` son ids de elementos de la pantalla (ver los inputs de los pasos).

import type { EntradaNormalizada } from "@/lib/motor";
import { PASO, type Pendiente } from "./pasos";

const numero = (v: unknown): number => {
  const n = Number(String(v ?? "").trim() === "" ? 0 : v);
  return Number.isFinite(n) ? n : 0;
};

/** Id de las casillas de cada concepto del levantamiento (los inputs del paso 2 llevan estos ids). */
export const idFila = (filaId: string, campo: "concepto" | "ancho" | "alto" | "cantidad" | "insumos") => `fila-${filaId}-${campo}`;

/**
 * Lo primero que falta en lo que se capturó, con la casilla exacta. Va antes que la validación general porque
 * ve cosas que esta deja pasar sin avisar: un concepto con nombre pero sin cantidad se ignoraba al calcular, y
 * un insumo por m² con ancho o alto en 0 costaba cero. Las filas totalmente en blanco no cuentan.
 */
export function revisarCaptura(borrador: {
  titulo: string;
  cliente: { nombreContacto: string };
  entrada: EntradaNormalizada;
}): Pendiente | null {
  if (!borrador.titulo.trim()) {
    return { paso: PASO.datos, campo: "titulo", mensaje: "Escribe el título del proyecto." };
  }
  if (!borrador.cliente.nombreContacto.trim()) {
    return { paso: PASO.datos, campo: "contacto", mensaje: "Escribe el nombre del contacto del cliente." };
  }

  const { filas } = borrador.entrada.levantamiento;
  const opciones = borrador.entrada.opciones;
  for (const fila of filas) {
    // Cada concepto se revisa contra los insumos de su opción, y se numera como se ve en esa tabla.
    const suyas = opciones.filter((o) => !fila.opcionId || o.id === fila.opcionId);
    const i = filas.filter((f) => f.opcionId === fila.opcionId).indexOf(fila);
    const enOpcion = opciones.length > 1 && suyas[0] ? ` (${suyas[0].nombre})` : "";
    const insumosDeLaFila = suyas.map((o) => o.materiales[fila.id] ?? []);
    const nombre = fila.concepto.trim();
    const cantidad = fila.cantidades.reduce<number>((suma, c) => suma + numero(c), 0);
    const enBlanco =
      !nombre && cantidad <= 0 && numero(fila.anchoM) <= 0 && numero(fila.altoM) <= 0 && insumosDeLaFila.every((l) => l.length === 0);
    if (enBlanco) continue;

    const de = (nombre ? `“${nombre}”` : `la fila ${i + 1}`) + enOpcion;
    const problema = (campo: Parameters<typeof idFila>[1], mensaje: string): Pendiente => ({
      paso: PASO.levantamiento,
      campo: idFila(fila.id, campo),
      mensaje,
    });

    if (!nombre) return problema("concepto", `Falta el nombre del concepto de la fila ${i + 1}${enOpcion}.`);
    if (cantidad <= 0) return problema("cantidad", `Falta la cantidad de ${de}: escribe cuántas piezas lleva.`);
    if (insumosDeLaFila.some((lista) => lista.length === 0)) {
      return problema("insumos", `${de} no tiene insumos: arrastra o agrega al menos uno del catálogo.`);
    }
    const porMedidas = insumosDeLaFila.some((lista) => lista.some((c) => c.modo === "por_m2"));
    if (porMedidas && numero(fila.anchoM) <= 0) {
      return problema("ancho", `Falta el ancho de ${de}: lleva un insumo que se calcula por m² y sin medidas costaría cero.`);
    }
    if (porMedidas && numero(fila.altoM) <= 0) {
      return problema("alto", `Falta el alto de ${de}: lleva un insumo que se calcula por m² y sin medidas costaría cero.`);
    }
  }
  return null;
}
