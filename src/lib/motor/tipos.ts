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
  requiereRevision: boolean;
};

export type ComponenteSnapshot = { insumoId: string; modo: ModoComponente; cantidad: string };

export type RecetaSnapshot = {
  id: string;
  nombre: string;
  familia: FamiliaReceta;
  descripcionPdf: string | null;
  pctMerma: string;
  componentes: ComponenteSnapshot[];
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
};

// ---------------------------------------------------------------------------
// Entrada: lo que se captura en el asistente
// ---------------------------------------------------------------------------

export type FilaLevantamiento = {
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

export type EntradaCotizacion = {
  levantamiento: Levantamiento;
  opciones: { recetaId: string; precioUnitarioManual?: Numerico | null }[];
  incluyeEnvio: boolean;
  operacion: Operacion;
  presentacion: {
    /** true: la operación va dentro del unitario; false: va como fila aparte. */
    operacionProrrateada: boolean;
    modalidades: "solo_una" | "A_y_B";
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

export type FilaPdf = { concepto: string; cantidad: string; unitario: string; subtotal: string };

export type Variante = {
  clave: "unica" | "A" | "B";
  etiqueta: string;
  desglose: Desglose;
  /** Unitario sin redondear, para comparar contra un precio manual. */
  unitarioCalculado: string;
  unitario: string;
  filas: FilaPdf[];
  subtotal: string;
  descuento: string;
  iva: string;
  total: string;
  margenReal: string;
  escenarios: { margen: string; unitario: string; subtotal: string }[];
  alertas: Alerta[];
};

export type OpcionResultado = {
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
