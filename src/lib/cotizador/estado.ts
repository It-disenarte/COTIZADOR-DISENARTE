import type { Zona } from "@/lib/catalogo/constantes";
import type { EntradaCotizacion } from "@/lib/motor";

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
    empresa: string;
    correo: string;
    telefono: string;
    direccion: string;
    kmDesdeSjr: string;
    zona: Zona;
    notas: string;
  };
  entrada: EntradaCotizacion;
};

export const clienteVacio = (): BorradorCotizacion["cliente"] => ({
  id: null,
  nombreContacto: "",
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
        areas: ["General"],
        filas: [{ concepto: "", anchoM: "0", altoM: "0", cantidades: [""] }],
      },
      opciones: [],
      tiempoEstimado: "5-7 días",
      incluyeEnvio: true,
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
      presentacion: { operacionProrrateada: true, modalidades: "solo_una" },
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

/** Pega desde Excel: concepto, ancho, alto y luego una cantidad por área. */
export function filasDesdeTsv(texto: string, areas: number): EntradaCotizacion["levantamiento"]["filas"] {
  return texto
    .split(/\r?\n/)
    .map((linea) => linea.split("\t").map((c) => c.trim()))
    .filter((celdas) => celdas.some((c) => c !== ""))
    .map((celdas) => {
      const [concepto = "", ancho = "", alto = "", ...cantidades] = celdas;
      const normalizado = (v: string) => v.replace(",", ".").replace(/[^\d.]/g, "");
      return {
        concepto,
        anchoM: normalizado(ancho),
        altoM: normalizado(alto),
        cantidades: Array.from({ length: areas }, (_, i) => normalizado(cantidades[i] ?? "")),
      };
    });
}

type Levantamiento = EntradaCotizacion["levantamiento"];

/**
 * Agrega a la tabla actual lo que leyó la IA. Las áreas se juntan por nombre (sin
 * importar mayúsculas); un área nueva agrega columna. Las filas vacías se descartan.
 */
export function fusionarLevantamiento(actual: Levantamiento, nuevo: Levantamiento): Levantamiento {
  const areas = [...actual.areas];
  const columnaDe = (nombre: string) => {
    const existente = areas.findIndex((a) => a.trim().toLowerCase() === nombre.trim().toLowerCase());
    if (existente !== -1) return existente;
    areas.push(nombre.trim());
    return areas.length - 1;
  };
  const destinos = nuevo.areas.map(columnaDe);

  const conCantidad = (f: Levantamiento["filas"][number]) =>
    txt(f.concepto).trim() !== "" || f.cantidades.some((c) => num(c) > 0);

  const filasActuales = actual.filas.filter(conCantidad).map((f) => ({
    ...f,
    cantidades: areas.map((_, i) => txt(f.cantidades[i])),
  }));
  const filasNuevas = nuevo.filas.map((f) => {
    const cantidades = areas.map(() => "");
    destinos.forEach((columna, j) => {
      cantidades[columna] = txt(f.cantidades[j]);
    });
    return { concepto: f.concepto, anchoM: f.anchoM, altoM: f.altoM, cantidades };
  });

  return { areas, filas: [...filasActuales, ...filasNuevas] };
}

// Los valores del formulario viajan como texto; estas dos ayudan a leerlos.
export const txt = (valor: unknown): string => (valor === null || valor === undefined ? "" : String(valor));
export const num = (valor: unknown): number => Number(txt(valor)) || 0;

export const numeroOCero = (valor: string) => (valor.trim() === "" ? "0" : valor.trim());
