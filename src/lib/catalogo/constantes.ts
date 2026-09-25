// Constantes puras del catálogo, compartidas entre esquema, servidor y cliente.

/** Unidades de venta del PNO-COM-01, apartado 9 (más "lámina", que es presentación de compra). */
export const UNIDADES_COSTO = ["m2", "ml", "pieza", "lamina", "minuto", "ciento", "millar", "persona"] as const;
export type UnidadCosto = (typeof UNIDADES_COSTO)[number];
export const ETIQUETA_UNIDAD: Record<UnidadCosto, string> = {
  m2: "m² (lona, impresión, sustratos rígidos, UV)",
  ml: "Metro lineal (rotulación y corte de vinil)",
  pieza: "Pieza (playeras y artículos)",
  lamina: "Lámina (presentación de compra)",
  minuto: "Minuto (corte y grabado láser)",
  ciento: "Ciento (tarjetas)",
  millar: "Millar (tarjetas)",
  persona: "Persona (cursos)",
};

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

export const MODOS_COMPONENTE = ["por_m2", "por_pieza", "fijo"] as const;
export type ModoComponente = (typeof MODOS_COMPONENTE)[number];
export const ETIQUETA_MODO: Record<ModoComponente, string> = {
  por_m2: "Por m²",
  por_pieza: "Por pieza",
  fijo: "Fijo (una vez)",
};

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

