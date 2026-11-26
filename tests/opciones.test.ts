import { describe, expect, it } from "vitest";
import { agregarOpcionCopiando, quitarOpcionDeEntrada } from "@/lib/cotizador/estado";
import { calcular, type EntradaNormalizada, normalizarEntrada, type Snapshot } from "@/lib/motor";
import { EntradaCotizacion as EsquemaEntrada } from "@/lib/validacion/cotizacion";

// Cada opción es independiente: tiene sus propios conceptos e insumos. Lo que se agrega, cambia o quita en una
// no toca a las demás.

const VINIL = "11111111-1111-4111-8111-111111111111";

const snapshot: Snapshot = {
  insumos: {
    [VINIL]: { id: VINIL, nombre: "Vinil", unidadCosto: "m2", costo: "100", anchoUtilM: null, areaLaminaM2: null, requiereRevision: false },
  },
  recetas: {},
  parametros: {
    margen: "0.30",
    pctMargenError: "0.10",
    pctConsumibles: "0",
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

const vinil = [{ insumoId: VINIL, modo: "por_m2" as const, cantidad: "1" }];
const fila = (id: string, concepto: string) => ({ id, concepto, anchoM: "1", altoM: "1", cantidades: ["1"] });

/** Como se guardaban antes: una sola tabla para las dos opciones. */
const compartida = {
  levantamiento: { areas: ["Cantidad"], filas: [fila("a", "Letrero")] },
  opciones: [
    { id: "o1", nombre: "Opción 1", materiales: { a: vinil }, preciosManuales: {} as Record<string, string> },
    { id: "o2", nombre: "Opción 2", materiales: { a: vinil }, preciosManuales: { a: "500" } },
  ],
  incluyeEnvio: false,
  operacion: {
    trabajoEnInstalacionesDisenarte: false,
    diasDiseno: "0",
    produccion: { personas: "0", dias: "0" },
    instalacion: { incluye: false, personas: "0", dias: "0" },
    viaticos: { tipo: "local" as const, personas: "0", dias: "0" },
    hospedaje: { incluye: false, noches: "0", costoNoche: "0" },
    traslado: { kmPorTrayecto: "0", modo: "diario" as const, casetasPorViaje: "0" },
    extras: [],
  },
  presentacion: { operacionProrrateada: true, modalidades: "solo_una" as const },
  ajustes: { aplicaMargenError: true, aplicaConsumibles: false },
  reventa: [],
} as unknown as EntradaNormalizada;

const filasDe = (e: EntradaNormalizada, opcionId: string) => e.levantamiento.filas.filter((f) => f.opcionId === opcionId);

describe("Cada opción tiene sus propios conceptos", () => {
  const entrada = normalizarEntrada(compartida, snapshot);

  it("una cotización anterior se reparte: cada opción recibe su copia con sus insumos y su precio", () => {
    expect(filasDe(entrada, "o1").map((f) => f.concepto)).toEqual(["Letrero"]);
    expect(filasDe(entrada, "o2").map((f) => f.concepto)).toEqual(["Letrero"]);
    const copia = filasDe(entrada, "o2")[0].id;
    expect(copia).not.toBe("a");
    expect(entrada.opciones[1].materiales).toEqual({ [copia]: vinil });
    expect(entrada.opciones[1].preciosManuales).toEqual({ [copia]: "500" });
    // Convertirla otra vez no la cambia.
    expect(normalizarEntrada(entrada, snapshot)).toEqual(entrada);
  });

  it("agregar un concepto extra en una opción solo cambia el precio de esa opción", () => {
    const antes = calcular(entrada, snapshot);
    const conExtra: EntradaNormalizada = {
      ...entrada,
      levantamiento: { ...entrada.levantamiento, filas: [...entrada.levantamiento.filas, { ...fila("x", "Extra"), opcionId: "o1" }] },
      opciones: [{ ...entrada.opciones[0], materiales: { ...entrada.opciones[0].materiales, x: vinil } }, entrada.opciones[1]],
    };
    const despues = calcular(conExtra, snapshot);

    expect(despues.opciones[0].variantes[0].filas.map((f) => f.concepto)).toEqual(["Letrero", "Extra"]);
    expect(despues.opciones[1].variantes[0]).toEqual(antes.opciones[1].variantes[0]);
    expect(despues.opciones[0].levantamiento?.piezas).toBe("2");
    expect(despues.opciones[1].levantamiento?.piezas).toBe("1");
  });

  it("una opción nueva empieza como copia y después se edita sin tocar la original", () => {
    const con3 = agregarOpcionCopiando(entrada, entrada.opciones[0], { id: "o3", nombre: "Opción 3", materiales: {} });
    const [copia] = filasDe(con3, "o3");
    expect(copia.concepto).toBe("Letrero");
    expect(copia.id).not.toBe("a");
    expect(con3.opciones[2].materiales[copia.id]).toEqual(vinil);
    // Son objetos distintos: cambiar la cantidad del insumo en la copia no alcanza a la original.
    con3.opciones[2].materiales[copia.id][0].cantidad = "2";
    expect(con3.opciones[0].materiales.a[0].cantidad).toBe("1");
  });

  it("quitar una opción se lleva solo sus conceptos", () => {
    const sinLaSegunda = quitarOpcionDeEntrada(entrada, "o2");
    expect(sinLaSegunda.levantamiento.filas.map((f) => f.id)).toEqual(["a"]);
  });

  it("una opción sin conceptos se avisa por su nombre", () => {
    const vacia = { ...entrada, levantamiento: { ...entrada.levantamiento, filas: filasDe(entrada, "o1") } };
    expect(() => calcular(vacia, snapshot)).toThrow("“Opción 2” no tiene conceptos");
  });

  it("al guardar se conserva de qué opción es cada concepto", () => {
    const revisada = EsquemaEntrada.parse({
      ...entrada,
      opciones: entrada.opciones.map((o) => ({ ...o, preciosManuales: {} })),
    });
    expect(revisada.levantamiento.filas.map((f) => f.opcionId)).toEqual(["o1", "o2"]);
  });
});
