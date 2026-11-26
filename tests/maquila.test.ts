import { describe, expect, it } from "vitest";
import { agregarOpcionCopiando } from "@/lib/cotizador/estado";
import { PASO } from "@/lib/cotizador/pasos";
import { idFila, revisarCaptura } from "@/lib/cotizador/revision";
import { calcular, type EntradaNormalizada, type Snapshot } from "@/lib/motor";
import { EntradaCotizacion as EsquemaEntrada } from "@/lib/validacion/cotizacion";

// Maquila: un producto armado con lo que nos hacen fuera más nuestros insumos y horas. Cada parte lleva su regla
// (maquila con el recargo de reventa; lo nuestro con la fórmula del PNO) y el cliente solo ve el nombre.

const PLACA = "11111111-1111-4111-8111-111111111111";

const snapshot: Snapshot = {
  insumos: {
    [PLACA]: { id: PLACA, nombre: "Placa para sublimar", unidadCosto: "pieza", costo: "100", anchoUtilM: null, areaLaminaM2: null, requiereRevision: false },
  },
  recetas: {},
  parametros: {
    margen: "0.30",
    pctMargenError: "0.10",
    pctConsumibles: "0.05",
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

const producto = (cambios: Partial<NonNullable<EntradaNormalizada["opciones"][number]["maquilas"]>[number]> = {}) => ({
  id: "m1",
  nombre: "Reconocimiento",
  cantidad: "2",
  anchoM: "0",
  altoM: "0",
  horas: "0",
  partes: [{ concepto: "Base de madera", proveedor: "Carpintero", costo: "200" }],
  ...cambios,
});

function entrada(maquilas = [producto()], conInsumo = true): EntradaNormalizada {
  return {
    // La fila en blanco con la que empieza toda cotización.
    levantamiento: { areas: ["Cantidad"], filas: [{ id: "f1", opcionId: "o1", concepto: "", anchoM: "0", altoM: "0", cantidades: [""] }] },
    opciones: [
      { id: "o1", nombre: "Opción 1", materiales: conInsumo ? { m1: [{ insumoId: PLACA, modo: "por_pieza", cantidad: "1" }] } : {}, maquilas },
    ],
    incluyeEnvio: false,
    operacion: {
      trabajoEnInstalacionesDisenarte: false,
      diasDiseno: "0",
      produccion: { personas: "0", dias: "0" },
      instalacion: { incluye: false, personas: "0", dias: "0" },
      viaticos: { tipo: "local", personas: "0", dias: "0" },
      hospedaje: { incluye: false, noches: "0", costoNoche: "0" },
      traslado: { kmPorTrayecto: "0", modo: "diario", casetasPorViaje: "0" },
      extras: [],
    },
    presentacion: { operacionProrrateada: true, modalidades: "solo_una" },
    ajustes: { aplicaMargenError: true, aplicaConsumibles: false },
    reventa: [],
  };
}

const variante = (e: EntradaNormalizada) => calcular(e, snapshot).opciones[0].variantes[0];

describe("Producto de maquila: precio", () => {
  it("la maquila lleva 35% y nuestros insumos la fórmula del PNO", () => {
    const v = variante(entrada());
    // Por pieza: 200 × 1.35 = 270; 100 × 1.10 ÷ 0.70 = 157.14.
    expect(v.filas).toEqual([{ concepto: "Reconocimiento", cantidad: "2", unitario: "427.14", subtotal: "854.28", descripcion: [] }]);
    expect(v.desglose).toMatchObject({ maquila: "400.00", materiales: "200.00", costoTotal: "600.00" });
    // La utilidad que se comprueba contra el 30% es la de lo nuestro; el total sale menor por la maquila.
    expect(Number(v.margenPropio)).toBeGreaterThanOrEqual(0.3);
    expect(Number(v.margenReal)).toBeLessThan(0.3);
  });

  it("puede llevar varias maquilas y horas de trabajo nuestro", () => {
    const v = variante(
      entrada([
        producto({
          horas: "2",
          partes: [
            { concepto: "Base", proveedor: "Carpintero", costo: "200" },
            { concepto: "Cristal", proveedor: "Vidriero", costo: "100" },
          ],
        }),
      ]),
    );
    // Por pieza: maquila 300 × 1.35 = 405; lo nuestro (100 de placa + 87.50 de una hora) × 1.10 ÷ 0.70 = 294.64.
    expect(v.filas[0].unitario).toBe("699.64");
    expect(v.desglose.manoObraMaquila).toBe("175.00");
  });

  it("sin insumos nuestros es solo la maquila con su recargo, y no hay 30% que comprobar", () => {
    const v = variante(entrada([producto()], false));
    expect(v.filas[0].unitario).toBe("270.00");
    expect(v.margenPropio).toBeNull();
    expect(v.alertas).toEqual([]);
  });

  it("subir el precio final se reparte igual que con los conceptos", () => {
    const e = entrada();
    e.opciones[0].precioObjetivo = "1000";
    const v = variante(e);
    expect(v.subtotal).toBe("1000.00");
    expect(Number(v.margenPropio)).toBeGreaterThan(Number(variante(entrada()).margenPropio));
  });

  it("al cliente no le llega qué se maquila, quién ni los insumos", () => {
    const resultado = calcular(entrada(), snapshot);
    const publico = JSON.stringify([resultado.opciones[0].variantes[0].filas, resultado.levantamiento]);
    for (const interno of ["Carpintero", "Base de madera", "Placa para sublimar"]) expect(publico).not.toContain(interno);
    expect(resultado.levantamiento.filas.map((f) => f.concepto)).toContain("Reconocimiento");
  });

  it("cada opción tiene sus propios productos, también la que se agrega como copia", () => {
    const e = agregarOpcionCopiando(entrada(), entrada().opciones[0], { id: "o2", nombre: "Opción 2", materiales: {} });
    const [copia] = e.opciones[1].maquilas!;
    expect(copia.id).not.toBe("m1");
    expect(e.opciones[1].materiales[copia.id]).toHaveLength(1);
    e.opciones[1].maquilas![0].partes[0].costo = "300";
    expect(e.opciones[0].maquilas![0].partes[0].costo).toBe("200");
  });
});

describe("Producto de maquila: captura", () => {
  const revisar = (e: EntradaNormalizada) => revisarCaptura({ titulo: "T", cliente: { nombreContacto: "C" }, entrada: e });

  it("completo se acepta y se guarda, aunque la tabla del levantamiento esté vacía", () => {
    const e = entrada();
    expect(revisar(e)).toBeNull();
    const revisada = EsquemaEntrada.parse(e);
    expect(revisada.levantamiento.filas).toEqual([]);
    expect(revisada.opciones[0]).toHaveProperty("maquilas.0.partes.0.concepto", "Base de madera");
  });

  it("dice qué falta y en qué casilla", () => {
    expect(revisar(entrada([producto({ nombre: "" })]))).toMatchObject({ paso: PASO.maquila, campo: idFila("m1", "concepto") });
    expect(revisar(entrada([producto({ partes: [{ concepto: "Base", costo: "" }] })]))).toMatchObject({
      paso: PASO.maquila,
      campo: idFila("m1", "maquila"),
    });
  });
});
