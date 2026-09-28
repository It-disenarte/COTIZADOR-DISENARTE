import { PIEZAS_POR_UNIDAD } from "@/lib/catalogo/constantes";
import { CERO, d, type Decimal, money, round2, suma } from "./numeros";
import { type EntradaNormalizada, type FilaConId, normalizarEntrada } from "./normalizar";
import {
  type Alerta,
  type ComponenteConcepto,
  type ConceptoResultado,
  type Desglose,
  type EntradaCotizacion,
  ErrorMotor,
  type FilaLevantamiento,
  type FilaPdf,
  type InsumoSnapshot,
  type OpcionCotizacion,
  type OpcionResultado,
  type ResultadoCotizacion,
  type ReventaResultado,
  type Snapshot,
  type Variante,
} from "./tipos";

const DIAS_AVISO_GASOLINA = 7;

const vacio = (valor: unknown) => valor === null || valor === undefined || valor === "";

/** Usa el valor capturado; si viene vacío, el de respaldo (parámetro de la casa). */
const elegir = (valor: unknown, respaldo: unknown): Decimal => d((vacio(valor) ? respaldo : valor) as never);

// ---------------------------------------------------------------------------
// Levantamiento (6.2)
// ---------------------------------------------------------------------------

function calcularLevantamiento(entrada: EntradaNormalizada) {
  const { areas, filas } = entrada.levantamiento;

  // Casilla vacía = 0 (el asistente calcula con lo que hay en pantalla).
  const valor = (v: unknown) => d(vacio(v) ? 0 : (v as never));
  const detalle = filas.map((fila) => {
    const cantidades = fila.cantidades.map(valor);
    const piezas = suma(cantidades);
    const areaPieza = valor(fila.anchoM).times(valor(fila.altoM));
    return { fila, cantidades, piezas, areaPieza, areaM2: piezas.times(areaPieza) };
  });

  const piezas = suma(detalle.map((f) => f.piezas));
  const areaM2 = suma(detalle.map((f) => f.areaM2));

  const porArea = areas.map((area, i) => {
    const piezasArea = suma(detalle.map((f) => f.cantidades[i] ?? CERO));
    const m2Area = suma(detalle.map((f) => (f.cantidades[i] ?? CERO).times(f.areaPieza)));
    return { area, piezas: piezasArea.toString(), areaM2: money(m2Area) };
  });

  return {
    piezas,
    areaM2,
    detalle,
    resumen: {
      piezas: piezas.toString(),
      areaM2: money(areaM2),
      filas: detalle.map((f) => ({
        concepto: f.fila.concepto,
        anchoM: valor(f.fila.anchoM).toString(),
        altoM: valor(f.fila.altoM).toString(),
        cantidades: f.cantidades.map((c) => c.toString()),
        piezas: f.piezas.toString(),
        areaM2: money(f.areaM2),
      })),
      porArea,
    },
  };
}

// ---------------------------------------------------------------------------
// Costo de materiales por receta (6.3)
// ---------------------------------------------------------------------------

/** Lleva el costo del insumo a costo por m², según cómo se compra. */
function costoPorM2(insumo: InsumoSnapshot): Decimal {
  const costo = exigirCosto(insumo);
  switch (insumo.unidadCosto) {
    case "m2":
      return costo;
    case "ml": {
      const ancho = d(insumo.anchoUtilM);
      if (ancho.lte(0)) {
        throw new ErrorMotor(`"${insumo.nombre}" se compra por metro lineal y no tiene ancho útil capturado.`, "SIN_ANCHO_UTIL");
      }
      return costo.div(ancho);
    }
    case "lamina": {
      const area = d(insumo.areaLaminaM2);
      if (area.lte(0)) {
        throw new ErrorMotor(`"${insumo.nombre}" se compra por lámina y no tiene área capturada.`, "SIN_AREA_LAMINA");
      }
      return costo.div(area);
    }
    default:
      throw new ErrorMotor(
        `El insumo "${insumo.nombre}" se cobra por ${insumo.unidadCosto ?? "unidad sin definir"} y no se puede usar por m². Cámbialo a por pieza en la receta.`,
        "UNIDAD_INCOMPATIBLE",
      );
  }
}

function exigirCosto(insumo: InsumoSnapshot): Decimal {
  if (insumo.costo === null) {
    throw new ErrorMotor(`Falta capturar el costo de "${insumo.nombre}".`, "SIN_COSTO");
  }
  return d(insumo.costo);
}

/**
 * Costo de una pieza cuando el insumo no se cobra por superficie. Las tarjetas se compran
 * por ciento o millar (PNO 9), así que el costo se reparte entre las piezas que trae la
 * presentación; el láser se cobra por minuto y los cursos por persona, uno a uno.
 */
function costoPorPieza(insumo: InsumoSnapshot): Decimal {
  const costo = exigirCosto(insumo);
  const porPresentacion = insumo.unidadCosto ? PIEZAS_POR_UNIDAD[insumo.unidadCosto] : undefined;
  return porPresentacion ? costo.div(porPresentacion) : costo;
}

/** Rotulación (PNO 9): el vinil se vende por metro lineal y los metros salen del escaneo de la unidad. */
function costoPorMl(insumo: InsumoSnapshot): Decimal {
  const costo = exigirCosto(insumo);
  if (insumo.unidadCosto !== "ml") {
    throw new ErrorMotor(
      `"${insumo.nombre}" se compra por ${insumo.unidadCosto ?? "unidad sin definir"}, no por metro lineal. Cámbialo a "por m²" o "por pieza".`,
      "UNIDAD_INCOMPATIBLE",
    );
  }
  return costo;
}

/** Costo de los insumos de un concepto, según sus piezas y sus m². */
function materialesDeConcepto(componentes: ComponenteConcepto[], snapshot: Snapshot, piezas: Decimal, areaM2: Decimal): Decimal {
  const importes = componentes.map((componente) => {
    const insumo = snapshot.insumos[componente.insumoId];
    if (!insumo) throw new ErrorMotor("Un insumo del concepto ya no existe en el catálogo.", "INSUMO_INEXISTENTE");
    const cantidad = d(componente.cantidad);

    switch (componente.modo) {
      case "por_m2":
        return areaM2.times(costoPorM2(insumo)).times(cantidad);
      case "por_ml":
        return piezas.times(cantidad).times(costoPorMl(insumo));
      case "por_pieza":
        return piezas.times(costoPorPieza(insumo)).times(cantidad);
      case "fijo":
        return costoPorPieza(insumo).times(cantidad);
    }
  });
  return suma(importes);
}

/**
 * Costo de materiales de un concepto, para mostrarlo en la tabla del levantamiento mientras se
 * captura. Lanza ErrorMotor si a un insumo le falta un dato (el asistente muestra el mensaje).
 */
export function costoDeConcepto(
  componentes: ComponenteConcepto[],
  fila: Pick<FilaLevantamiento, "anchoM" | "altoM" | "cantidades">,
  snapshot: Snapshot,
): Decimal {
  const piezas = suma(fila.cantidades.map((c) => d(vacio(c) ? 0 : c)));
  const areaM2 = piezas.times(d(vacio(fila.anchoM) ? 0 : fila.anchoM)).times(d(vacio(fila.altoM) ? 0 : fila.altoM));
  return materialesDeConcepto(componentes, snapshot, piezas, areaM2);
}

// ---------------------------------------------------------------------------
// Costos de operación (6.4)
// ---------------------------------------------------------------------------

type CostosFijos = {
  diseno: Decimal;
  instalacion: Decimal;
  viaticos: Decimal;
  gasolina: Decimal;
  casetas: Decimal;
  hospedaje: Decimal;
  extrasUnaVez: Decimal;
  total: Decimal;
};

function calcularFijos(
  entrada: EntradaCotizacion,
  snapshot: Snapshot,
  incluirInstalacion: boolean,
  /** Unidades entre las que se reparte el diseño en el escenario por volumen (PNO 7.2.13). */
  amortizarDisenoEntre?: Decimal,
): CostosFijos {
  const p = snapshot.parametros;
  const op = entrada.operacion;

  const disenoCompleto = vacio(op.disenoMontoManual) ? d(op.diasDiseno).times(d(p.tarifaDisenoDia)) : d(op.disenoMontoManual);
  const diseno =
    amortizarDisenoEntre && amortizarDisenoEntre.gt(1) ? disenoCompleto.div(amortizarDisenoEntre) : disenoCompleto;

  const instalacionEscalaPorPieza = op.instalacion.escalaPorPieza === true;
  const instalacion =
    incluirInstalacion && op.instalacion.incluye && !instalacionEscalaPorPieza
      ? d(op.instalacion.personas).times(d(op.instalacion.dias)).times(d(p.tarifaInstaladorDia))
      : CERO;

  // Trabajo en casa o suministro sin instalación: no hay salida a campo.
  const haySalida = incluirInstalacion && !op.trabajoEnInstalacionesDisenarte && (op.instalacion.incluye || entrada.incluyeEnvio);

  let viaticos = CERO;
  let gasolina = CERO;
  let casetas = CERO;
  let hospedaje = CERO;

  if (haySalida) {
    const montoDia = elegir(
      op.viaticos.montoDiaManual,
      op.viaticos.tipo === "foraneo" ? p.viaticosForaneoDia : p.viaticosLocalDia,
    );
    viaticos = d(op.viaticos.personas).times(d(op.viaticos.dias)).times(montoDia);

    // Diario: un viaje redondo por día de trabajo. Una vez: se quedan, así que es un viaje redondo.
    const viajes = op.traslado.modo === "diario" ? elegir(op.traslado.viajesRedondos, op.instalacion.dias) : d(1);
    const km = d(op.traslado.kmPorTrayecto).times(2).times(viajes);

    if (km.gt(0)) {
      const rendimiento = elegir(op.traslado.rendimientoKmL, p.rendimientoKmL);
      if (rendimiento.lte(0)) throw new ErrorMotor("El rendimiento del vehículo debe ser mayor a 0.", "RENDIMIENTO_INVALIDO");
      if (p.precioGasolinaLitro == null || p.precioGasolinaLitro === "") {
        throw new ErrorMotor("Falta capturar el precio de la gasolina en Parámetros.", "SIN_PRECIO_GASOLINA");
      }
      gasolina = km.div(rendimiento).times(d(p.precioGasolinaLitro));
    }
    casetas = d(op.traslado.casetasPorViaje).times(viajes);
    hospedaje = op.hospedaje.incluye ? d(op.hospedaje.noches).times(d(op.hospedaje.costoNoche)) : CERO;
  }

  const extrasUnaVez = suma(op.extras.filter((e) => e.escala === "una_vez").map((e) => d(e.monto)));
  const total = suma([diseno, instalacion, viaticos, gasolina, casetas, hospedaje, extrasUnaVez]);

  return { diseno, instalacion, viaticos, gasolina, casetas, hospedaje, extrasUnaVez, total };
}

// ---------------------------------------------------------------------------
// Precio (6.5)
// ---------------------------------------------------------------------------

type Costos = { variable: Decimal; fijos: CostosFijos; desglose: Desglose };

function armarDesglose(
  partes: {
    materiales: Decimal;
    consumibles: Decimal;
    produccion: Decimal;
    instalacionPorPieza: Decimal;
    extrasPorPieza: Decimal;
    variable: Decimal;
  },
  fijos: CostosFijos,
): Desglose {
  return {
    materiales: money(partes.materiales),
    consumibles: money(partes.consumibles),
    produccion: money(partes.produccion),
    instalacionPorPieza: money(partes.instalacionPorPieza),
    extrasPorPieza: money(partes.extrasPorPieza),
    variable: money(partes.variable),
    diseno: money(fijos.diseno),
    instalacion: money(fijos.instalacion),
    viaticos: money(fijos.viaticos),
    gasolina: money(fijos.gasolina),
    casetas: money(fijos.casetas),
    hospedaje: money(fijos.hospedaje),
    extrasUnaVez: money(fijos.extrasUnaVez),
    fijo: money(fijos.total),
    costoTotal: money(partes.variable.plus(fijos.total)),
  };
}

/** factor = (1 + margen de error) ÷ (1 − margen). El margen es sobre precio de venta. */
function factorPrecio(margen: Decimal, pctError: Decimal, aplicaError: boolean): Decimal {
  if (margen.gte(1)) throw new ErrorMotor("El margen debe ser menor a 1 (0.30 = 30%).", "MARGEN_INVALIDO");
  const conError = aplicaError ? pctError.plus(1) : d(1);
  return conError.div(d(1).minus(margen));
}

export function calcular(entradaCapturada: EntradaCotizacion, snapshot: Snapshot): ResultadoCotizacion {
  const entrada = normalizarEntrada(entradaCapturada, snapshot);
  const p = snapshot.parametros;
  const { piezas, detalle, resumen } = calcularLevantamiento(entrada);
  if (piezas.lte(0)) throw new ErrorMotor("El levantamiento no tiene piezas.", "SIN_PIEZAS");
  if (entrada.opciones.length === 0) throw new ErrorMotor("Agrega al menos una opción.", "SIN_OPCIONES");

  const margen = elegir(entrada.ajustes.margen, p.margen);
  const pctError = d(p.pctMargenError);
  const iva = d(p.iva);
  const alertasGenerales: Alerta[] = [];

  // Un concepto sin piezas no se cotiza (p. ej. una fila que se dejó a medias).
  const conPiezas = detalle.filter((f) => f.piezas.gt(0));

  const opciones: OpcionResultado[] = entrada.opciones.map((opcion) => {
    const porConcepto: CostoConcepto[] = conPiezas.map((f) => {
      const componentes = opcion.materiales[f.fila.id] ?? [];
      if (componentes.length === 0) {
        throw new ErrorMotor(
          `"${f.fila.concepto || "Concepto sin nombre"}" no tiene insumos en "${opcion.nombre}". Agrégaselos en el paso Levantamiento.`,
          "CONCEPTO_SIN_INSUMOS",
        );
      }
      for (const componente of componentes) {
        const insumo = snapshot.insumos[componente.insumoId];
        if (insumo?.requiereRevision) {
          alertasGenerales.push({
            codigo: "INSUMO_POR_REVISAR",
            mensaje: `El insumo "${insumo.nombre}" está marcado como "Por revisar".`,
          });
        }
      }
      const materiales = materialesDeConcepto(componentes, snapshot, f.piezas, f.areaM2);
      const consumibles = entrada.ajustes.aplicaConsumibles ? materiales.times(d(p.pctConsumibles)) : CERO;
      return { fila: f.fila, piezas: f.piezas, materiales, consumibles, directo: materiales.plus(consumibles) };
    });

    const materiales = suma(porConcepto.map((c) => c.materiales));
    const consumibles = suma(porConcepto.map((c) => c.consumibles));
    const produccion = d(entrada.operacion.produccion.personas)
      .times(d(entrada.operacion.produccion.dias))
      .times(d(p.tarifaInstaladorDia));
    const extrasPorPiezaUnitario = suma(entrada.operacion.extras.filter((e) => e.escala === "por_pieza").map((e) => d(e.monto)));
    const extrasPorPieza = extrasPorPiezaUnitario.times(piezas);

    // Unidades del proyecto completo, para amortizar el diseño (PNO-COM-01, 7.2.13 y 8.3).
    const unidadesVolumen = d(elegir(entrada.presentacion.unidadesVolumen, 0));
    const modalidades: {
      clave: Variante["clave"];
      etiqueta: string;
      incluirInstalacion: boolean;
      amortizarDisenoEntre?: Decimal;
    }[] =
      entrada.presentacion.modalidades === "A_y_B"
        ? [
            { clave: "A", etiqueta: "A) Suministro", incluirInstalacion: false },
            { clave: "B", etiqueta: "B) Suministro e instalación", incluirInstalacion: true },
          ]
        : entrada.presentacion.modalidades === "piloto_y_volumen"
          ? [
              { clave: "A", etiqueta: "A) Unidad piloto", incluirInstalacion: true },
              {
                clave: "B",
                etiqueta: `B) Precio unitario proyectado a ${unidadesVolumen.toString()} unidades`,
                incluirInstalacion: true,
                amortizarDisenoEntre: unidadesVolumen,
              },
            ]
          : [{ clave: "unica", etiqueta: opcion.nombre, incluirInstalacion: true }];

    if (entrada.presentacion.modalidades === "piloto_y_volumen" && unidadesVolumen.lte(1)) {
      throw new ErrorMotor(
        "Para el escenario por volumen captura entre cuántas unidades se amortiza el diseño (más de 1).",
        "SIN_UNIDADES_VOLUMEN",
      );
    }

    const variantes = modalidades.map(({ clave, etiqueta, incluirInstalacion, amortizarDisenoEntre }) => {
      const instalacionPorPiezaUnitario =
        incluirInstalacion && entrada.operacion.instalacion.incluye && entrada.operacion.instalacion.escalaPorPieza === true
          ? d(entrada.operacion.instalacion.personas).times(d(entrada.operacion.instalacion.dias)).times(d(p.tarifaInstaladorDia))
          : CERO;
      const instalacionPorPieza = instalacionPorPiezaUnitario.times(piezas);

      const variable = suma([materiales, consumibles, produccion, instalacionPorPieza, extrasPorPieza]);
      const fijos = calcularFijos(entrada, snapshot, incluirInstalacion, amortizarDisenoEntre);
      const costos: Costos = {
        variable,
        fijos,
        desglose: armarDesglose({ materiales, consumibles, produccion, instalacionPorPieza, extrasPorPieza, variable }, fijos),
      };
      return calcularVariante({
        clave,
        etiqueta,
        opcion,
        entrada,
        costos,
        porConcepto,
        porPiezaUnitario: instalacionPorPiezaUnitario.plus(extrasPorPiezaUnitario),
        produccion,
        piezas,
        margen,
        pctError,
        iva,
        snapshot,
      });
    });

    return { id: opcion.id, recetaId: opcion.id, nombre: opcion.nombre, descripcionPdf: opcion.descripcion ?? null, variantes };
  });

  // Alertas de operación (6.8)
  const op = entrada.operacion;
  const sinTraslado = d(op.traslado.kmPorTrayecto).lte(0);
  if (op.instalacion.incluye && !op.trabajoEnInstalacionesDisenarte && op.viaticos.tipo === "foraneo" && sinTraslado) {
    alertasGenerales.push({ codigo: "TRASLADO_EN_CERO", mensaje: "Hay instalación foránea pero el traslado quedó en cero." });
  }
  if (op.viaticos.tipo === "foraneo" && d(op.viaticos.dias).gt(1) && !op.hospedaje.incluye && !op.trabajoEnInstalacionesDisenarte) {
    alertasGenerales.push({ codigo: "SIN_HOSPEDAJE", mensaje: "Proyecto foráneo de más de un día sin hospedaje capturado." });
  }
  if (p.precioGasolinaActualizadoEn) {
    const dias = (Date.now() - new Date(p.precioGasolinaActualizadoEn).getTime()) / 86_400_000;
    if (dias > DIAS_AVISO_GASOLINA) {
      alertasGenerales.push({
        codigo: "GASOLINA_DESACTUALIZADA",
        mensaje: `El precio de la gasolina tiene ${Math.floor(dias)} días sin actualizarse.`,
      });
    }
  }

  const reventa = calcularReventa(entrada, snapshot, alertasGenerales);

  return {
    levantamiento: resumen,
    opciones,
    reventa,
    alertas: dedupe(alertasGenerales),
  };
}

type CostoConcepto = { fila: FilaConId; piezas: Decimal; materiales: Decimal; consumibles: Decimal; directo: Decimal };

function calcularVariante(args: {
  clave: Variante["clave"];
  etiqueta: string;
  opcion: OpcionCotizacion;
  entrada: EntradaNormalizada;
  costos: Costos;
  porConcepto: CostoConcepto[];
  /** Instalación y extras que se cobran por pieza: cada concepto paga los de sus piezas. */
  porPiezaUnitario: Decimal;
  produccion: Decimal;
  piezas: Decimal;
  margen: Decimal;
  pctError: Decimal;
  iva: Decimal;
  snapshot: Snapshot;
}): Variante {
  const { clave, etiqueta, opcion, entrada, costos, porConcepto, porPiezaUnitario, produccion, piezas, margen, pctError, iva, snapshot } =
    args;
  const p = snapshot.parametros;
  const alertas: Alerta[] = [];
  const factor = factorPrecio(margen, pctError, entrada.ajustes.aplicaMargenError);
  const prorratear = entrada.presentacion.operacionProrrateada;

  // Lo que no es de un concepto en particular (producción y, si se prorratea, la operación) se
  // reparte según el costo directo de cada concepto. Si todo costara cero, según sus piezas.
  const directoTotal = suma(porConcepto.map((c) => c.directo));
  const compartido = prorratear ? produccion.plus(costos.fijos.total) : produccion;
  const costoDe = (c: CostoConcepto) => {
    const peso = directoTotal.gt(0) ? c.directo.div(directoTotal) : c.piezas.div(piezas);
    return c.directo.plus(porPiezaUnitario.times(c.piezas)).plus(compartido.times(peso));
  };

  const conceptos: ConceptoResultado[] = porConcepto.map((c) => {
    const costo = costoDe(c);
    const unitarioCalculado = costo.times(factor).div(c.piezas);
    const nombre = c.fila.concepto || opcion.nombre;

    const manual = opcion.preciosManuales?.[c.fila.id];
    let unitario = unitarioCalculado;
    if (!vacio(manual)) {
      unitario = d(manual as never);
      const desvio = unitarioCalculado.gt(0) ? unitario.minus(unitarioCalculado).abs().div(unitarioCalculado) : CERO;
      if (desvio.gt(d(p.alertaDesvioPrecio))) {
        alertas.push({
          codigo: "DESVIO_PRECIO",
          mensaje: `El unitario capturado de "${nombre}" se desvía ${desvio.times(100).toDecimalPlaces(1)}% del calculado (${money(unitarioCalculado)}).`,
        });
      }
    }

    // Redondeo final: la tabla del PDF debe cuadrar al multiplicar.
    const unitarioMostrado = round2(unitario);
    return {
      filaId: c.fila.id,
      concepto: nombre,
      piezas: c.piezas.toString(),
      costo: money(c.directo),
      unitarioCalculado: unitarioCalculado.toDecimalPlaces(4).toString(),
      unitario: unitarioMostrado.toFixed(2),
      subtotal: money(unitarioMostrado.times(c.piezas)),
    };
  });

  const filas: FilaPdf[] = conceptos.map((c) => ({
    concepto: c.concepto,
    cantidad: c.piezas,
    unitario: c.unitario,
    subtotal: c.subtotal,
  }));

  if (!prorratear && costos.fijos.total.gt(0)) {
    const precioOperacion = round2(costos.fijos.total.times(factor));
    filas.push({
      concepto: "Diseño, envío e instalación",
      cantidad: "1",
      unitario: precioOperacion.toFixed(2),
      subtotal: precioOperacion.toFixed(2),
    });
  }

  const descuento = elegir(entrada.ajustes.descuentoDecisionRapida?.monto, 0);
  const subtotal = round2(suma(filas.map((f) => d(f.subtotal))).minus(descuento));
  const total = round2(subtotal.times(iva.plus(1)));
  const ivaMonto = total.minus(subtotal);

  const costoTotal = costos.variable.plus(costos.fijos.total);
  const margenReal = subtotal.gt(0) ? subtotal.minus(costoTotal).div(subtotal) : CERO;
  if (margenReal.lt(d(p.alertaMargenMinimo))) {
    alertas.push({
      codigo: "MARGEN_BAJO",
      mensaje: `El margen real de "${etiqueta}" es ${margenReal.times(100).toDecimalPlaces(1)}%, por debajo del mínimo.`,
    });
  }

  // Unitario de la opción: con un solo concepto es el suyo; con varios, el promedio.
  const subtotalConceptos = suma(conceptos.map((c) => d(c.subtotal)));
  const unitarioCalculado = suma(porConcepto.map((c) => costoDe(c).times(factor))).div(piezas);
  const unitario = conceptos.length === 1 ? d(conceptos[0].unitario) : round2(subtotalConceptos.div(piezas));

  const escenarios = p.escenariosMargen.map((escenario) => {
    const factorEscenario = factorPrecio(d(escenario), pctError, entrada.ajustes.aplicaMargenError);
    const subtotalEscenario = suma(porConcepto.map((c) => round2(costoDe(c).times(factorEscenario).div(c.piezas)).times(c.piezas)));
    const operacionAparte = prorratear ? CERO : round2(costos.fijos.total.times(factorEscenario));
    return {
      margen: d(escenario).toString(),
      unitario: round2(subtotalEscenario.div(piezas)).toFixed(2),
      subtotal: money(subtotalEscenario.plus(operacionAparte)),
    };
  });

  return {
    clave,
    etiqueta,
    desglose: costos.desglose,
    unitarioCalculado: unitarioCalculado.toDecimalPlaces(4).toString(),
    unitario: unitario.toFixed(2),
    filas,
    conceptos,
    subtotal: subtotal.toFixed(2),
    descuento: money(descuento),
    iva: ivaMonto.toFixed(2),
    total: total.toFixed(2),
    margenReal: margenReal.toDecimalPlaces(4).toString(),
    escenarios,
    alertas,
  };
}

// ---------------------------------------------------------------------------
// Reventa (6.7): markup sin margen de venta ni margen de error
// ---------------------------------------------------------------------------

function calcularReventa(entrada: EntradaNormalizada, snapshot: Snapshot, alertas: Alerta[]): ReventaResultado {
  const p = snapshot.parametros;
  const items = entrada.reventa.map((articulo) => {
    const unitario = round2(d(articulo.precioReferencia).times(d(p.pctReventa).plus(1)));
    const cantidad = d(articulo.cantidad);
    if (!articulo.verificado) {
      alertas.push({ codigo: "REVENTA_SIN_VERIFICAR", mensaje: `El artículo "${articulo.nombre}" no tiene precio verificado.` });
    }
    return {
      nombre: articulo.nombre,
      cantidad: cantidad.toString(),
      precioReferencia: money(d(articulo.precioReferencia)),
      unitario: unitario.toFixed(2),
      subtotal: money(unitario.times(cantidad)),
      link: articulo.link ?? null,
      verificado: articulo.verificado,
    };
  });

  const subtotal = round2(suma(items.map((i) => d(i.subtotal))));
  const total = round2(subtotal.times(d(p.iva).plus(1)));
  return { items, subtotal: subtotal.toFixed(2), iva: total.minus(subtotal).toFixed(2), total: total.toFixed(2) };
}

const dedupe = (alertas: Alerta[]): Alerta[] => {
  const vistas = new Set<string>();
  return alertas.filter((a) => {
    const clave = `${a.codigo}|${a.mensaje}`;
    if (vistas.has(clave)) return false;
    vistas.add(clave);
    return true;
  });
};
