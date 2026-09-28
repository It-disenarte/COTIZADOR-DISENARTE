import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { ctxId, iniciarSesion, peticion } from "./helpers/http";

vi.mock("@/lib/db", async () => {
  const { crearDbPrueba } = await import("./helpers/db");
  return { db: await crearDbPrueba() };
});

const { db } = await import("@/lib/db");
const { clientes, cotizaciones, cotizacionVersiones, insumos, parametros, recetas } = await import("@/lib/db/schema");
const { crearPrimerAdmin } = await import("@/lib/servicios/configuracion-inicial");
const rutaUsuarios = await import("@/app/api/usuarios/route");
const rutaCuentaPassword = await import("@/app/api/cuenta/password/route");
const rutaCotizaciones = await import("@/app/api/cotizaciones/route");
const rutaCotizacion = await import("@/app/api/cotizaciones/[id]/route");

const ADMIN = { nombre: "Admin", email: "admin@disenartemx.com", password: "Admin-Definitiva-2026" };
let cookieAdmin = "";
let cookieVentas = "";
let cookieOtroVentas = "";
let recetaEstireno = "";

async function cuentaLista(rol: "ventas" | "agente_admin", email: string) {
  const temporal = "Temporal-1234567";
  const definitiva = "Definitiva-1234567";
  await rutaUsuarios.POST(
    peticion("/api/usuarios", {
      metodo: "POST",
      cookie: cookieAdmin,
      cuerpo: { nombre: `Prueba ${email}`, email, rol, passwordTemporal: temporal },
    }),
    undefined,
  );
  const cookie = await iniciarSesion(email, temporal);
  await rutaCuentaPassword.POST(
    peticion("/api/cuenta/password", { metodo: "POST", cookie, cuerpo: { actual: temporal, nueva: definitiva } }),
    undefined,
  );
  return cookie;
}

/**
 * Cotización de Gandhi: 169 piezas de señalética repartidas en tres áreas,
 * estireno calibre 40 con impresión, 5-7 días, incluye envío.
 */
function cotizacionGandhi(recetaId: string) {
  return {
    titulo: "Señalética protección civil",
    solicitante: "Claudia P.",
    tiempoEstimado: "5-7 días",
    cliente: {
      nombreContacto: "Claudia P.",
      empresa: "Gandhi",
      correo: "claudia@ejemplo.mx",
      telefono: "427 100 41 83",
      direccion: "",
      kmDesdeSjr: "58.6",
      zona: "foraneo",
      notas: "",
    },
    entrada: {
      levantamiento: {
        areas: ["CENDI", "Primaria", "Secundaria"],
        filas: [
          { concepto: "Señalamiento 20 × 30 cm", anchoM: "0.20", altoM: "0.30", cantidades: ["30", "40", "39"] },
          { concepto: "Señalamiento 30 × 40 cm", anchoM: "0.30", altoM: "0.40", cantidades: ["20", "20", "20"] },
        ],
      },
      opciones: [{ recetaId, precioUnitarioManual: "" }],
      incluyeEnvio: true,
      operacion: {
        trabajoEnInstalacionesDisenarte: false,
        diasDiseno: "2",
        disenoMontoManual: "",
        produccion: { personas: 2, dias: "3" },
        instalacion: { incluye: false, personas: 0, dias: "0", escalaPorPieza: false },
        viaticos: { tipo: "foraneo", personas: 2, dias: "1", montoDiaManual: "" },
        hospedaje: { incluye: false, noches: 0, costoNoche: "0" },
        traslado: { kmPorTrayecto: "58.6", modo: "una_vez", viajesRedondos: "", rendimientoKmL: "", casetasPorViaje: "120" },
        extras: [],
      },
      presentacion: { operacionProrrateada: true, modalidades: "solo_una" },
      ajustes: { aplicaMargenError: true, aplicaConsumibles: true, margen: "", descuentoDecisionRapida: null },
      reventa: [
        { nombre: "Detector de humo autónomo 9V", precioReferencia: "180", cantidad: "66", link: "", verificado: true },
        { nombre: "Botiquín equipado portátil", precioReferencia: "650", cantidad: "4", link: "", verificado: true },
      ],
    },
  };
}

beforeAll(async () => {
  await crearPrimerAdmin(ADMIN);
  cookieAdmin = await iniciarSesion(ADMIN.email, ADMIN.password);
  cookieVentas = await cuentaLista("ventas", "ventas@disenartemx.com");
  cookieOtroVentas = await cuentaLista("ventas", "otro@disenartemx.com");

  // La receta de estireno necesita costos para poder cotizarse.
  await db.update(insumos).set({ costo: "95", unidadCosto: "m2" }).where(eq(insumos.nombre, "Estireno cal. 40 blanco"));
  await db.update(insumos).set({ anchoUtilM: "1.52" }).where(eq(insumos.nombre, "Impresión JV33 vinil blanco"));
  // El traslado a planta exige el precio de la gasolina capturado.
  await db.update(parametros).set({ valor: "24.50" }).where(eq(parametros.clave, "precio_gasolina_litro"));
  const [receta] = await db.select().from(recetas).where(eq(recetas.nombre, "Estireno cal. 40 + impresión"));
  recetaEstireno = receta.id;
});

describe("Criterio de la fase 4: recotizar Gandhi desde la app", () => {
  let cotizacionId = "";

  it("guarda el borrador, genera folio del día y calcula el precio", async () => {
    const res = await rutaCotizaciones.POST(
      peticion("/api/cotizaciones", { metodo: "POST", cookie: cookieVentas, cuerpo: cotizacionGandhi(recetaEstireno) }),
      undefined,
    );
    expect(res.status).toBe(201);
    const datos = await res.json();
    cotizacionId = datos.id;

    expect(datos.folio).toMatch(/^COT-\d{8}-01$/);
    expect(datos.version).toBe(1);
    expect(datos.resultado.levantamiento.piezas).toBe("169");
    expect(Number(datos.resultado.opciones[0].variantes[0].total)).toBeGreaterThan(0);
    expect(datos.resultado.reventa.items).toHaveLength(2);
    expect(datos.resultado.reventa.items[0].unitario).toBe("243.00"); // 180 × 1.35
  });

  it("guarda el cliente capturado dentro de la cotización, con sus kilómetros", async () => {
    const [cliente] = await db.select().from(clientes).where(eq(clientes.empresa, "Gandhi"));
    expect(cliente).toMatchObject({ nombreContacto: "Claudia P.", zona: "foraneo", kmDesdeSjr: "58.6000" });
  });

  it("guarda el snapshot de precios junto con la versión", async () => {
    const [version] = await db.select().from(cotizacionVersiones).where(eq(cotizacionVersiones.cotizacionId, cotizacionId));
    const precios = version.precios as { insumos: Record<string, unknown>; parametros: { margen: string } };
    expect(Object.keys(precios.insumos).length).toBeGreaterThan(30);
    expect(precios.parametros.margen).toBe("0.3000");
  });

  it("el autoguardado actualiza la misma versión, no crea otra", async () => {
    const cambiada = { ...cotizacionGandhi(recetaEstireno), titulo: "Señalética protección civil (rev. 2)" };
    const res = await rutaCotizacion.PUT(
      peticion(`/api/cotizaciones/${cotizacionId}`, { metodo: "PUT", cookie: cookieVentas, cuerpo: cambiada }),
      ctxId(cotizacionId),
    );
    expect(res.status).toBe(200);
    expect((await res.json()).version).toBe(1);

    const versiones = await db.select().from(cotizacionVersiones).where(eq(cotizacionVersiones.cotizacionId, cotizacionId));
    expect(versiones).toHaveLength(1);

    const [cotizacion] = await db.select().from(cotizaciones).where(eq(cotizaciones.id, cotizacionId));
    expect(cotizacion.titulo).toBe("Señalética protección civil (rev. 2)");
  });

  it("al reabrirla devuelve lo capturado y su resultado", async () => {
    const res = await rutaCotizacion.GET(
      peticion(`/api/cotizaciones/${cotizacionId}`, { cookie: cookieVentas }),
      ctxId(cotizacionId),
    );
    expect(res.status).toBe(200);
    const { cotizacion } = await res.json();
    expect(cotizacion.entrada.levantamiento.areas).toEqual(["CENDI", "Primaria", "Secundaria"]);
    expect(cotizacion.cliente.empresa).toBe("Gandhi");
    expect(cotizacion.estado).toBe("borrador");
  });

  it("el segundo folio del día es el 02", async () => {
    const res = await rutaCotizaciones.POST(
      peticion("/api/cotizaciones", { metodo: "POST", cookie: cookieVentas, cuerpo: cotizacionGandhi(recetaEstireno) }),
      undefined,
    );
    expect((await res.json()).folio).toMatch(/^COT-\d{8}-02$/);
  });
});

describe("Permisos sobre cotizaciones", () => {
  let ajena = "";

  beforeAll(async () => {
    const res = await rutaCotizaciones.POST(
      peticion("/api/cotizaciones", { metodo: "POST", cookie: cookieVentas, cuerpo: cotizacionGandhi(recetaEstireno) }),
      undefined,
    );
    ajena = (await res.json()).id;
  });

  it("otro vendedor no puede verla ni editarla", async () => {
    const ver = await rutaCotizacion.GET(peticion(`/api/cotizaciones/${ajena}`, { cookie: cookieOtroVentas }), ctxId(ajena));
    expect(ver.status).toBe(403);

    const editar = await rutaCotizacion.PUT(
      peticion(`/api/cotizaciones/${ajena}`, { metodo: "PUT", cookie: cookieOtroVentas, cuerpo: cotizacionGandhi(recetaEstireno) }),
      ctxId(ajena),
    );
    expect(editar.status).toBe(403);
  });

  it("el admin sí puede verla", async () => {
    const res = await rutaCotizacion.GET(peticion(`/api/cotizaciones/${ajena}`, { cookie: cookieAdmin }), ctxId(ajena));
    expect(res.status).toBe(200);
  });

  it("cada quien ve solo las suyas en la lista; el admin las ve todas", async () => {
    const mias = await rutaCotizaciones.GET(peticion("/api/cotizaciones", { cookie: cookieVentas }), undefined);
    const propias = (await mias.json()).cotizaciones;
    expect(propias.length).toBeGreaterThan(0);
    expect(propias.every((c: { vendedorId: string }) => c.vendedorId !== undefined)).toBe(true);

    const deOtro = await rutaCotizaciones.GET(peticion("/api/cotizaciones", { cookie: cookieOtroVentas }), undefined);
    expect((await deOtro.json()).cotizaciones).toHaveLength(0);

    const todas = await rutaCotizaciones.GET(peticion("/api/cotizaciones?todas=1", { cookie: cookieAdmin }), undefined);
    expect((await todas.json()).cotizaciones.length).toBeGreaterThan(0);
  });

  it("una cotización cerrada ya no se edita", async () => {
    await rutaCotizacion.PATCH(
      peticion(`/api/cotizaciones/${ajena}`, { metodo: "PATCH", cookie: cookieVentas, cuerpo: { estado: "ganada" } }),
      ctxId(ajena),
    );
    const res = await rutaCotizacion.PUT(
      peticion(`/api/cotizaciones/${ajena}`, { metodo: "PUT", cookie: cookieVentas, cuerpo: cotizacionGandhi(recetaEstireno) }),
      ctxId(ajena),
    );
    expect(res.status).toBe(409);
  });
});

describe("Borradores: se guardan con los datos del paso 1", () => {
  const guardarNueva = (cuerpo: unknown) =>
    rutaCotizaciones.POST(peticion("/api/cotizaciones", { metodo: "POST", cookie: cookieVentas, cuerpo }), undefined);

  /** Lo que tiene el asistente recién abierto, con solo el paso 1 capturado. */
  function soloPaso1() {
    const cuerpo = cotizacionGandhi(recetaEstireno);
    cuerpo.entrada.levantamiento = { areas: [""], filas: [{ concepto: "", anchoM: "", altoM: "", cantidades: [""] }] };
    cuerpo.entrada.opciones = [];
    cuerpo.entrada.operacion.diasDiseno = "";
    cuerpo.entrada.reventa = [{ nombre: "", precioReferencia: "", cantidad: "", link: "", verificado: false }];
    return cuerpo;
  }

  it("guarda sin levantamiento ni materiales y avisa qué falta para calcular", async () => {
    const res = await guardarNueva(soloPaso1());
    expect(res.status).toBe(201);
    const datos = await res.json();
    expect(datos.folio).toMatch(/^COT-/);
    expect(datos.resultado).toBeNull();
    expect(datos.pendiente).toMatch(/^Levantamiento: Nombra el área/);

    // Al abrirlo de nuevo, vuelve tal cual se dejó para seguir capturando.
    const abierta = await rutaCotizacion.GET(peticion(`/api/cotizaciones/${datos.id}`, { cookie: cookieVentas }), ctxId(datos.id));
    const { cotizacion } = await abierta.json();
    expect(cotizacion.resultado).toBeNull();
    expect(cotizacion.entrada.opciones).toEqual([]);
    expect(cotizacion.entrada.levantamiento.filas[0].concepto).toBe("");
  });

  it("en la lista, un borrador incompleto sale sin total", async () => {
    const { id } = await (await guardarNueva(soloPaso1())).json();
    const res = await rutaCotizaciones.GET(peticion("/api/cotizaciones", { cookie: cookieVentas }), undefined);
    const { cotizaciones: lista } = await res.json();
    expect(lista.find((c: { id: string }) => c.id === id).total).toBeNull();
  });

  it("al completarlo, el mismo borrador ya calcula el precio", async () => {
    const { id } = await (await guardarNueva(soloPaso1())).json();
    const res = await rutaCotizacion.PUT(
      peticion(`/api/cotizaciones/${id}`, { metodo: "PUT", cookie: cookieVentas, cuerpo: cotizacionGandhi(recetaEstireno) }),
      ctxId(id),
    );
    const datos = await res.json();
    expect(datos.pendiente).toBeNull();
    expect(datos.resultado.levantamiento.piezas).toBe("169");
  });

  it("sigue exigiendo el título y rechaza números mal escritos", async () => {
    expect((await guardarNueva({ ...soloPaso1(), titulo: "" })).status).toBe(400);

    const malEscrito = soloPaso1();
    malEscrito.entrada.levantamiento.filas[0].anchoM = "dos metros";
    expect((await guardarNueva(malEscrito)).status).toBe(400);
  });

  it("si al catálogo le falta un costo, guarda el borrador y dice cuál insumo es", async () => {
    const [sinCosto] = await db.select().from(recetas).where(eq(recetas.nombre, "Estireno cal. 40 + fotoluminiscente"));
    const res = await guardarNueva(cotizacionGandhi(sinCosto.id));
    expect(res.status).toBe(201);
    const datos = await res.json();
    expect(datos.resultado).toBeNull();
    expect(datos.pendiente).toMatch(/costo/i);
  });
});

describe("Cotizaciones con la forma anterior (una receta por opción)", () => {
  it("se guardan ya convertidas: cada concepto con los insumos de la receta", async () => {
    const res = await rutaCotizaciones.POST(
      peticion("/api/cotizaciones", { metodo: "POST", cookie: cookieVentas, cuerpo: cotizacionGandhi(recetaEstireno) }),
      undefined,
    );
    const { id } = await res.json();
    const [version] = await db.select().from(cotizacionVersiones).where(eq(cotizacionVersiones.cotizacionId, id));
    const entrada = version.entrada as {
      levantamiento: { filas: { id: string }[] };
      opciones: { id: string; nombre: string; materiales: Record<string, unknown[]> }[];
    };

    const [opcion] = entrada.opciones;
    expect(opcion.id).toBe(recetaEstireno);
    expect(opcion.nombre).toBe("Estireno cal. 40 + impresión");
    for (const fila of entrada.levantamiento.filas) expect(opcion.materiales[fila.id]).toHaveLength(2);
  });
});
