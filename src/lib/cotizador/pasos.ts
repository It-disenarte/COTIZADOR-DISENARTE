// Pasos del asistente. Módulo puro: lo usan la pantalla y el servidor (para decir dónde falta algo).

export const PASOS = ["Datos", "Levantamiento y materiales", "Opciones y fotos", "Operación", "Reventa", "Resumen"] as const;

export const PASO = { datos: 0, levantamiento: 1, opciones: 2, operacion: 3, reventa: 4, resumen: 5 } as const;

/** Algo que falta para poder calcular, con el paso del asistente donde se captura. */
export type Pendiente = { paso: number; mensaje: string };

/** Dónde se corrige cada error del motor. Los datos del catálogo se cambian desde el concepto. */
const PASO_DE_ERROR: Record<string, number> = {
  SIN_PIEZAS: PASO.levantamiento,
  SIN_OPCIONES: PASO.levantamiento,
  CONCEPTO_SIN_INSUMOS: PASO.levantamiento,
  SIN_COSTO: PASO.levantamiento,
  SIN_ANCHO_UTIL: PASO.levantamiento,
  SIN_AREA_LAMINA: PASO.levantamiento,
  SIN_LARGO_ROLLO: PASO.levantamiento,
  UNIDAD_INCOMPATIBLE: PASO.levantamiento,
  INSUMO_INEXISTENTE: PASO.levantamiento,
  RECETA_INEXISTENTE: PASO.levantamiento,
  SIN_PRECIO_GASOLINA: PASO.operacion,
  RENDIMIENTO_INVALIDO: PASO.operacion,
  SIN_UNIDADES_VOLUMEN: PASO.operacion,
  MARGEN_INVALIDO: PASO.resumen,
};

export const pasoDeErrorMotor = (codigo: string): number => PASO_DE_ERROR[codigo] ?? PASO.resumen;

/** Dónde se revisa cada alerta del motor. */
const PASO_DE_ALERTA: Record<string, number> = {
  INSUMO_POR_REVISAR: PASO.levantamiento,
  TRASLADO_EN_CERO: PASO.operacion,
  SIN_HOSPEDAJE: PASO.operacion,
  GASOLINA_DESACTUALIZADA: PASO.operacion,
  REVENTA_SIN_VERIFICAR: PASO.reventa,
  DESVIO_PRECIO: PASO.resumen,
  MARGEN_BAJO: PASO.resumen,
};

export const pasoDeAlerta = (codigo: string): number => PASO_DE_ALERTA[codigo] ?? PASO.resumen;

/** Qué hacer con cada alerta, dicho para el vendedor. */
export const QUE_HACER_ALERTA: Record<string, string> = {
  INSUMO_POR_REVISAR: "Confirma su costo con el lápiz del catálogo o cambia el insumo.",
  TRASLADO_EN_CERO: "Captura los kilómetros del traslado.",
  SIN_HOSPEDAJE: "Agrega el hospedaje o revisa los días de viáticos.",
  GASOLINA_DESACTUALIZADA: "Actualiza el precio en Catálogo → Parámetros.",
  REVENTA_SIN_VERIFICAR: "Confirma el precio en la fuente y marca “Precio verificado hoy”.",
  DESVIO_PRECIO: "Revisa el precio escrito a mano de ese concepto.",
  MARGEN_BAJO: "Revisa el margen, el descuento o los precios escritos a mano.",
};

/** "Operación: Falta capturar el precio de la gasolina…" */
export const textoPendiente = ({ paso, mensaje }: Pendiente): string => `${PASOS[paso] ?? "Resumen"}: ${mensaje}`;
