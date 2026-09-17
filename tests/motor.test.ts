import { describe, expect, it } from "vitest";
import { calcular, ErrorMotor, type EntradaCotizacion, type Snapshot } from "@/lib/motor";

// Catálogo mínimo con los precios de operación de la ficha.
const INSUMOS = {
  vinil: {
    id: "vinil",
    nombre: "Corte de vinil",
    unidadCosto: "m2" as const,
    costo: "400.0000",
    anchoUtilM: null,
    areaLaminaM2: null,
    requiereRevision: false,
  },
  aplicacion: {
    id: "aplicacion",
    nombre: "Insumos de aplicación en rotulación",
    unidadCosto: "pieza" as const,
    costo: "200.0000",
    anchoUtilM: null,
    areaLaminaM2: null,
    requiereRevision: false,
  },
  rollo: {
    id: "rollo",
    nombre: "Vinil de corte 1.22",
    unidadCosto: "ml" as const,
    costo: "106.1500",
    anchoUtilM: "1.2200",
    areaLaminaM2: null,
    requiereRevision: false,
  },
  lamina: {
    id: "lamina",
    nombre: "Trovicel 3 mm",
    unidadCosto: "lamina" as const,
    costo: "228.7900",
    anchoUtilM: null,
    areaLaminaM2: "2.9768",
    requiereRevision: false,
  },
  sinCosto: {
    id: "sinCosto",
    nombre: "Estireno cal. 40 blanco",
    unidadCosto: null,
    costo: null,
    anchoUtilM: null,
    areaLaminaM2: null,
    requiereRevision: true,
  },
};

const PARAMETROS = {
  margen: "0.30",
  pctMargenError: "0.10",
  pctConsumibles: "0.05",
  tarifaInstaladorDia: "700",
  tarifaDisenoDia: "700",
  viaticosLocalDia: "250",
  viaticosForaneoDia: "500",
  rendimientoKmL: "10",
  precioGasolinaLitro: "24.50",
  pctReventa: "0.35",
  iva: "0.16",
  alertaMargenMinimo: "0.25",
  alertaDesvioPrecio: "0.15",
  escenariosMargen: ["0.30", "0.35", "0.40"],
};

function snapshot(recetas: Snapshot["recetas"], parametros: Partial<Snapshot["parametros"]> = {}): Snapshot {
  return { insumos: INSUMOS, recetas, parametros: { ...PARAMETROS, ...parametros } };
}

const RECETA_ROTULACION: Snapshot["recetas"] = {
  rotulacion: {
    id: "rotulacion",
    nombre: "Corte de vinil (rotulación)",
    familia: "rotulacion",
    descripcionPdf: "Rotulación con vinil de corte.",
    pctMerma: "0",
    componentes: [
      { insumoId: "vinil", modo: "por_m2", cantidad: "1" },
      { insumoId: "aplicacion", modo: "por_pieza", cantidad: "1" },
    ],
  },
};

/** Entrada base del caso del Versa: 12 m² por unidad, trabajo en instalaciones de Diseñarte. */
function entradaVersa(unidades: number): EntradaCotizacion {
  return {
    levantamiento: { areas: ["Flotilla"], filas: [{ concepto: "Rotulación Nissan Versa", anchoM: "4", altoM: "3", cantidades: [unidades] }] },
    opciones: [{ recetaId: "rotulacion" }],
    incluyeEnvio: false,
    operacion: {
      trabajoEnInstalacionesDisenarte: true,
      diasDiseno: 1,
      disenoMontoManual: "1300",
      produccion: { personas: 0, dias: 0 },
      instalacion: { incluye: true, personas: 2, dias: 1, escalaPorPieza: true },
      viaticos: { tipo: "local", personas: 2, dias: 1 },
      hospedaje: { incluye: false, noches: 0, costoNoche: 0 },
      traslado: { kmPorTrayecto: 0, modo: "una_vez", casetasPorViaje: 0 },
      extras: [],
    },
    presentacion: { operacionProrrateada: true, modalidades: "solo_una" },
    ajustes: { aplicaMargenError: false, aplicaConsumibles: false, margen: "0.35" },
    reventa: [],
  };
}

describe("Caso 1 — Nissan Versa, 1 unidad", () => {
  const resultado = calcular(entradaVersa(1), snapshot(RECETA_ROTULACION));
  const v = resultado.opciones[0].variantes[0];

  it("levanta 1 pieza y 12 m²", () => {
    expect(resultado.levantamiento.piezas).toBe("1");
    expect(resultado.levantamiento.areaM2).toBe("12.00");
  });

  it("suma el costo directo de $7,700: vinil $4,800 + instalación $1,400 + insumos $200 + diseño $1,300", () => {
    // El vinil y los insumos de aplicación son componentes de la receta: $4,800 + $200.
    expect(v.desglose.materiales).toBe("5000.00");
    expect(v.desglose.instalacionPorPieza).toBe("1400.00");
    expect(v.desglose.variable).toBe("6400.00");
    expect(v.desglose.diseno).toBe("1300.00");
    expect(v.desglose.fijo).toBe("1300.00");
    expect(v.desglose.costoTotal).toBe("7700.00");
  });

  it("aplica el margen sobre venta: $7,700 ÷ 0.65 = $11,846.15", () => {
    expect(v.unitario).toBe("11846.15");
    expect(v.subtotal).toBe("11846.15");
  });

  it("calcula IVA y total desde el subtotal ya redondeado", () => {
    expect(v.total).toBe("13741.53");
    expect(v.iva).toBe("1895.38");
    // La ficha documenta $13,741.54 porque calcula el IVA sobre el precio sin redondear;
    // aquí se privilegia que la tabla del PDF cuadre al multiplicar.
  });

  it("muestra los tres escenarios de margen", () => {
    expect(v.escenarios.map((e) => e.unitario)).toEqual(["11000.00", "11846.15", "12833.33"]);
  });
});

describe("Caso 2 — Versa a 25 unidades", () => {
  const resultado = calcular(entradaVersa(25), snapshot(RECETA_ROTULACION));
  const v = resultado.opciones[0].variantes[0];

  it("escala materiales, instalación e insumos por unidad y el diseño una sola vez", () => {
    expect(resultado.levantamiento.areaM2).toBe("300.00");
    expect(v.desglose.variable).toBe("160000.00"); // 6,400 × 25
    expect(v.desglose.fijo).toBe("1300.00");
  });

  it("da el unitario de $9,926.15", () => {
    expect(v.unitario).toBe("9926.15");
    expect(v.subtotal).toBe("248153.75"); // 9,926.15 × 25, desde el unitario redondeado
  });
});

describe("Caso 3 — regla del margen", () => {
  it("$10,000 de costo con 30% de margen da $14,285.71, no $13,000", () => {
    const entrada = entradaVersa(1);
    entrada.operacion.instalacion.incluye = false;
    entrada.operacion.disenoMontoManual = "0";
    entrada.ajustes.margen = "0.30";
    // 25 m² × $400 = $10,000 de costo directo.
    entrada.levantamiento.filas = [{ concepto: "Costo de prueba", anchoM: "5", altoM: "5", cantidades: [1] }];

    const receta: Snapshot["recetas"] = {
      rotulacion: { ...RECETA_ROTULACION.rotulacion, componentes: [{ insumoId: "vinil", modo: "por_m2", cantidad: "1" }] },
    };
    const v = calcular(entrada, snapshot(receta)).opciones[0].variantes[0];

    expect(v.desglose.costoTotal).toBe("10000.00");
    expect(v.unitario).toBe("14285.71");
  });
});

describe("Caso 4 — redondeo de la tabla", () => {
  it("169 piezas con unitario $134.8321 dan subtotal $22,786.27", () => {
    // Costo tal que el unitario calculado sea 134.8321: 169 × 134.8321 × 0.65 = 14,811.30...
    const entrada = entradaVersa(169);
    entrada.operacion.instalacion.incluye = false;
    entrada.operacion.disenoMontoManual = "14811.3055325";
    entrada.levantamiento.filas = [{ concepto: "Señalética", anchoM: "0", altoM: "0", cantidades: [169] }];

    const receta: Snapshot["recetas"] = {
      rotulacion: { ...RECETA_ROTULACION.rotulacion, componentes: [{ insumoId: "vinil", modo: "por_m2", cantidad: "1" }] },
    };
    const v = calcular(entrada, snapshot(receta)).opciones[0].variantes[0];

    expect(v.unitarioCalculado).toBe("134.8321");
    expect(v.unitario).toBe("134.83");
    expect(v.subtotal).toBe("22786.27");
    expect(Number(v.subtotal)).toBe(134.83 * 169);
  });
});

describe("Operación: prorrateada o aparte, y modalidades A y B", () => {
  function entradaConInstalacionEnSitio(): EntradaCotizacion {
    const entrada = entradaVersa(10);
    entrada.operacion = {
      ...entrada.operacion,
      trabajoEnInstalacionesDisenarte: false,
      disenoMontoManual: null,
      diasDiseno: 1,
      instalacion: { incluye: true, personas: 2, dias: 2, escalaPorPieza: false },
      viaticos: { tipo: "foraneo", personas: 2, dias: 2 },
      traslado: { kmPorTrayecto: "58.6", modo: "diario", viajesRedondos: 2, rendimientoKmL: "10", casetasPorViaje: "120" },
      hospedaje: { incluye: true, noches: 1, costoNoche: "900" },
    };
    entrada.ajustes = { aplicaMargenError: true, aplicaConsumibles: true, margen: "0.30" };
    return entrada;
  }

  it("calcula viáticos, gasolina, casetas y hospedaje de la salida a planta", () => {
    const v = calcular(entradaConInstalacionEnSitio(), snapshot(RECETA_ROTULACION)).opciones[0].variantes[0];
    expect(v.desglose.instalacion).toBe("2800.00"); // 2 personas × 2 días × $700
    expect(v.desglose.viaticos).toBe("2000.00"); // 2 × 2 × $500
    expect(v.desglose.gasolina).toBe("574.28"); // 58.6 × 2 × 2 viajes ÷ 10 × $24.50
    expect(v.desglose.casetas).toBe("240.00");
    expect(v.desglose.hospedaje).toBe("900.00");
    expect(v.desglose.diseno).toBe("700.00");
  });

  it("con operación aparte agrega la fila de diseño, envío e instalación", () => {
    const entrada = entradaConInstalacionEnSitio();
    entrada.presentacion.operacionProrrateada = false;
    const v = calcular(entrada, snapshot(RECETA_ROTULACION)).opciones[0].variantes[0];

    expect(v.filas).toHaveLength(2);
    expect(v.filas[1].concepto).toBe("Diseño, envío e instalación");
    expect(Number(v.filas[1].subtotal)).toBeGreaterThan(0);
  });

  it("A no lleva instalación ni salida a campo; B sí, y cuesta más", () => {
    const entrada = entradaConInstalacionEnSitio();
    entrada.presentacion.modalidades = "A_y_B";
    const variantes = calcular(entrada, snapshot(RECETA_ROTULACION)).opciones[0].variantes;

    const [a, b] = variantes;
    expect(a.clave).toBe("A");
    expect(a.desglose.instalacion).toBe("0.00");
    expect(a.desglose.viaticos).toBe("0.00");
    expect(a.desglose.gasolina).toBe("0.00");
    expect(b.desglose.instalacion).toBe("2800.00");
    expect(Number(b.subtotal)).toBeGreaterThan(Number(a.subtotal));
  });
});

describe("Conversiones de unidad de compra", () => {
  it("convierte metro lineal a m² con el ancho útil y lámina con su área", () => {
    const entrada = entradaVersa(1);
    entrada.operacion.instalacion.incluye = false;
    entrada.operacion.disenoMontoManual = "0";
    entrada.levantamiento.filas = [{ concepto: "Letrero", anchoM: "1", altoM: "1", cantidades: [1] }];

    const receta: Snapshot["recetas"] = {
      rotulacion: {
        ...RECETA_ROTULACION.rotulacion,
        componentes: [
          { insumoId: "rollo", modo: "por_m2", cantidad: "1" },
          { insumoId: "lamina", modo: "por_m2", cantidad: "1" },
        ],
      },
    };
    const v = calcular(entrada, snapshot(receta)).opciones[0].variantes[0];

    // 106.15 ÷ 1.22 = 87.0082 y 228.79 ÷ 2.9768 = 76.8577
    expect(v.desglose.materiales).toBe("163.87");
  });

  it("aplica la merma de la receta sobre los materiales por m²", () => {
    const entrada = entradaVersa(1);
    entrada.operacion.instalacion.incluye = false;
    entrada.operacion.disenoMontoManual = "0";
    entrada.levantamiento.filas = [{ concepto: "Letrero", anchoM: "1", altoM: "1", cantidades: [1] }];

    const receta: Snapshot["recetas"] = {
      rotulacion: {
        ...RECETA_ROTULACION.rotulacion,
        pctMerma: "0.15",
        componentes: [{ insumoId: "vinil", modo: "por_m2", cantidad: "1" }],
      },
    };
    const v = calcular(entrada, snapshot(receta)).opciones[0].variantes[0];
    expect(v.desglose.materiales).toBe("460.00"); // 400 × 1.15
  });

  it("falla con mensaje claro si falta el costo de un insumo", () => {
    const entrada = entradaVersa(1);
    const receta: Snapshot["recetas"] = {
      rotulacion: { ...RECETA_ROTULACION.rotulacion, componentes: [{ insumoId: "sinCosto", modo: "por_m2", cantidad: "1" }] },
    };
    expect(() => calcular(entrada, snapshot(receta))).toThrow(ErrorMotor);
    expect(() => calcular(entrada, snapshot(receta))).toThrow(/Falta capturar el costo/);
  });

  it("falla si se necesita gasolina y el parámetro está vacío", () => {
    const entrada = entradaVersa(1);
    entrada.operacion.trabajoEnInstalacionesDisenarte = false;
    entrada.operacion.traslado = { kmPorTrayecto: "58.6", modo: "una_vez", casetasPorViaje: "0" };
    expect(() => calcular(entrada, snapshot(RECETA_ROTULACION, { precioGasolinaLitro: null }))).toThrow(/precio de la gasolina/);
  });
});

describe("Consumibles, margen de error y descuento", () => {
  it("consumibles son 5% de materiales y el margen de error 10% sobre todo el costo", () => {
    const entrada = entradaVersa(1);
    entrada.ajustes = { aplicaMargenError: true, aplicaConsumibles: true, margen: "0.30" };
    const v = calcular(entrada, snapshot(RECETA_ROTULACION)).opciones[0].variantes[0];

    expect(v.desglose.consumibles).toBe("250.00"); // 5,000 × 5%
    // (5,000 + 250 + 1,400 + 1,300) × 1.10 ÷ 0.70
    expect(v.unitario).toBe("12492.86");
  });

  it("el descuento por decisión rápida baja el subtotal y el margen real", () => {
    const entrada = entradaVersa(1);
    entrada.ajustes.descuentoDecisionRapida = { monto: "1000", nota: "Cierra hoy" };
    const v = calcular(entrada, snapshot(RECETA_ROTULACION)).opciones[0].variantes[0];

    expect(v.subtotal).toBe("10846.15");
    expect(Number(v.margenReal)).toBeCloseTo((10846.15 - 7700) / 10846.15, 4);
  });
});

describe("Campos vacíos del asistente usan los parámetros de la casa", () => {
  it("margen vacío toma el 30% del parámetro, no cero", () => {
    const entrada = entradaVersa(1);
    entrada.ajustes = { aplicaMargenError: false, aplicaConsumibles: false, margen: "" };
    const v = calcular(entrada, snapshot(RECETA_ROTULACION)).opciones[0].variantes[0];
    expect(v.unitario).toBe("11000.00"); // 7,700 ÷ 0.70
  });

  it("rendimiento y viajes vacíos toman el parámetro y los días de instalación", () => {
    const entrada = entradaVersa(1);
    entrada.operacion.trabajoEnInstalacionesDisenarte = false;
    entrada.operacion.instalacion = { incluye: true, personas: 2, dias: 2, escalaPorPieza: false };
    entrada.operacion.traslado = { kmPorTrayecto: "50", modo: "diario", viajesRedondos: "", rendimientoKmL: "", casetasPorViaje: "0" };
    const v = calcular(entrada, snapshot(RECETA_ROTULACION)).opciones[0].variantes[0];
    // 50 km × 2 × 2 viajes ÷ 10 km/L × $24.50
    expect(v.desglose.gasolina).toBe("490.00");
  });

  it("monto de diseño vacío usa días × tarifa", () => {
    const entrada = entradaVersa(1);
    entrada.operacion.disenoMontoManual = "";
    entrada.operacion.diasDiseno = 2;
    const v = calcular(entrada, snapshot(RECETA_ROTULACION)).opciones[0].variantes[0];
    expect(v.desglose.diseno).toBe("1400.00");
  });
});

describe("Reventa y alertas", () => {
  it("aplica 35% al precio de referencia y no le suma margen ni margen de error", () => {
    const entrada = entradaVersa(1);
    entrada.reventa = [
      { nombre: "Extintor PQS", precioReferencia: "890", cantidad: 2, link: "https://ejemplo.mx", verificado: true },
      { nombre: "Botiquín", precioReferencia: "650", cantidad: 1, verificado: false },
    ];
    const resultado = calcular(entrada, snapshot(RECETA_ROTULACION));

    expect(resultado.reventa.items[0].unitario).toBe("1201.50"); // 890 × 1.35
    expect(resultado.reventa.items[0].subtotal).toBe("2403.00");
    expect(resultado.reventa.subtotal).toBe("3280.50");
    expect(resultado.alertas.some((a) => a.codigo === "REVENTA_SIN_VERIFICAR")).toBe(true);
  });

  it("avisa cuando el unitario manual se desvía más del 15% del calculado", () => {
    const entrada = entradaVersa(1);
    entrada.opciones = [{ recetaId: "rotulacion", precioUnitarioManual: "9000" }];
    const v = calcular(entrada, snapshot(RECETA_ROTULACION)).opciones[0].variantes[0];

    expect(v.unitario).toBe("9000.00");
    expect(v.alertas.some((a) => a.codigo === "DESVIO_PRECIO")).toBe(true);
    expect(v.alertas.some((a) => a.codigo === "MARGEN_BAJO")).toBe(true);
  });

  it("avisa de instalación foránea sin traslado y de insumos por revisar", () => {
    const entrada = entradaVersa(1);
    entrada.operacion.trabajoEnInstalacionesDisenarte = false;
    entrada.operacion.viaticos = { tipo: "foraneo", personas: 2, dias: 2 };
    entrada.operacion.traslado = { kmPorTrayecto: 0, modo: "diario", casetasPorViaje: 0 };

    const receta: Snapshot["recetas"] = {
      rotulacion: {
        ...RECETA_ROTULACION.rotulacion,
        componentes: [{ insumoId: "vinil", modo: "por_m2", cantidad: "1" }],
      },
    };
    const conRevision: Snapshot = snapshot(receta);
    conRevision.insumos = { ...INSUMOS, vinil: { ...INSUMOS.vinil, requiereRevision: true } };

    const alertas = calcular(entrada, conRevision).alertas.map((a) => a.codigo);
    expect(alertas).toContain("TRASLADO_EN_CERO");
    expect(alertas).toContain("SIN_HOSPEDAJE");
    expect(alertas).toContain("INSUMO_POR_REVISAR");
  });

  it("avisa si el precio de la gasolina tiene más de 7 días", () => {
    const entrada = entradaVersa(1);
    const hace10Dias = new Date(Date.now() - 10 * 86_400_000);
    const alertas = calcular(entrada, snapshot(RECETA_ROTULACION, { precioGasolinaActualizadoEn: hace10Dias })).alertas;
    expect(alertas.some((a) => a.codigo === "GASOLINA_DESACTUALIZADA")).toBe(true);
  });
});
