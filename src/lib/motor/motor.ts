import { CERO, d, type Decimal, money, round2, suma } from "./numeros";
import {
  type Alerta,
  type Desglose,
  type EntradaCotizacion,
  ErrorMotor,
  type FilaPdf,
  type InsumoSnapshot,
  type OpcionResultado,
  type RecetaSnapshot,
  type ResultadoCotizacion,
  type ReventaResultado,
  type Snapshot,
  type Variante,
} from "./tipos";

const DIAS_AVISO_GASOLINA = 7;

// ---------------------------------------------------------------------------
// Levantamiento (6.2)
// ---------------------------------------------------------------------------

function calcularLevantamiento(entrada: EntradaCotizacion) {
  const { areas, filas } = entrada.levantamiento;

  const detalle = filas.map((fila) => {
    const cantidades = fila.cantidades.map(d);
    const piezas = suma(cantidades);
    const areaPieza = d(fila.anchoM).times(d(fila.altoM));
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
    resumen: {
      piezas: piezas.toString(),
      areaM2: money(areaM2),
      filas: detalle.map((f) => ({
        concepto: f.fila.concepto,
        anchoM: d(f.fila.anchoM).toString(),
        altoM: d(f.fila.altoM).toString(),
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
      throw new ErrorMotor(`"${insumo.nombre}" se cobra por pieza: no puede usarse por m².`, "UNIDAD_INCOMPATIBLE");
  }
}

function exigirCosto(insumo: InsumoSnapshot): Decimal {
  if (insumo.costo === null) {
    throw new ErrorMotor(`Falta capturar el costo de "${insumo.nombre}".`, "SIN_COSTO");
  }
  return d(insumo.costo);
}

function materialesDeReceta(receta: RecetaSnapshot, snapshot: Snapshot, areaM2: Decimal, piezas: Decimal): Decimal {
  const merma = d(receta.pctMerma);
  const importes = receta.componentes.map((componente) => {
    const insumo = snapshot.insumos[componente.insumoId];
    if (!insumo) throw new ErrorMotor("Un insumo de la receta ya no existe en el catálogo.", "INSUMO_INEXISTENTE");
    const cantidad = d(componente.cantidad);

    switch (componente.modo) {
      case "por_m2":
        return areaM2.times(costoPorM2(insumo)).times(cantidad).times(merma.plus(1));
      case "por_pieza":
        return piezas.times(exigirCosto(insumo)).times(cantidad);
      case "fijo":
        return exigirCosto(insumo).times(cantidad);
    }
  });
  return suma(importes);
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

function calcularFijos(entrada: EntradaCotizacion, snapshot: Snapshot, incluirInstalacion: boolean): CostosFijos {
  const p = snapshot.parametros;
  const op = entrada.operacion;

  const diseno = op.disenoMontoManual != null && op.disenoMontoManual !== "" ? d(op.disenoMontoManual) : d(op.diasDiseno).times(d(p.tarifaDisenoDia));

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
    const montoDia =
      op.viaticos.montoDiaManual != null && op.viaticos.montoDiaManual !== ""
        ? d(op.viaticos.montoDiaManual)
        : d(op.viaticos.tipo === "foraneo" ? p.viaticosForaneoDia : p.viaticosLocalDia);
    viaticos = d(op.viaticos.personas).times(d(op.viaticos.dias)).times(montoDia);

    // Diario: un viaje redondo por día de trabajo. Una vez: se quedan, así que es un viaje redondo.
    const viajes = op.traslado.modo === "diario" ? d(op.traslado.viajesRedondos ?? op.instalacion.dias) : d(1);
    const km = d(op.traslado.kmPorTrayecto).times(2).times(viajes);

    if (km.gt(0)) {
      const rendimiento = d(op.traslado.rendimientoKmL ?? p.rendimientoKmL);
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

export function calcular(entrada: EntradaCotizacion, snapshot: Snapshot): ResultadoCotizacion {
  const p = snapshot.parametros;
  const { piezas, areaM2, resumen } = calcularLevantamiento(entrada);
  if (piezas.lte(0)) throw new ErrorMotor("El levantamiento no tiene piezas.", "SIN_PIEZAS");

  const margen = d(entrada.ajustes.margen ?? p.margen);
  const pctError = d(p.pctMargenError);
  const iva = d(p.iva);
  const alertasGenerales: Alerta[] = [];

  const opciones: OpcionResultado[] = entrada.opciones.map((opcion) => {
    const receta = snapshot.recetas[opcion.recetaId];
    if (!receta) throw new ErrorMotor("La receta seleccionada ya no existe.", "RECETA_INEXISTENTE");

    for (const componente of receta.componentes) {
      const insumo = snapshot.insumos[componente.insumoId];
      if (insumo?.requiereRevision) {
        alertasGenerales.push({
          codigo: "INSUMO_POR_REVISAR",
          mensaje: `El insumo "${insumo.nombre}" está marcado como "Por revisar".`,
        });
      }
    }

    const materiales = materialesDeReceta(receta, snapshot, areaM2, piezas);
    const consumibles = entrada.ajustes.aplicaConsumibles ? materiales.times(d(p.pctConsumibles)) : CERO;
    const produccion = d(entrada.operacion.produccion.personas)
      .times(d(entrada.operacion.produccion.dias))
      .times(d(p.tarifaInstaladorDia));
    const extrasPorPieza = suma(entrada.operacion.extras.filter((e) => e.escala === "por_pieza").map((e) => d(e.monto))).times(piezas);

    const modalidades: { clave: Variante["clave"]; etiqueta: string; incluirInstalacion: boolean }[] =
      entrada.presentacion.modalidades === "A_y_B"
        ? [
            { clave: "A", etiqueta: "A) Suministro", incluirInstalacion: false },
            { clave: "B", etiqueta: "B) Suministro e instalación", incluirInstalacion: true },
          ]
        : [{ clave: "unica", etiqueta: receta.nombre, incluirInstalacion: true }];

    const variantes = modalidades.map(({ clave, etiqueta, incluirInstalacion }) => {
      const instalacionPorPieza =
        incluirInstalacion && entrada.operacion.instalacion.incluye && entrada.operacion.instalacion.escalaPorPieza === true
          ? d(entrada.operacion.instalacion.personas)
              .times(d(entrada.operacion.instalacion.dias))
              .times(d(p.tarifaInstaladorDia))
              .times(piezas)
          : CERO;

      const variable = suma([materiales, consumibles, produccion, instalacionPorPieza, extrasPorPieza]);
      const fijos = calcularFijos(entrada, snapshot, incluirInstalacion);
      const costos: Costos = {
        variable,
        fijos,
        desglose: armarDesglose({ materiales, consumibles, produccion, instalacionPorPieza, extrasPorPieza, variable }, fijos),
      };
      return calcularVariante({ clave, etiqueta, receta, entrada, costos, piezas, margen, pctError, iva, snapshot, opcion });
    });

    return { recetaId: receta.id, nombre: receta.nombre, descripcionPdf: receta.descripcionPdf, variantes };
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

function calcularVariante(args: {
  clave: Variante["clave"];
  etiqueta: string;
  receta: RecetaSnapshot;
  entrada: EntradaCotizacion;
  costos: Costos;
  piezas: Decimal;
  margen: Decimal;
  pctError: Decimal;
  iva: Decimal;
  snapshot: Snapshot;
  opcion: EntradaCotizacion["opciones"][number];
}): Variante {
  const { clave, etiqueta, receta, entrada, costos, piezas, margen, pctError, iva, snapshot, opcion } = args;
  const p = snapshot.parametros;
  const alertas: Alerta[] = [];
  const factor = factorPrecio(margen, pctError, entrada.ajustes.aplicaMargenError);

  const prorratear = entrada.presentacion.operacionProrrateada;
  const precioPiezas = prorratear ? costos.variable.plus(costos.fijos.total).times(factor) : costos.variable.times(factor);
  const unitarioCalculado = precioPiezas.div(piezas);

  const manual = opcion.precioUnitarioManual;
  let unitario = unitarioCalculado;
  if (manual != null && manual !== "") {
    unitario = d(manual);
    const desvio = unitarioCalculado.gt(0) ? unitario.minus(unitarioCalculado).abs().div(unitarioCalculado) : CERO;
    if (desvio.gt(d(p.alertaDesvioPrecio))) {
      alertas.push({
        codigo: "DESVIO_PRECIO",
        mensaje: `El unitario capturado se desvía ${desvio.times(100).toDecimalPlaces(1)}% del calculado (${money(unitarioCalculado)}).`,
      });
    }
  }

  // Redondeo final: la tabla del PDF debe cuadrar al multiplicar.
  const unitarioMostrado = round2(unitario);
  const filas: FilaPdf[] = [
    {
      concepto: receta.nombre,
      cantidad: piezas.toString(),
      unitario: unitarioMostrado.toFixed(2),
      subtotal: money(unitarioMostrado.times(piezas)),
    },
  ];

  if (!prorratear && costos.fijos.total.gt(0)) {
    const precioOperacion = round2(costos.fijos.total.times(factor));
    filas.push({
      concepto: "Diseño, envío e instalación",
      cantidad: "1",
      unitario: precioOperacion.toFixed(2),
      subtotal: precioOperacion.toFixed(2),
    });
  }

  const descuento = d(entrada.ajustes.descuentoDecisionRapida?.monto ?? 0);
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

  const escenarios = p.escenariosMargen.map((escenario) => {
    const factorEscenario = factorPrecio(d(escenario), pctError, entrada.ajustes.aplicaMargenError);
    const base = prorratear ? costos.variable.plus(costos.fijos.total) : costos.variable;
    const unitarioEscenario = round2(base.times(factorEscenario).div(piezas));
    const operacionAparte = prorratear ? CERO : round2(costos.fijos.total.times(factorEscenario));
    return {
      margen: d(escenario).toString(),
      unitario: unitarioEscenario.toFixed(2),
      subtotal: money(unitarioEscenario.times(piezas).plus(operacionAparte)),
    };
  });

  return {
    clave,
    etiqueta,
    desglose: costos.desglose,
    unitarioCalculado: unitarioCalculado.toDecimalPlaces(4).toString(),
    unitario: unitarioMostrado.toFixed(2),
    filas,
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

function calcularReventa(entrada: EntradaCotizacion, snapshot: Snapshot, alertas: Alerta[]): ReventaResultado {
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
