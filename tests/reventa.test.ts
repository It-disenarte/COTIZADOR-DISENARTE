import { extractText, getDocumentProxy } from "unpdf";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { ctxId, iniciarSesion, peticion } from "./helpers/http";

vi.mock("@/lib/db", async () => {
  const { crearDbPrueba } = await import("./helpers/db");
  return { db: await crearDbPrueba() };
});

const { crearPrimerAdmin } = await import("@/lib/servicios/configuracion-inicial");
const { formatoMoneda } = await import("@/lib/formato");
const rutaCotizaciones = await import("@/app/api/cotizaciones/route");
const rutaAutorizar = await import("@/app/api/cotizaciones/[id]/autorizar/route");
const rutaPdf = await import("@/app/api/cotizaciones/[id]/pdf/route");

let cookie = "";

/**
 * Venta de pura reventa y maquila: letras 3D que fabrica un proveedor y extintores que solo se
 * revenden, con diseño, envío e instalación. La tabla del paso 2 se queda con su fila en blanco.
 */
function ventaSoloReventa(cambios: { reventa?: unknown[]; descuento?: string } = {}) {
  return {
    titulo: "Letras 3D y extintores para recepción",
    solicitante: "Laura Gómez",
    cliente: { nombreContacto: "Laura Gómez", puesto: "Compras", empresa: "Logística del Bajío", correo: "", telefono: "", direccion: "", kmDesdeSjr: "", zona: "local", notas: "" },
    entrada: {
      levantamiento: { areas: ["Cantidad"], filas: [{ id: "f1", concepto: "", anchoM: "", altoM: "", cantidades: [""] }] },
      opciones: [{ id: "op1", nombre: "Opción 1", materiales: {} }],
      tiempoEstimado: "10 días hábiles",
      alcance: { concepto: "Identidad para recepción", resumen: "Letras corpóreas y equipo de seguridad." },
      propuesta: { noIncluye: "Obra civil ni instalación eléctrica.", supuestos: "", vigenciaDias: "15" },
      incluyeEnvio: true,
      operacion: {
        trabajoEnInstalacionesDisenarte: false,
        diasDiseno: "1",
        disenoMontoManual: "",
        produccion: { personas: 0, dias: "0" },
        instalacion: { incluye: true, personas: 2, dias: "1", escalaPorPieza: false },
        viaticos: { tipo: "local", personas: 2, dias: "1", montoDiaManual: "" },
        hospedaje: { incluye: false, noches: 0, costoNoche: "0" },
        traslado: { kmPorTrayecto: "0", modo: "diario", viajesRedondos: "", rendimientoKmL: "", casetasPorViaje: "0" },
        extras: [],
      },
      presentacion: { operacionProrrateada: true, modalidades: "solo_una" },
      ajustes: {
        aplicaMargenError: true,
        aplicaConsumibles: true,
        margen: "",
        descuentoDecisionRapida: cambios.descuento ? { monto: cambios.descuento, nota: "" } : null,
      },
      reventa: cambios.reventa ?? [
        { nombre: "Letras 3D en acero inoxidable", precioReferencia: "1000", cantidad: "2", link: "", verificado: true },
        { nombre: "Extintor PQS 4.5 kg", precioReferencia: "500", cantidad: "4", link: "", verificado: true },
      ],
    },
  };
}

const crear = async (cuerpo: unknown) =>
  (await rutaCotizaciones.POST(peticion("/api/cotizaciones", { metodo: "POST", cookie, cuerpo }), undefined)).json();

beforeAll(async () => {
  await crearPrimerAdmin({ nombre: "Mishell Ledesma", email: "admin@disenartemx.com", password: "Admin-Definitiva-2026" });
  cookie = await iniciarSesion("admin@disenartemx.com", "Admin-Definitiva-2026");
});

describe("Cotización de pura reventa o maquila", () => {
  it("se completa sin conceptos: los artículos llevan el 35% y la operación sale aparte con la fórmula del PNO", async () => {
    const { pendiente, resultado } = await crear(ventaSoloReventa());
    expect(pendiente).toBeNull();
    expect(resultado.opciones).toEqual([]);
    // Artículos: compra × 1.35.
    expect(resultado.reventa.items.map((i: { unitario: string }) => i.unitario)).toEqual(["1350.00", "675.00"]);
    // Operación: costo × 1.10 ÷ 0.70. Diseño $700; instalación 2 × $700 + viáticos 2 × $250 = $1,900.
    expect(resultado.reventa.operacion).toEqual([
      { concepto: "Diseño", cantidad: "1", unitario: "1100.00", subtotal: "1100.00" },
      { concepto: "Envío e instalación", cantidad: "1", unitario: "2985.71", subtotal: "2985.71" },
    ]);
    expect(resultado.reventa.subtotal).toBe("9485.71");
    expect(resultado.reventa.total).toBe("11003.42");
  });

  it("sin artículos ni conceptos avisa qué falta", async () => {
    const { pendiente } = await crear(ventaSoloReventa({ reventa: [] }));
    expect(pendiente).toMatch(/^Levantamiento y materiales: Agrega al menos un concepto, o artículos de reventa o maquila/);
  });

  it("un campo numérico que se dejó vacío cuenta como 0, salvo lo que nos cuesta un artículo", async () => {
    const venta = ventaSoloReventa();
    venta.entrada.operacion.diasDiseno = "";
    venta.entrada.operacion.traslado.casetasPorViaje = "";
    const { pendiente, resultado } = await crear(venta);
    expect(pendiente).toBeNull();
    expect(resultado.reventa.operacion.map((f: { concepto: string }) => f.concepto)).toEqual(["Envío e instalación"]);

    const sinPrecio = ventaSoloReventa({
      reventa: [{ nombre: "Extintor PQS 4.5 kg", precioReferencia: "", cantidad: "4", link: "", verificado: true }],
    });
    expect((await crear(sinPrecio)).pendiente).toMatch(/^Reventa y maquila:/);
  });

  it("con precio deseado, el aumento se reparte entre artículos y operación", async () => {
    const venta = ventaSoloReventa();
    (venta.entrada.ajustes as { precioObjetivo?: string }).precioObjetivo = "18971.42"; // el doble del calculado
    const { resultado } = await crear(venta);
    expect(resultado.reventa.subtotal).toBe("18971.42");
    expect(resultado.reventa.subtotalCalculado).toBe("9485.71");
    expect(resultado.reventa.ajustePrecio).toBe("9485.71");
    expect(resultado.reventa.items.map((i: { unitario: string }) => i.unitario)).toEqual(["2700.00", "1350.00"]);
    expect(resultado.reventa.operacion.map((f: { subtotal: string }) => f.subtotal)).toEqual(["2200.00", "5971.42"]);
  });

  it("el precio deseado menor al calculado no se aplica y avisa", async () => {
    const venta = ventaSoloReventa();
    (venta.entrada.ajustes as { precioObjetivo?: string }).precioObjetivo = "5000";
    const { resultado } = await crear(venta);
    expect(resultado.reventa.subtotal).toBe("9485.71");
    expect(resultado.alertas.some((a: { codigo: string }) => a.codigo === "OBJETIVO_MENOR")).toBe(true);
  });

  it("el descuento por decisión rápida se resta antes del IVA", async () => {
    const { resultado } = await crear(ventaSoloReventa({ descuento: "485.71" }));
    expect(resultado.reventa.descuento).toBe("485.71");
    expect(resultado.reventa.subtotal).toBe("9000.00");
    expect(resultado.reventa.total).toBe("10440.00");
  });

  it("aparece en la lista con su total y el PDF es la cotización misma, sin consolidado ni costos", async () => {
    const { id } = await crear(ventaSoloReventa());
    const lista = await (await rutaCotizaciones.GET(peticion("/api/cotizaciones", { cookie }), undefined)).json();
    expect(lista.cotizaciones.find((c: { id: string }) => c.id === id).total).toBe("11003.42");

    await rutaAutorizar.POST(peticion(`/api/cotizaciones/${id}/autorizar`, { metodo: "POST", cookie, cuerpo: {} }), ctxId(id));
    const res = await rutaPdf.GET(peticion(`/api/cotizaciones/${id}/pdf`, { cookie }), ctxId(id));
    expect(res.status).toBe(200);
    const { text } = await extractText(await getDocumentProxy(new Uint8Array(await res.arrayBuffer())), { mergePages: true });
    const texto = (text as string).replace(/\s+/g, " ");
    expect(texto).toContain("Proyecto: Identidad para recepción");
    expect(texto).toContain("Concepto: Letras 3D en acero inoxidable");
    expect(texto).toContain("Concepto: Diseño");
    expect(texto).toContain("Concepto: Envío e instalación");
    expect(texto).toContain(formatoMoneda("11003.42"));
    expect(texto).not.toContain("Consolidado del levantamiento");
    expect(texto).not.toContain("Materiales adicionales");
    // Nunca sale lo que nos cuesta.
    expect(texto).not.toContain("1,000.00");
    expect(texto).not.toContain("500.00 MXN");
  });
});
