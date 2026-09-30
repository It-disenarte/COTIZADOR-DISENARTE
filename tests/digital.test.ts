import { describe, expect, it } from "vitest";
import { calcularDigital, type EntradaDigital, type LineaDigital } from "@/lib/motor";

const NEXT_LEVEL: LineaDigital = {
  id: "web",
  servicioId: null,
  nombre: 'Página web "Next Level"',
  descripcion: "Hasta 4 páginas\nSEO básico",
  cobro: "paquete",
  cantidad: "1",
  precio: "20764",
  precioMensual: "1102",
  activacion: "7540",
  mesesRenta: "12",
};

const LOGO: LineaDigital = { id: "logo", servicioId: null, nombre: "Logotipo", cobro: "unico", cantidad: "1", precio: "4000" };

function entrada(cambios: Partial<EntradaDigital> = {}): EntradaDigital {
  return { tipo: "digital", modalidadWeb: "ambas", lineas: [NEXT_LEVEL], anticipoPct: "70", promociones: [], ...cambios };
}

describe("Digitalización: paquete web en renta o como dueño", () => {
  it("en renta respeta los precios de lista con IVA incluido: activación + mensualidad", () => {
    const [renta] = calcularDigital(entrada({ modalidadWeb: "renta" }), "0.16").escenarios;
    expect(renta.clave).toBe("renta");
    expect(renta.renta).toEqual({ activacion: "7540.00", mensualidad: "1102.00", meses: 12, totalPrimerAno: "19662.00" }); // la activación ya cubre el primer mes: 7,540 + 11 × 1,102
    expect(renta.unico).toBeNull();
    expect(renta.filasRenta[0].nota).toContain("IVA incluido");
  });

  it("como dueño cobra el precio más IVA, en anticipo del 70% y finiquito del 30%", () => {
    const [dueno] = calcularDigital(entrada({ modalidadWeb: "dueno" }), "0.16").escenarios;
    expect(dueno.unico).toMatchObject({ subtotal: "20764.00", iva: "3322.24", total: "24086.24", anticipo: "16860.37", finiquito: "7225.87" });
  });

  it("con las dos modalidades arma dos escenarios para que el cliente elija", () => {
    const { escenarios } = calcularDigital(entrada(), "0.16");
    expect(escenarios.map((e) => e.clave)).toEqual(["renta", "dueno"]);
  });

  it("los extras de pago único llevan IVA aparte en las dos modalidades", () => {
    const [renta, dueno] = calcularDigital(entrada({ lineas: [NEXT_LEVEL, LOGO] }), "0.16").escenarios;
    expect(renta.unico?.subtotal).toBe("4000.00"); // solo el logo: el paquete va en renta
    expect(dueno.unico?.subtotal).toBe("24764.00"); // paquete como dueño + logo
  });

  it("sin paquete web es una sola propuesta de pagos únicos y mensuales", () => {
    const redes: LineaDigital = { id: "redes", servicioId: null, nombre: "Manejo de redes", cobro: "mensual", cantidad: "1", precio: "3500" };
    const { escenarios } = calcularDigital(entrada({ lineas: [LOGO, redes] }), "0.16");
    expect(escenarios).toHaveLength(1);
    expect(escenarios[0].clave).toBe("unico");
    expect(escenarios[0].mensual).toEqual({ subtotal: "3500.00", iva: "560.00", total: "4060.00" });
  });
});

describe("Promociones de contado", () => {
  it("aplican su descuento a los pagos únicos y conservan el regalo y la fecha", () => {
    const [dueno] = calcularDigital(
      entrada({
        modalidadWeb: "dueno",
        promociones: [
          { id: "p1", nombre: "Pago de contado", descuentoPct: "10", regalo: "Capacitación del proyecto", validaHasta: "2099-12-31", activa: true },
          { id: "p2", nombre: "Contado en 48 horas", descuentoPct: "25", regalo: "1 año de soporte", validaHasta: null, activa: false },
        ],
      }),
      "0.16",
    ).escenarios;
    expect(dueno.unico?.promociones).toEqual([
      {
        nombre: "Pago de contado",
        descuentoPct: "10",
        descuento: "2076.40",
        subtotal: "18687.60",
        iva: "2990.02",
        total: "21677.62",
        regalo: "Capacitación del proyecto",
        validaHasta: "2099-12-31",
      },
    ]);
  });

  it("avisa si una promoción ya venció", () => {
    const { alertas } = calcularDigital(
      entrada({ modalidadWeb: "dueno", promociones: [{ id: "p", nombre: "Junio", descuentoPct: "10", validaHasta: "2026-06-16", activa: true }] }),
      "0.16",
      new Date("2026-09-30T12:00:00Z"),
    );
    expect(alertas.map((a) => a.codigo)).toContain("PROMOCION_VENCIDA");
  });
});

describe("Precios por capturar", () => {
  it("un servicio sin precio impide calcular y dice cuál es", () => {
    expect(() => calcularDigital(entrada({ lineas: [{ ...LOGO, precio: null }] }), "0.16")).toThrow(/Falta el precio de "Logotipo"/);
  });

  it("en renta pide la mensualidad aunque tenga precio como dueño", () => {
    expect(() => calcularDigital(entrada({ modalidadWeb: "renta", lineas: [{ ...NEXT_LEVEL, precioMensual: null }] }), "0.16")).toThrow(
      /mensualidad/,
    );
  });
});
