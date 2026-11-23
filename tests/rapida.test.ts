import { describe, expect, it } from "vitest";
import { calcular, type EntradaCotizacion, type Snapshot } from "@/lib/motor";
import { EntradaBorrador, EntradaCotizacion as EsquemaEntrada, problemaDeEntrada } from "@/lib/validacion/cotizacion";

// Cotización rápida: hasta 3 conceptos y una sola variable, el tiempo de desarrollo en horas.

const VINIL = "11111111-1111-4111-8111-111111111111";

const snapshot: Snapshot = {
  insumos: {
    [VINIL]: {
      id: VINIL,
      nombre: "Vinil",
      unidadCosto: "m2",
      costo: "400.0000",
      anchoUtilM: null,
      areaLaminaM2: null,
      requiereRevision: false,
    },
  },
  recetas: {},
  parametros: {
    margen: "0.30",
    pctMargenError: "0.10",
    pctConsumibles: "0.05",
    pctIndirectos: "0.05",
    tarifaHoraDesarrollo: "87.5",
    tarifaInstaladorDia: "700",
    tarifaDisenoDia: "700",
    viaticosLocalDia: "250",
    viaticosForaneoDia: "500",
    rendimientoKmL: "12",
    precioGasolinaLitro: "30",
    pctReventa: "0.35",
    iva: "0.16",
    alertaMargenMinimo: "0.25",
    alertaDesvioPrecio: "0.15",
    escenariosMargen: ["0.30"],
  },
};

const concepto = (id: string, nombre: string) => ({ id, concepto: nombre, anchoM: "2", altoM: "1", cantidades: ["1"] });
const insumos = { vinil: [{ insumoId: VINIL, modo: "por_m2" as const, cantidad: "1" }] };

/** Operación con basura a propósito: la cotización rápida debe ignorarla. */
function entradaRapida(horas: string, filas = [concepto("a", "Letrero")]): EntradaCotizacion {
  return {
    rapida: { horasDesarrollo: horas },
    levantamiento: { areas: ["Cantidad"], filas },
    opciones: [
      {
        id: "o1",
        nombre: "Opción 1",
        materiales: Object.fromEntries(filas.map((f) => [f.id, insumos.vinil])),
      },
    ],
    incluyeEnvio: true,
    operacion: {
      trabajoEnInstalacionesDisenarte: false,
      diasDiseno: 3,
      produccion: { personas: 2, dias: 2 },
      instalacion: { incluye: true, personas: 2, dias: 2 },
      viaticos: { tipo: "foraneo", personas: 2, dias: 2 },
      hospedaje: { incluye: true, noches: 2, costoNoche: 800 },
      traslado: { kmPorTrayecto: 100, modo: "diario", casetasPorViaje: 200 },
      extras: [{ concepto: "Extra", monto: 500, escala: "una_vez" }],
    },
    presentacion: { operacionProrrateada: false, modalidades: "A_y_B" },
    ajustes: { aplicaMargenError: false, aplicaConsumibles: true, margen: "0.5" },
    reventa: [],
  };
}

describe("Cotización rápida: precio", () => {
  const v = calcular(entradaRapida("8"), snapshot).opciones[0].variantes[0];

  it("costo directo (insumos + horas × tarifa) × 1.10 × 1.05 ÷ 0.70", () => {
    // Insumos: 2 m² × $400 = $800. Desarrollo: 8 h × $87.50 = $700. Directo $1,500.
    expect(v.desglose.materiales).toBe("800.00");
    expect(v.desglose.diseno).toBe("700.00");
    expect(v.desglose.costoTotal).toBe("1500.00");
    expect(v.subtotal).toBe("2475.00");
    expect(v.total).toBe("2871.00");
  });

  it("ignora instalación, viáticos, traslado, extras, consumibles y el margen capturado", () => {
    expect(v.desglose.instalacion).toBe("0.00");
    expect(v.desglose.viaticos).toBe("0.00");
    expect(v.desglose.gasolina).toBe("0.00");
    expect(v.desglose.extrasUnaVez).toBe("0.00");
    expect(v.desglose.consumibles).toBe("0.00");
  });

  it("una sola variante y el tiempo no sale como fila aparte al cliente", () => {
    const opcion = calcular(entradaRapida("8"), snapshot).opciones[0];
    expect(opcion.variantes).toHaveLength(1);
    expect(v.filas).toHaveLength(1);
    expect(v.filas[0].concepto).toBe("Letrero");
  });

  it("más horas, más precio", () => {
    const mas = calcular(entradaRapida("16"), snapshot).opciones[0].variantes[0];
    expect(Number(mas.subtotal)).toBeGreaterThan(Number(v.subtotal));
  });

  it("sin la marca rápida el cálculo no lleva indirectos (cotizaciones de siempre)", () => {
    const normal = { ...entradaRapida("8"), rapida: null };
    const resultado = calcular(
      {
        ...normal,
        operacion: { ...normal.operacion, diasDiseno: 0, produccion: { personas: 0, dias: 0 }, instalacion: { incluye: false, personas: 0, dias: 0 }, viaticos: { tipo: "local", personas: 0, dias: 0 }, hospedaje: { incluye: false, noches: 0, costoNoche: 0 }, extras: [], trabajoEnInstalacionesDisenarte: true },
        incluyeEnvio: false,
        presentacion: { operacionProrrateada: true, modalidades: "solo_una" },
        ajustes: { aplicaMargenError: true, aplicaConsumibles: false, margen: "" },
      },
      snapshot,
    ).opciones[0].variantes[0];
    // $800 × 1.10 ÷ 0.70 = $1,257.14, sin los indirectos de 5%.
    expect(resultado.subtotal).toBe("1257.14");
  });
});

describe("Cotización rápida: validación", () => {
  const cuatro = ["a", "b", "c", "d"].map((id) => concepto(id, `Concepto ${id}`));

  it("admite hasta 3 conceptos y rechaza el cuarto, también en borrador", () => {
    expect(problemaDeEntrada(entradaRapida("8", cuatro.slice(0, 3)))).toBeNull();
    expect(problemaDeEntrada(entradaRapida("8", cuatro))?.mensaje).toMatch(/máximo 3 conceptos/);
    expect(EntradaBorrador.safeParse(entradaRapida("8", cuatro)).success).toBe(false);
  });

  it("exige el tiempo de desarrollo para calcular, pero deja guardar el borrador sin él", () => {
    expect(problemaDeEntrada(entradaRapida(""))?.mensaje).toMatch(/tiempo de desarrollo/);
    expect(problemaDeEntrada(entradaRapida("0"))?.mensaje).toMatch(/tiempo de desarrollo/);
    expect(EntradaBorrador.safeParse(entradaRapida("")).success).toBe(true);
    expect(EsquemaEntrada.safeParse(entradaRapida("8")).success).toBe(true);
  });

  it("no limita las cotizaciones completas", () => {
    const completa = { ...entradaRapida("8", cuatro), rapida: null };
    expect(problemaDeEntrada(completa)).toBeNull();
  });
});
