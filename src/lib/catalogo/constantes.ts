// Constantes puras del catálogo, compartidas entre esquema, servidor y cliente.

/** Unidades de venta del PNO-COM-01, apartado 9 (más "lámina", que es presentación de compra). */
export const UNIDADES_COSTO = ["m2", "ml", "rollo", "pieza", "lamina", "minuto", "ciento", "millar", "persona"] as const;
export type UnidadCosto = (typeof UNIDADES_COSTO)[number];
/**
 * Unidad en la que está el COSTO del insumo: cómo lo compra Diseñarte (el cliente nunca la ve).
 * En minúsculas porque también se lee como "por metro lineal".
 */
export const ETIQUETA_UNIDAD: Record<UnidadCosto, string> = {
  m2: "m²",
  ml: "metro lineal (rollo)",
  rollo: "rollo completo",
  pieza: "pieza",
  lamina: "lámina completa",
  minuto: "minuto (de máquina)",
  ciento: "ciento",
  millar: "millar",
  persona: "persona",
};

/**
 * Categorías de los insumos: se eligen de esta lista para no inventar variantes ("Consumible" y
 * "Consumibles" acababan como dos grupos). Agrupan el catálogo en el asistente.
 */
export const CATEGORIAS_INSUMO = [
  "Acrílico",
  "Consumibles",
  "Corte láser",
  "Herrajes",
  "Impresión",
  "Impresión JV33",
  "Impresión UV",
  "Rotulación",
  "Señalética",
  "Sustrato",
  "Tableros",
  "Vinil de corte",
  "Vinil de muro",
] as const;

/**
 * Opciones para elegir la categoría. Si un insumo trae una que no está en la lista (de antes o de una
 * importación), se muestra también para no perderla hasta que alguien la cambie.
 */
export function opcionesCategoria(actual?: string | null): string[] {
  const lista: string[] = [...CATEGORIAS_INSUMO];
  return actual && !lista.includes(actual) ? [actual, ...lista] : lista;
}

/** Cuántas unidades de venta trae la presentación: un ciento son 100, un millar 1,000. */
export const PIEZAS_POR_UNIDAD: Partial<Record<UnidadCosto, number>> = { ciento: 100, millar: 1000 };

export const FAMILIAS_RECETA = ["senaletica", "tablero", "rotulacion", "vinil_muro", "acrilico", "impresion_menor"] as const;
export type FamiliaReceta = (typeof FAMILIAS_RECETA)[number];
export const ETIQUETA_FAMILIA: Record<FamiliaReceta, string> = {
  senaletica: "Señalética",
  tablero: "Tablero",
  rotulacion: "Rotulación",
  vinil_muro: "Vinil en muro",
  acrilico: "Acrílico",
  impresion_menor: "Impresión menor",
};

/**
 * Cómo se consume un insumo en cada pieza. "por_ml" es para rotulación: los metros lineales
 * salen del escaneo de la unidad y el vendedor los captura por pieza (PNO 9: se vende por ML).
 */
export const MODOS_COMPONENTE = ["por_m2", "por_ml", "por_pieza", "fijo"] as const;
export type ModoComponente = (typeof MODOS_COMPONENTE)[number];

export const ESTADOS_COTIZACION = ["borrador", "enviada", "ganada", "perdida"] as const;
export type EstadoCotizacion = (typeof ESTADOS_COTIZACION)[number];
export const ETIQUETA_ESTADO: Record<EstadoCotizacion, string> = {
  borrador: "Borrador",
  enviada: "Enviada",
  ganada: "Ganada",
  perdida: "Perdida",
};

export const ZONAS = ["local", "foraneo"] as const;
export type Zona = (typeof ZONAS)[number];
export const ETIQUETA_ZONA: Record<Zona, string> = { local: "Local", foraneo: "Foráneo" };

// Digitalización ------------------------------------------------------------------------------

/** Dos tipos de cotización: la de siempre (costo + fórmula del PNO) y la de servicios digitales (precio de lista). */
export const TIPOS_COTIZACION = ["fisica", "digital"] as const;
export type TipoCotizacion = (typeof TIPOS_COTIZACION)[number];
export const ETIQUETA_TIPO_COTIZACION: Record<TipoCotizacion, string> = {
  fisica: "Publicidad física",
  digital: "Digitalización",
};

/**
 * Cómo se cobra un servicio digital. "paquete": página web que se renta (mensualidad + activación,
 * IVA incluido) o se compra como dueño (precio + IVA, en dos pagos). "unico" y "mensual" llevan IVA aparte.
 */
export const COBROS_DIGITALES = ["paquete", "unico", "mensual"] as const;
export type CobroDigital = (typeof COBROS_DIGITALES)[number];
export const ETIQUETA_COBRO_DIGITAL: Record<CobroDigital, string> = {
  paquete: "Paquete web (renta o dueño)",
  unico: "Pago único",
  mensual: "Pago mensual",
};

/** Grupos del catálogo de servicios digitales (lista fija, como las categorías de insumos). */
export const CATEGORIAS_DIGITALES = [
  "Paquetes web",
  "Web a la medida",
  "Identidad de marca",
  "Google y SEO",
  "Redes sociales",
  "Contenido",
  "Soporte y capacitación",
  "Otros",
] as const;

export function opcionesCategoriaDigital(actual?: string | null): string[] {
  const lista: string[] = [...CATEGORIAS_DIGITALES];
  return actual && !lista.includes(actual) ? [actual, ...lista] : lista;
}

/** Cómo se presenta el paquete web en la propuesta: solo renta, solo dueño, o las dos para que el cliente elija. */
export const MODALIDADES_WEB = ["renta", "dueno", "ambas"] as const;
export type ModalidadWeb = (typeof MODALIDADES_WEB)[number];
export const ETIQUETA_MODALIDAD_WEB: Record<ModalidadWeb, string> = {
  renta: "Solo renta",
  dueno: "Solo dueño",
  ambas: "Las dos, para que el cliente elija",
};
