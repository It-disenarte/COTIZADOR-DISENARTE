// Constantes puras del catálogo, compartidas entre esquema, servidor y cliente.

export const UNIDADES_COSTO = ["m2", "ml", "pieza", "lamina"] as const;
export type UnidadCosto = (typeof UNIDADES_COSTO)[number];
export const ETIQUETA_UNIDAD: Record<UnidadCosto, string> = {
  m2: "m²",
  ml: "Metro lineal",
  pieza: "Pieza",
  lamina: "Lámina",
};

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

