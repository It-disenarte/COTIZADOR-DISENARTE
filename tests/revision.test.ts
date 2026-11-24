import { describe, expect, it } from "vitest";
import { PASO } from "@/lib/cotizador/pasos";
import { idFila, revisarCaptura } from "@/lib/cotizador/revision";
import { calcular, type EntradaCotizacion, ErrorMotor, type EntradaNormalizada, type Snapshot } from "@/lib/motor";
import { problemaDeEntrada } from "@/lib/validacion/cotizacion";

// Cuando algo falta, el asistente dice qué es y marca la casilla exacta: aquí se prueba que cada caso apunte a la
// casilla correcta.

const VINIL = "11111111-1111-4111-8111-111111111111";
const insumoPorM2 = { insumoId: VINIL, modo: "por_m2" as const, cantidad: "1" };

const fila = (extra: Partial<EntradaNormalizada["levantamiento"]["filas"][number]> = {}) => ({
  id: "f1",
  concepto: "Letrero",
  anchoM: "2",
  altoM: "1",
  cantidades: ["3"],
  ...extra,
});

function borrador(
  filas = [fila()],
  materiales: Record<string, unknown[]> = { f1: [insumoPorM2] },
  datos: { titulo?: string; contacto?: string } = {},
) {
  const entrada = {
    levantamiento: { areas: ["Cantidad"], filas },
    opciones: [{ id: "o1", nombre: "Opción 1", materiales }],
  } as unknown as EntradaNormalizada;
  return { titulo: datos.titulo ?? "Proyecto", cliente: { nombreContacto: datos.contacto ?? "Ana" }, entrada };
}

/** El resto de la entrada, con todo en cero: lo que no interesa en estas pruebas. */
const RESTO = {
  incluyeEnvio: false,
  operacion: {
    trabajoEnInstalacionesDisenarte: true,
    diasDiseno: "0",
    produccion: { personas: "0", dias: "0" },
    instalacion: { incluye: false, personas: "0", dias: "0" },
    viaticos: { tipo: "local", personas: "0", dias: "0" },
    hospedaje: { incluye: false, noches: "0", costoNoche: "0" },
    traslado: { kmPorTrayecto: "0", modo: "diario", casetasPorViaje: "0" },
    extras: [] as unknown[],
  },
  presentacion: { operacionProrrateada: true, modalidades: "solo_una" },
  ajustes: { aplicaMargenError: true, aplicaConsumibles: false },
  reventa: [] as unknown[],
};

describe("Revisión de lo capturado: qué falta y en qué casilla", () => {
  it("todo completo: no falta nada", () => {
    expect(revisarCaptura(borrador())).toBeNull();
  });

  it("sin título o sin contacto, marca esa casilla del paso Datos", () => {
    expect(revisarCaptura(borrador(undefined, undefined, { titulo: " " }))).toMatchObject({ paso: PASO.datos, campo: "titulo" });
    expect(revisarCaptura(borrador(undefined, undefined, { contacto: "" }))).toMatchObject({ paso: PASO.datos, campo: "contacto" });
  });

  it("un concepto con nombre pero sin cantidad marca la cantidad (antes se ignoraba en silencio)", () => {
    const r = revisarCaptura(borrador([fila({ cantidades: ["0"] })]));
    expect(r).toMatchObject({ paso: PASO.levantamiento, campo: idFila("f1", "cantidad") });
    expect(r?.mensaje).toMatch(/cantidad de “Letrero”/);
  });

  it("un insumo por m² sin ancho o sin alto marca esa medida (costaría cero)", () => {
    expect(revisarCaptura(borrador([fila({ anchoM: "0" })]))?.campo).toBe(idFila("f1", "ancho"));
    expect(revisarCaptura(borrador([fila({ altoM: "" })]))?.campo).toBe(idFila("f1", "alto"));
  });

  it("si el material se cobra por pieza, las medidas en 0 son correctas", () => {
    const porPieza = { insumoId: VINIL, modo: "por_pieza" as const, cantidad: "1" };
    expect(revisarCaptura(borrador([fila({ anchoM: "0", altoM: "0" })], { f1: [porPieza] }))).toBeNull();
  });

  it("un concepto sin insumos marca su celda de insumos", () => {
    expect(revisarCaptura(borrador([fila()], { f1: [] }))?.campo).toBe(idFila("f1", "insumos"));
  });

  it("un concepto con datos pero sin nombre marca el nombre", () => {
    expect(revisarCaptura(borrador([fila({ concepto: "" })]))?.campo).toBe(idFila("f1", "concepto"));
  });

  it("señala la fila que falla, no la primera", () => {
    const filas = [fila(), fila({ id: "f2", concepto: "Rótulo", cantidades: ["0"] })];
    expect(revisarCaptura(borrador(filas, { f1: [insumoPorM2], f2: [insumoPorM2] }))?.campo).toBe(idFila("f2", "cantidad"));
  });

  it("las filas totalmente en blanco no cuentan (venta de pura reventa)", () => {
    const vacia = fila({ concepto: "", anchoM: "0", altoM: "0", cantidades: [""] });
    expect(revisarCaptura(borrador([vacia], {}))).toBeNull();
  });
});

describe("El esquema general también señala la casilla", () => {
  const completa = { ...borrador().entrada, ...RESTO } as Record<string, unknown>;

  it("un artículo de reventa sin nombre marca su casilla", () => {
    const problema = problemaDeEntrada({
      ...completa,
      reventa: [{ nombre: "", precioReferencia: "10", cantidad: "1", verificado: false }],
    });
    expect(problema).toMatchObject({ paso: PASO.reventa, campo: "reventa-nombre-0" });
  });

  it("una opción sin nombre marca el nombre de esa opción", () => {
    const opciones = [{ id: "o1", nombre: "", materiales: { f1: [insumoPorM2] } }];
    expect(problemaDeEntrada({ ...completa, opciones })).toMatchObject({ campo: "nombre-o1" });
  });

  it("un extra sin concepto marca su casilla", () => {
    const operacion = { ...RESTO.operacion, extras: [{ concepto: "", monto: "5", escala: "una_vez" }] };
    expect(problemaDeEntrada({ ...completa, operacion })).toMatchObject({ paso: PASO.operacion, campo: "extra-concepto-0" });
  });

  it("sin ningún concepto lleno, marca el primero de la tabla", () => {
    const vacia = fila({ id: "f9", concepto: "", anchoM: "0", altoM: "0", cantidades: [""] });
    const entrada = { ...completa, levantamiento: { areas: ["Cantidad"], filas: [vacia] } };
    expect(problemaDeEntrada(entrada)).toMatchObject({ campo: "fila-f9-concepto" });
  });
});

describe("Los errores del motor dicen de qué concepto vienen", () => {
  it("un insumo sin costo marca la celda de insumos de su concepto", () => {
    const snapshot = {
      insumos: {
        [VINIL]: { id: VINIL, nombre: "Vinil", unidadCosto: "m2", costo: null, anchoUtilM: null, areaLaminaM2: null, requiereRevision: true },
      },
      recetas: {},
      parametros: {
        margen: "0.30",
        pctMargenError: "0.10",
        pctConsumibles: "0.05",
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
    } as unknown as Snapshot;
    const entrada = { ...borrador().entrada, ...RESTO } as unknown as EntradaCotizacion;
    try {
      calcular(entrada, snapshot);
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(ErrorMotor);
      expect((error as ErrorMotor).codigo).toBe("SIN_COSTO");
      expect((error as ErrorMotor).contexto?.filaId).toBe("f1");
    }
  });
});
