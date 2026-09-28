import type { FamiliaReceta, ModoComponente, UnidadCosto } from "@/lib/catalogo/constantes";
import type { Numerico } from "./numeros";

// ---------------------------------------------------------------------------
// Snapshot de precios: lo que el motor usa para calcular. Se guarda con cada
// versión de la cotización, así un cambio de catálogo no mueve lo ya cotizado.
// ---------------------------------------------------------------------------

export type InsumoSnapshot = {
  id: string;
  nombre: string;
  unidadCosto: UnidadCosto | null;
  costo: string | null;
  anchoUtilM: string | null;
  areaLaminaM2: string | null;
  /** Rollo completo: largo en metros. Las cotizaciones anteriores no lo traen. */
  largoRolloM?: string | null;
  requiereRevision: boolean;
  /** Para agrupar el catálogo en el asistente. Las cotizaciones viejas no lo traen. */
  categoria?: string;
  /** Cómo se le nombra al cliente en el PDF. null o ausente = se usa el nombre. */
  nombreCliente?: string | null;
  /** Archivado: ya no se ofrece en el asistente, pero las cotizaciones que lo usan siguen calculando. */
  archivado?: boolean;
};

export type ComponenteSnapshot = { insumoId: string; modo: ModoComponente; cantidad: string };

export type RecetaSnapshot = {
  id: string;
  nombre: string;
  familia: FamiliaReceta;
  descripcionPdf: string | null;
  pctMerma: string;
  componentes: ComponenteSnapshot[];
  archivado?: boolean;
};

export type ParametrosMotor = {
  margen: Numerico;
  pctMargenError: Numerico;
  pctConsumibles: Numerico;
  tarifaInstaladorDia: Numerico;
  tarifaDisenoDia: Numerico;
  viaticosLocalDia: Numerico;
  viaticosForaneoDia: Numerico;
  rendimientoKmL: Numerico;
  /** null = por capturar: si hace falta para el traslado, el motor avisa. */
  precioGasolinaLitro: Numerico | null;
  precioGasolinaActualizadoEn?: Date | string | null;
  pctReventa: Numerico;
  iva: Numerico;
  alertaMargenMinimo: Numerico;
  alertaDesvioPrecio: Numerico;
  escenariosMargen: Numerico[];
};

export type Snapshot = {
  insumos: Record<string, InsumoSnapshot>;
  recetas: Record<string, RecetaSnapshot>;
  parametros: ParametrosMotor;
  /** Vehículos de la casa con su rendimiento. Solo para el asistente; el motor no los usa. */
  vehiculos?: { clave: string; etiqueta: string; rendimientoKmL: string }[];
};

// ---------------------------------------------------------------------------
// Entrada: lo que se captura en el asistente
// ---------------------------------------------------------------------------

export type FilaLevantamiento = {
  /** Identifica el concepto para ligarle sus insumos. Las cotizaciones viejas no lo traen. */
  id?: string;
  concepto: string;
  anchoM: Numerico;
  altoM: Numerico;
  /** Una cantidad por área, en el mismo orden que `areas`. */
  cantidades: Numerico[];
};

export type Levantamiento = { areas: string[]; filas: FilaLevantamiento[] };

export type Extra = { concepto: string; monto: Numerico; escala: "una_vez" | "por_pieza" };

export type Operacion = {
  /** Trabajo en casa: sin viáticos, gasolina, casetas ni hospedaje. */
  trabajoEnInstalacionesDisenarte: boolean;
  diasDiseno: Numerico;
  /** Reemplaza días × tarifa (caso del Versa: $1,300). */
  disenoMontoManual?: Numerico | null;
  produccion: { personas: Numerico; dias: Numerico };
  instalacion: {
    incluye: boolean;
    personas: Numerico;
    dias: Numerico;
    /** Rotulación: la instalación se repite en cada unidad. */
    escalaPorPieza?: boolean;
  };
  viaticos: { tipo: "local" | "foraneo"; personas: Numerico; dias: Numerico; montoDiaManual?: Numerico | null };
  hospedaje: { incluye: boolean; noches: Numerico; costoNoche: Numerico };
  traslado: {
    kmPorTrayecto: Numerico;
    /** diario = un viaje redondo por día; una_vez = ida y vuelta al inicio y al final. */
    modo: "diario" | "una_vez";
    viajesRedondos?: Numerico | null;
    rendimientoKmL?: Numerico | null;
    casetasPorViaje: Numerico;
  };
  extras: Extra[];
};

/** Un insumo dentro de un concepto: cuánto se usa y cómo (por m², ml por pieza, por pieza o una vez). */
export type ComponenteConcepto = { insumoId: string; modo: ModoComponente; cantidad: Numerico };

/**
 * Una opción de precio: una página del PDF. Cada concepto del levantamiento lleva sus propios
 * insumos dentro de la opción; si el cliente quiere comparar materiales, se agrega otra opción.
 */
export type OpcionCotizacion = {
  id: string;
  nombre: string;
  /** Sale en el PDF, debajo del alcance. */
  descripcion?: string | null;
  /** No entra en el cálculo: es la foto que acompaña a la opción en el PDF. */
  imagenId?: string | null;
  /** Insumos de cada concepto, por id de fila del levantamiento. */
  materiales: Record<string, ComponenteConcepto[]>;
  /** Precio unitario capturado a mano, por id de fila. Vacío = el calculado. */
  preciosManuales?: Record<string, Numerico | null>;
  /**
   * Descripción de cada concepto para el PDF (una viñeta por renglón), por id de fila. Vacía = los
   * nombres para el cliente de sus insumos.
   */
  descripciones?: Record<string, string | null>;
};

/** Forma anterior: una receta para todo el levantamiento. Se convierte sola al calcular. */
export type OpcionAnterior = { recetaId: string; precioUnitarioManual?: Numerico | null; imagenId?: string | null };

export type EntradaCotizacion = {
  levantamiento: Levantamiento;
  opciones: (OpcionCotizacion | OpcionAnterior)[];
  /** Texto libre que sale en el PDF ("5-7 días"). No entra en el cálculo. */
  tiempoEstimado?: string | null;
  /** "Resumen de alcance" del PDF (concepto y un párrafo corto). No entra en el cálculo. */
  alcance?: { concepto?: string | null; resumen?: string | null } | null;
  /** Lo que exige el PNO-COM-01 en la propuesta (7.3). No entra en el cálculo. */
  propuesta?: {
    noIncluye?: string | null;
    supuestos?: string | null;
    vigenciaDias?: Numerico | null;
    peticionAccion?: "visita" | "piloto" | "orden_compra" | "";
  };
  incluyeEnvio: boolean;
  /** Condiciones del sitio (PNO 7.1.7). No entra en el cálculo, pero sí en el PDF y las alertas. */
  sitio?: { retiroGraficosPrevios?: boolean; notasSuperficie?: string | null };
  operacion: Operacion;
  presentacion: {
    /** Unidades del proyecto completo para el escenario por volumen (amortiza el diseño). */
    unidadesVolumen?: Numerico | null;
    /** true: la operación va dentro del unitario; false: va como fila aparte. */
    operacionProrrateada: boolean;
    modalidades: "solo_una" | "A_y_B" | "piloto_y_volumen";
  };
  ajustes: {
    aplicaMargenError: boolean;
    aplicaConsumibles: boolean;
    margen?: Numerico | null;
    descuentoDecisionRapida?: { monto: Numerico; nota: string } | null;
  };
  reventa: { nombre: string; precioReferencia: Numerico; cantidad: Numerico; link?: string | null; verificado: boolean }[];
};

// ---------------------------------------------------------------------------
// Resultado
// ---------------------------------------------------------------------------

export type Alerta = { codigo: string; mensaje: string };

export type Desglose = {
  materiales: string;
  consumibles: string;
  produccion: string;
  instalacionPorPieza: string;
  extrasPorPieza: string;
  variable: string;
  diseno: string;
  instalacion: string;
  viaticos: string;
  gasolina: string;
  casetas: string;
  hospedaje: string;
  extrasUnaVez: string;
  fijo: string;
  costoTotal: string;
};

export type FilaPdf = {
  concepto: string;
  cantidad: string;
  unitario: string;
  subtotal: string;
  /** Viñetas de "Descripción:" en el PDF. Las cotizaciones anteriores y la fila de operación no la traen. */
  descripcion?: string[];
};

export type Variante = {
  clave: "unica" | "A" | "B";
  etiqueta: string;
  desglose: Desglose;
  /** Unitario promedio (subtotal de los conceptos ÷ piezas). El PDF usa el de cada concepto. */
  unitarioCalculado: string;
  unitario: string;
  filas: FilaPdf[];
  /** Precio de cada concepto. Las cotizaciones anteriores no lo traen. */
  conceptos?: ConceptoResultado[];
  subtotal: string;
  descuento: string;
  iva: string;
  total: string;
  margenReal: string;
  escenarios: { margen: string; unitario: string; subtotal: string }[];
  alertas: Alerta[];
};

/** Precio de un concepto dentro de una variante (lo que sale como fila en el PDF). */
export type ConceptoResultado = {
  filaId: string;
  concepto: string;
  piezas: string;
  /** Costo directo de sus insumos (con consumibles). */
  costo: string;
  /** Unitario sin redondear, para comparar contra un precio manual. */
  unitarioCalculado: string;
  unitario: string;
  subtotal: string;
  /** Viñetas de la descripción del concepto para el PDF. */
  descripcion: string[];
};

export type OpcionResultado = {
  /** Id de la opción. */
  id?: string;
  /** Igual que id; se conserva el nombre porque así lo guardaron las cotizaciones anteriores. */
  recetaId: string;
  nombre: string;
  descripcionPdf: string | null;
  variantes: Variante[];
};

export type ReventaResultado = {
  items: { nombre: string; cantidad: string; precioReferencia: string; unitario: string; subtotal: string; link: string | null; verificado: boolean }[];
  subtotal: string;
  iva: string;
  total: string;
};

export type ResultadoCotizacion = {
  levantamiento: {
    piezas: string;
    areaM2: string;
    filas: { concepto: string; anchoM: string; altoM: string; cantidades: string[]; piezas: string; areaM2: string }[];
    porArea: { area: string; piezas: string; areaM2: string }[];
  };
  opciones: OpcionResultado[];
  reventa: ReventaResultado;
  alertas: Alerta[];
};

/** Error de datos que impide calcular (costo faltante, conversión imposible). */
export class ErrorMotor extends Error {
  constructor(
    message: string,
    public readonly codigo: string,
  ) {
    super(message);
    this.name = "ErrorMotor";
  }
}
