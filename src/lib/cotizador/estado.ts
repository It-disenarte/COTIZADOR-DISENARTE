import type { Zona } from "@/lib/catalogo/constantes";
import type { EntradaNormalizada, FilaConId, OpcionCotizacion } from "@/lib/motor";

/** Id corto para conceptos y opciones. No necesita ser global: solo único dentro de la cotización. */
export const nuevoId = (): string => Math.random().toString(36).slice(2, 10);

export const opcionNueva = (numero: number): OpcionCotizacion => ({
  id: nuevoId(),
  nombre: `Opción ${numero}`,
  descripcion: "",
  imagenId: null,
  materiales: {},
  preciosManuales: {},
});

export const filaNueva = (): FilaConId => ({ id: nuevoId(), concepto: "", anchoM: "0", altoM: "0", cantidades: [""] });

/** Todo lo que el asistente tiene en pantalla. Los números viajan como texto. */
export type BorradorCotizacion = {
  id: string | null;
  folio: string | null;
  titulo: string;
  solicitante: string;
  vendedorId: string;
  cliente: {
    id: string | null;
    nombreContacto: string;
    puesto: string;
    empresa: string;
    correo: string;
    telefono: string;
    direccion: string;
    kmDesdeSjr: string;
    zona: Zona;
    notas: string;
  };
  entrada: EntradaNormalizada;
};

export const clienteVacio = (): BorradorCotizacion["cliente"] => ({
  id: null,
  nombreContacto: "",
  puesto: "",
  empresa: "",
  correo: "",
  telefono: "",
  direccion: "",
  kmDesdeSjr: "",
  zona: "local",
  notas: "",
});

export function borradorInicial(vendedorId: string): BorradorCotizacion {
  return {
    id: null,
    folio: null,
    titulo: "",
    solicitante: "",
    vendedorId,
    cliente: clienteVacio(),
    entrada: {
      levantamiento: {
        areas: [COLUMNA_CANTIDAD],
        filas: [filaNueva()],
      },
      // Casi siempre basta con una opción: se crea de una vez para que la tabla reciba insumos.
      opciones: [opcionNueva(1)],
      tiempoEstimado: "5-7 días",
      incluyeEnvio: true,
      sitio: { retiroGraficosPrevios: false, notasSuperficie: "" },
      operacion: {
        trabajoEnInstalacionesDisenarte: false,
        diasDiseno: "1",
        disenoMontoManual: "",
        produccion: { personas: "0", dias: "0" },
        instalacion: { incluye: true, personas: "2", dias: "1", escalaPorPieza: false },
        viaticos: { tipo: "local", personas: "2", dias: "1", montoDiaManual: "" },
        hospedaje: { incluye: false, noches: "0", costoNoche: "0" },
        traslado: { kmPorTrayecto: "0", modo: "diario", viajesRedondos: "", rendimientoKmL: "", casetasPorViaje: "0" },
        extras: [],
      },
      presentacion: { operacionProrrateada: true, modalidades: "solo_una", unidadesVolumen: "" },
      ajustes: { aplicaMargenError: true, aplicaConsumibles: true, margen: "", descuentoDecisionRapida: null },
      reventa: [],
    },
  };
}

/** Lo que se manda a la API (la validación de verdad ocurre en el servidor). */
export function cuerpoParaGuardar(borrador: BorradorCotizacion) {
  return {
    titulo: borrador.titulo,
    solicitante: borrador.solicitante,
    vendedorId: borrador.vendedorId,
    cliente: { ...borrador.cliente, id: borrador.cliente.id ?? undefined },
    entrada: borrador.entrada,
  };
}

/** Nombre de la única columna de cantidades. Lo que va en varias áreas se captura como conceptos distintos. */
export const COLUMNA_CANTIDAD = "Cantidad";

/**
 * Pega desde Excel: concepto, ancho, alto y cantidad. Si trae varias columnas de cantidad
 * (una por área), se suman: sin sus nombres no hay cómo separarlas en conceptos.
 */
export function filasDesdeTsv(texto: string): FilaConId[] {
  return texto
    .split(/\r?\n/)
    .map((linea) => linea.split("\t").map((c) => c.trim()))
    .filter((celdas) => celdas.some((c) => c !== ""))
    .map((celdas) => {
      const [concepto = "", ancho = "", alto = "", ...cantidades] = celdas;
      const normalizado = (v: string) => v.replace(",", ".").replace(/[^\d.]/g, "");
      const conValor = cantidades.map(normalizado).filter((c) => c !== "");
      const cantidad = conValor.length > 1 ? String(conValor.reduce((s, c) => s + num(c), 0)) : (conValor[0] ?? "");
      return { id: nuevoId(), concepto, anchoM: normalizado(ancho), altoM: normalizado(alto), cantidades: [cantidad] };
    });
}

type Levantamiento = EntradaNormalizada["levantamiento"];
/** Filas con cantidades por área (cotizaciones anteriores o lo que lee la IA); pueden no traer id. */
type FilaConAreas = Omit<FilaConId, "id"> & { id?: string };

/**
 * Convierte el reparto por áreas en conceptos: "Señalamiento 20×30" con CENDI 30 y Primaria 40
 * queda como "Señalamiento 20×30 · CENDI" (30) y "Señalamiento 20×30 · Primaria" (40). Con una
 * sola área no cambia el nombre. Devuelve también, para cada concepto nuevo, de qué fila salió.
 */
function conceptosPorArea(areas: string[], filas: FilaConAreas[]): { fila: FilaConId; origen: string | undefined }[] {
  const varias = areas.length > 1;
  return filas.flatMap((fila) => {
    const conCantidad = areas.map((area, j) => ({ area, cantidad: txt(fila.cantidades[j]) })).filter((c) => num(c.cantidad) > 0);
    const base = { anchoM: fila.anchoM, altoM: fila.altoM };
    if (!varias || conCantidad.length <= 1) {
      // Una sola área con piezas (o ninguna): se queda como está, con esa cantidad.
      const unica = conCantidad[0];
      const nombre = varias && unica && fila.concepto ? `${fila.concepto} · ${unica.area}` : fila.concepto;
      return [{ fila: { ...base, id: fila.id ?? nuevoId(), concepto: nombre, cantidades: [unica?.cantidad ?? txt(fila.cantidades[0])] }, origen: fila.id }];
    }
    return conCantidad.map((c, k) => ({
      // El primero conserva el id de la fila: así sigue ligado a sus insumos sin copiar nada.
      fila: { ...base, id: k === 0 && fila.id ? fila.id : nuevoId(), concepto: `${fila.concepto} · ${c.area}`, cantidades: [c.cantidad] },
      origen: fila.id,
    }));
  });
}

/**
 * Para abrir en el asistente una cotización que se capturó con varias áreas: cada área pasa a
 * ser un concepto, con los mismos insumos y precio manual en todas las opciones. El total no cambia.
 */
export function separarAreasEnConceptos(entrada: EntradaNormalizada): EntradaNormalizada {
  const { areas, filas } = entrada.levantamiento;
  if (areas.length <= 1) return { ...entrada, levantamiento: { areas: [COLUMNA_CANTIDAD], filas } };

  const nuevos = conceptosPorArea(areas, filas);
  const opciones = entrada.opciones.map((opcion) => {
    const materiales = { ...opcion.materiales };
    const preciosManuales = { ...(opcion.preciosManuales ?? {}) };
    for (const { fila, origen } of nuevos) {
      if (!origen || fila.id === origen) continue;
      if (opcion.materiales[origen]) materiales[fila.id] = opcion.materiales[origen].map((c) => ({ ...c }));
      if (opcion.preciosManuales?.[origen] != null) preciosManuales[fila.id] = opcion.preciosManuales[origen];
    }
    return { ...opcion, materiales, preciosManuales };
  });
  return { ...entrada, levantamiento: { areas: [COLUMNA_CANTIDAD], filas: nuevos.map((n) => n.fila) }, opciones };
}

/**
 * Agrega a la tabla lo que leyó la IA (o lo pone en su lugar). Si el documento reparte por
 * áreas, cada área entra como concepto propio. Las filas vacías se descartan.
 */
export function agregarLevantamientoLeido(
  actual: Levantamiento,
  leido: { areas: string[]; filas: FilaConAreas[] },
  modo: "reemplazar" | "agregar",
): Levantamiento {
  const conDatos = (f: FilaConAreas) => txt(f.concepto).trim() !== "" || f.cantidades.some((c) => num(c) > 0);
  const nuevas = conceptosPorArea(leido.areas, leido.filas.filter(conDatos)).map((n) => ({ ...n.fila, id: nuevoId() }));
  const previas = modo === "reemplazar" ? [] : actual.filas.filter(conDatos);
  return { areas: [COLUMNA_CANTIDAD], filas: [...previas, ...nuevas] };
}

// Los valores del formulario viajan como texto; estas dos ayudan a leerlos.
export const txt = (valor: unknown): string => (valor === null || valor === undefined ? "" : String(valor));
export const num = (valor: unknown): number => Number(txt(valor)) || 0;

export const numeroOCero = (valor: string) => (valor.trim() === "" ? "0" : valor.trim());
