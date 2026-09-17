import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { iniciarSesion, peticion } from "./helpers/http";

vi.mock("@/lib/db", async () => {
  const { crearDbPrueba } = await import("./helpers/db");
  return { db: await crearDbPrueba() };
});

const { db } = await import("@/lib/db");
const { parametros, recetas } = await import("@/lib/db/schema");
const { crearPrimerAdmin } = await import("@/lib/servicios/configuracion-inicial");
const rutaCalcular = await import("@/app/api/cotizaciones/calcular/route");

const ADMIN = { nombre: "Admin", email: "admin@disenartemx.com", password: "Admin-Definitiva-2026" };
let cookie = "";
let recetaRotulacion = "";

/** Caso del Versa contra el catálogo real: receta "Corte de vinil (rotulación)". */
function entradaVersa(unidades: number, recetaId: string) {
  return {
    levantamiento: {
      areas: ["Flotilla"],
      filas: [{ concepto: "Rotulación Nissan Versa", anchoM: "4", altoM: "3", cantidades: [String(unidades)] }],
    },
    opciones: [{ recetaId, precioUnitarioManual: "" }],
    incluyeEnvio: false,
    operacion: {
      trabajoEnInstalacionesDisenarte: true,
      diasDiseno: "1",
      disenoMontoManual: "1300",
      produccion: { personas: 0, dias: "0" },
      instalacion: { incluye: true, personas: 2, dias: "1", escalaPorPieza: true },
      viaticos: { tipo: "local", personas: 2, dias: "1", montoDiaManual: "" },
      hospedaje: { incluye: false, noches: 0, costoNoche: "0" },
      traslado: { kmPorTrayecto: "0", modo: "una_vez", viajesRedondos: "", rendimientoKmL: "", casetasPorViaje: "0" },
      extras: [],
    },
    presentacion: { operacionProrrateada: true, modalidades: "solo_una" },
    ajustes: { aplicaMargenError: false, aplicaConsumibles: false, margen: "0.35", descuentoDecisionRapida: null },
    reventa: [],
  };
}

const calcular = (cuerpo: unknown, cookieUsada = cookie) =>
  rutaCalcular.POST(peticion("/api/cotizaciones/calcular", { metodo: "POST", cookie: cookieUsada, cuerpo }), undefined);

beforeAll(async () => {
  await crearPrimerAdmin(ADMIN);
  cookie = await iniciarSesion(ADMIN.email, ADMIN.password);
  const [receta] = await db.select().from(recetas).where(eq(recetas.nombre, "Corte de vinil (rotulación)"));
  recetaRotulacion = receta.id;
});

describe("Cotizar con el catálogo real", () => {
  it("el caso del Versa da $11,846.15 con los precios que trae la app", async () => {
    const res = await calcular(entradaVersa(1, recetaRotulacion));
    expect(res.status).toBe(200);
    const { resultado } = await res.json();
    const variante = resultado.opciones[0].variantes[0];

    expect(variante.desglose.costoTotal).toBe("7700.00");
    expect(variante.unitario).toBe("11846.15");
    expect(variante.total).toBe("13741.53");
    expect(resultado.levantamiento.areaM2).toBe("12.00");
  });

  it("a 25 unidades el unitario baja a $9,926.15 porque el diseño se prorratea", async () => {
    const res = await calcular(entradaVersa(25, recetaRotulacion));
    const { resultado } = await res.json();
    expect(resultado.opciones[0].variantes[0].unitario).toBe("9926.15");
  });

  it("no cotiza recetas con datos incompletos y dice cuál insumo es", async () => {
    const [estireno] = await db.select().from(recetas).where(eq(recetas.nombre, "Estireno cal. 40 + impresión"));
    const res = await calcular(entradaVersa(1, estireno.id));
    expect(res.status).toBe(400);

    // Esa receta tiene dos huecos: el estireno sin costo y la impresión sin ancho útil.
    const { error, codigo } = await res.json();
    expect(error).toMatch(/Falta capturar el costo|ancho útil/);
    expect(["SIN_COSTO", "SIN_ANCHO_UTIL"]).toContain(codigo);
  });

  it("exige el precio de la gasolina solo cuando hay traslado", async () => {
    const entrada = entradaVersa(1, recetaRotulacion);
    entrada.operacion.trabajoEnInstalacionesDisenarte = false;
    entrada.operacion.traslado = {
      kmPorTrayecto: "58.6",
      modo: "diario",
      viajesRedondos: "2",
      rendimientoKmL: "",
      casetasPorViaje: "120",
    };

    const sinPrecio = await calcular(entrada);
    expect(sinPrecio.status).toBe(400);
    expect((await sinPrecio.json()).error).toMatch(/gasolina/);

    await db.update(parametros).set({ valor: "24.50" }).where(eq(parametros.clave, "precio_gasolina_litro"));

    const conPrecio = await calcular(entrada);
    expect(conPrecio.status).toBe(200);
    const { resultado } = await conPrecio.json();
    expect(resultado.opciones[0].variantes[0].desglose.gasolina).toBe("574.28");
  });

  it("valida la entrada y exige sesión", async () => {
    const invalida = await calcular({ levantamiento: { areas: [], filas: [] } });
    expect(invalida.status).toBe(400);

    const sinSesion = await rutaCalcular.POST(
      peticion("/api/cotizaciones/calcular", { metodo: "POST", cuerpo: entradaVersa(1, recetaRotulacion) }),
      undefined,
    );
    expect(sinSesion.status).toBe(401);
  });
});
