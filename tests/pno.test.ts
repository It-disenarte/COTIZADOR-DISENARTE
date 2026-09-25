import { eq } from "drizzle-orm";
import { extractText, getDocumentProxy } from "unpdf";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cotizacionGandhi, prepararCatalogo } from "./helpers/cotizacion";
import { ctxId, iniciarSesion, peticion } from "./helpers/http";

/**
 * Comprobaciones contra el PNO-COM-01 "Elaboración de cotizaciones" (versión 1.0, julio 2026):
 * las fórmulas oficiales del apartado 6 y los puntos de control de las fases 1 y 2.
 */
// Gemini simulado: la redacción no debe llamar al servicio real en pruebas.
const generar = vi.hoisted(() => vi.fn());
vi.mock("@google/genai", () => ({
  GoogleGenAI: class {
    models = { generateContent: (...args: unknown[]) => generar(...args) };
  },
}));

vi.mock("@/lib/db", async () => {
  const { crearDbPrueba } = await import("./helpers/db");
  return { db: await crearDbPrueba() };
});

const { db } = await import("@/lib/db");
const { cotizaciones, parametros } = await import("@/lib/db/schema");
const { calcular } = await import("@/lib/motor");
const { crearPrimerAdmin } = await import("@/lib/servicios/configuracion-inicial");
const { obtenerSnapshot } = await import("@/lib/servicios/snapshot");
const rutaCotizaciones = await import("@/app/api/cotizaciones/route");
const rutaCotizacion = await import("@/app/api/cotizaciones/[id]/route");
const rutaAutorizar = await import("@/app/api/cotizaciones/[id]/autorizar/route");
const rutaPdf = await import("@/app/api/cotizaciones/[id]/pdf/route");
const rutaUsuarios = await import("@/app/api/usuarios/route");
const rutaCuentaPassword = await import("@/app/api/cuenta/password/route");

let cookieAdmin = "";
let cookieVentas = "";
let recetaId = "";

const autorizar = (id: string, cookie: string) =>
  rutaAutorizar.POST(peticion(`/api/cotizaciones/${id}/autorizar`, { metodo: "POST", cookie, cuerpo: {} }), ctxId(id));

const pdf = (id: string, cookie: string) =>
  rutaPdf.GET(peticion(`/api/cotizaciones/${id}/pdf`, { cookie }), ctxId(id));

async function crearCotizacion(cuerpo: unknown, cookie = cookieVentas) {
  const res = await rutaCotizaciones.POST(peticion("/api/cotizaciones", { metodo: "POST", cookie, cuerpo }), undefined);
  expect(res.status).toBe(201);
  return (await res.json()).id as string;
}

beforeEach(() => {
  vi.stubEnv("GEMINI_API_KEY", "llave-de-prueba");
  vi.stubEnv("GEMINI_LIMITE_HORA", "1000");
  generar.mockReset();
});

beforeAll(async () => {
  await crearPrimerAdmin({ nombre: "Erick Medina", email: "admin@disenartemx.com", password: "Admin-Definitiva-2026" });
  cookieAdmin = await iniciarSesion("admin@disenartemx.com", "Admin-Definitiva-2026");
  recetaId = await prepararCatalogo(db);

  await rutaUsuarios.POST(
    peticion("/api/usuarios", {
      metodo: "POST",
      cookie: cookieAdmin,
      cuerpo: { nombre: "Ventas", email: "ventas@disenartemx.com", rol: "ventas", passwordTemporal: "Temporal-1234567" },
    }),
    undefined,
  );
  const temporal = await iniciarSesion("ventas@disenartemx.com", "Temporal-1234567");
  await rutaCuentaPassword.POST(
    peticion("/api/cuenta/password", {
      metodo: "POST",
      cookie: temporal,
      cuerpo: { actual: "Temporal-1234567", nueva: "Definitiva-1234567" },
    }),
    undefined,
  );
  cookieVentas = await iniciarSesion("ventas@disenartemx.com", "Definitiva-1234567");
});

describe("Apartado 6: fórmulas oficiales", () => {
  /** Caso resuelto del PNO (apartado 8): rotulación vehicular, escenario A. */
  it("reproduce el caso del manual: costo 5,786 → ajustado 6,364.60 → venta 9,092.29 → total 10,547.05", async () => {
    const snapshot = await obtenerSnapshot(null as never).catch(() => null);
    expect(snapshot).toBeNull(); // el cálculo exige sesión; se usa el snapshot del admin

    const conSesion = await obtenerSnapshot({ id: "x", nombre: "Admin", rol: "admin", activo: true } as never);
    const costoDirecto = 3486 + 1400 + 200 + 700;
    const ajustado = costoDirecto * 1.1;
    const venta = ajustado / 0.7;

    expect(costoDirecto).toBe(5786);
    expect(Number(ajustado.toFixed(2))).toBe(6364.6);
    expect(Number(venta.toFixed(2))).toBe(9092.29);
    expect(Number((venta * 1.16).toFixed(2))).toBe(10547.05);

    // El motor usa exactamente ese factor: (1 + margen de error) ÷ (1 − margen).
    const factor = (1 + Number(conSesion.parametros.pctMargenError)) / (1 - Number(conSesion.parametros.margen));
    expect(Number((costoDirecto * factor).toFixed(2))).toBe(9092.29);
  });

  it("los valores homologados del apartado 5 están capturados", async () => {
    const filas = await db.select().from(parametros);
    const valor = (clave: string) => filas.find((p) => p.clave === clave)?.valor;

    expect(valor("tarifa_instalador_dia")).toBe("700.0000");
    expect(valor("tarifa_diseno_dia")).toBe("700.0000");
    expect(valor("viaticos_local_dia")).toBe("250.0000");
    expect(valor("margen")).toBe("0.3000");
    expect(valor("pct_margen_error")).toBe("0.1000");
    expect(valor("iva")).toBe("0.1600");
    expect(valor("rendimiento_km_l")).toBe("10.0000");
    expect(valor("rendimiento_hilux")).toBe("10.0000");
  });

  it("6.8: la comprobación de utilidad viaja en el resultado de cada variante", async () => {
    const snapshot = await obtenerSnapshot({ id: "x", nombre: "Admin", rol: "admin", activo: true } as never);
    const { entrada } = cotizacionGandhi(recetaId);
    const resultado = calcular(entrada as never, snapshot);
    const variante = resultado.opciones[0].variantes[0];

    // (precio de venta − costo directo) ÷ precio de venta ≈ 0.30 o más.
    const utilidad = (Number(variante.subtotal) - Number(variante.desglose.costoTotal)) / Number(variante.subtotal);
    expect(Number(variante.margenReal)).toBeCloseTo(utilidad, 4);
    expect(Number(variante.margenReal)).toBeGreaterThanOrEqual(0.3);
  });
});

describe("Apartado 9: unidades de venta de la lista oficial", () => {
  it("las unidades del PNO están disponibles en el catálogo", async () => {
    const { UNIDADES_COSTO } = await import("@/lib/catalogo/constantes");
    expect(UNIDADES_COSTO).toContain("minuto"); // corte y grabado láser
    expect(UNIDADES_COSTO).toContain("ciento"); // tarjetas
    expect(UNIDADES_COSTO).toContain("millar"); // tarjetas
    expect(UNIDADES_COSTO).toContain("persona"); // cursos
    expect(UNIDADES_COSTO).toContain("ml"); // rotulación y corte de vinil
  });

  it("un insumo por millar reparte su costo entre las piezas de la presentación", async () => {
    const { insumos, recetaComponentes, recetas } = await import("@/lib/db/schema");
    const [tarjetas] = await db
      .insert(insumos)
      .values({ nombre: "Tarjetas de presentación", categoria: "Impresión menor", unidadCosto: "millar", costo: "1500" })
      .returning();
    const [receta] = await db
      .insert(recetas)
      .values({ nombre: "Tarjetas millar", familia: "impresion_menor", pctMerma: "0" })
      .returning();
    await db.insert(recetaComponentes).values({ recetaId: receta.id, insumoId: tarjetas.id, modo: "por_pieza", cantidad: "1" });

    const snapshot = await obtenerSnapshot({ id: "x", nombre: "Admin", rol: "admin", activo: true } as never);
    const entrada = cotizacionGandhi(receta.id).entrada;
    entrada.levantamiento = {
      areas: ["General"],
      filas: [{ concepto: "Tarjetas", anchoM: "0", altoM: "0", cantidades: ["2000"] }],
    };
    entrada.operacion.instalacion.incluye = false;
    entrada.operacion.produccion = { personas: 0, dias: "0" };
    entrada.operacion.diasDiseno = "0";
    entrada.incluyeEnvio = false;
    entrada.ajustes.aplicaConsumibles = false;

    const resultado = calcular(entrada as never, snapshot);
    // 2,000 tarjetas a $1,500 el millar = $3,000 de material, no $3,000,000.
    expect(Number(resultado.opciones[0].variantes[0].desglose.materiales)).toBeCloseTo(3000, 2);
  });
});

describe("Apartado 8.3: escenario de volumen con el diseño amortizado", () => {
  it("la modalidad piloto y volumen reparte el diseño entre las unidades del proyecto", async () => {
    const snapshot = await obtenerSnapshot({ id: "x", nombre: "Admin", rol: "admin", activo: true } as never);
    const { entrada } = cotizacionGandhi(recetaId);
    entrada.presentacion = { operacionProrrateada: true, modalidades: "piloto_y_volumen", unidadesVolumen: "25" } as never;
    entrada.operacion.diasDiseno = "1";

    const [piloto, volumen] = calcular(entrada as never, snapshot).opciones[0].variantes;
    expect(piloto.etiqueta).toContain("piloto");
    expect(volumen.etiqueta).toContain("25 unidades");

    // El diseño de $700 pasa a $28 por unidad; lo demás no cambia.
    expect(Number(piloto.desglose.diseno)).toBeCloseTo(700, 2);
    expect(Number(volumen.desglose.diseno)).toBeCloseTo(28, 2);
    expect(Number(volumen.subtotal)).toBeLessThan(Number(piloto.subtotal));
  });

  it("pide las unidades cuando se elige el escenario por volumen", async () => {
    const snapshot = await obtenerSnapshot({ id: "x", nombre: "Admin", rol: "admin", activo: true } as never);
    const { entrada } = cotizacionGandhi(recetaId);
    entrada.presentacion = { operacionProrrateada: true, modalidades: "piloto_y_volumen", unidadesVolumen: "" } as never;
    expect(() => calcular(entrada as never, snapshot)).toThrow(/unidades/i);
  });
});

describe("Punto de control de la Fase 1: autorización antes de comunicar precios", () => {
  it("sin autorización no se genera la propuesta para el cliente", async () => {
    const id = await crearCotizacion(cotizacionGandhi(recetaId));
    const res = await pdf(id, cookieVentas);
    expect(res.status).toBe(409);
    expect((await res.json()).codigo).toBe("SIN_AUTORIZACION");
  });

  it("ventas no puede autorizar su propia cotización; el responsable sí", async () => {
    const id = await crearCotizacion(cotizacionGandhi(recetaId));
    expect((await autorizar(id, cookieVentas)).status).toBe(403);

    expect((await autorizar(id, cookieAdmin)).status).toBe(200);
    const res = await pdf(id, cookieVentas);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");
  });

  it("si se edita después de autorizar, la autorización se cae y hay que revisarla otra vez", async () => {
    const id = await crearCotizacion(cotizacionGandhi(recetaId));
    await autorizar(id, cookieAdmin);
    expect((await pdf(id, cookieVentas)).status).toBe(200);

    const cambiada = cotizacionGandhi(recetaId);
    cambiada.entrada.operacion.diasDiseno = "5";
    await rutaCotizacion.PUT(
      peticion(`/api/cotizaciones/${id}`, { metodo: "PUT", cookie: cookieVentas, cuerpo: cambiada }),
      ctxId(id),
    );

    const [fila] = await db.select().from(cotizaciones).where(eq(cotizaciones.id, id));
    expect(fila.autorizadaEn).toBeNull();
    expect((await pdf(id, cookieVentas)).status).toBe(409);
  });
});

describe("Fases 2 y 3: correo y mensaje de WhatsApp", () => {
  const rutaMensajes = () => import("@/app/api/cotizaciones/[id]/mensajes/route");
  const pedirMensajes = async (id: string, cookie = cookieVentas) => {
    const ruta = await rutaMensajes();
    return ruta.POST(peticion(`/api/cotizaciones/${id}/mensajes`, { metodo: "POST", cookie, cuerpo: {} }), ctxId(id));
  };

  it("sin autorización no se redacta nada: el PNO prohíbe comunicar precios antes", async () => {
    const id = await crearCotizacion(cotizacionGandhi(recetaId));
    const res = await pedirMensajes(id);
    expect(res.status).toBe(409);
    expect((await res.json()).codigo).toBe("SIN_AUTORIZACION");
    expect(generar).not.toHaveBeenCalled();
  });

  it("le pasa a la IA los precios de venta y los datos del cliente, nunca los costos", async () => {
    const cuerpo = cotizacionGandhi(recetaId);
    cuerpo.cliente.puesto = "Jefa de Compras";
    cuerpo.entrada.propuesta = {
      noIncluye: "No incluye obra civil.",
      supuestos: "",
      vigenciaDias: "15",
      peticionAccion: "visita",
    };
    const id = await crearCotizacion(cuerpo);
    await autorizar(id, cookieAdmin);

    generar.mockResolvedValue({
      text: JSON.stringify({
        asunto: "Propuesta de señalética · Gandhi",
        correo: "Estimada Claudia P., Jefa de Compras: ...",
        whatsapp: "Le acabo de enviar la propuesta por correo...",
        preguntaTecnica: "¿Las tres áreas usan el mismo material?",
      }),
      candidates: [{}],
    });

    const res = await pedirMensajes(id);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      asunto: "Propuesta de señalética · Gandhi",
      preguntaTecnica: "¿Las tres áreas usan el mismo material?",
    });

    const [llamada] = generar.mock.calls[0] as [{ contents: { parts: { text: string }[] }[] }];
    const enviado = llamada.contents[0].parts[0].text;
    expect(enviado).toContain("Jefa de Compras");
    expect(enviado).toContain("NO incluye: No incluye obra civil.");
    expect(enviado).toContain("Vigencia: 15 días naturales");
    expect(enviado).toContain("PRECIOS DE VENTA");
    // El desglose interno jamás se manda: ni costos, ni márgenes, ni utilidades.
    expect(enviado).not.toMatch(/costo directo|margen|utilidad|consumibles|viáticos/i);
  });
});

describe("Fase 2: lo que la propuesta debe decir al cliente", () => {
  it("imprime lo que no incluye, los supuestos, la vigencia y la petición de acción", async () => {
    const cuerpo = cotizacionGandhi(recetaId);
    cuerpo.cliente.puesto = "Jefa de Compras";
    cuerpo.entrada.sitio = { retiroGraficosPrevios: true, notasSuperficie: "Muro con pintura descarapelada." };
    cuerpo.entrada.propuesta = {
      noIncluye: "No incluye retiro de señalización existente ni obra civil.",
      supuestos: "Metraje estimado sujeto a verificación en sitio.",
      vigenciaDias: "15",
      peticionAccion: "visita",
    };

    const id = await crearCotizacion(cuerpo);
    await autorizar(id, cookieAdmin);

    const res = await pdf(id, cookieVentas);
    const archivo = new Uint8Array(await res.arrayBuffer());
    const { text } = await extractText(await getDocumentProxy(archivo), { mergePages: true });
    const texto = (text as string).replace(/\s+/g, " ");

    expect(texto).toContain("No incluye");
    expect(texto).toContain("No incluye retiro de señalización existente ni obra civil.");
    expect(texto).toContain("Esta propuesta considera");
    expect(texto).toContain("Metraje estimado sujeto a verificación en sitio.");
    expect(texto).toContain("Vigencia de la propuesta: 15 días naturales.");
    expect(texto).toContain("agendamos una visita a sus instalaciones");
    // 7.3.8: el contacto va con su nombre y su puesto; 7.1.7: se anuncia el retiro de gráficos previos.
    expect(texto).toContain("Jefa de Compras");
    expect(texto).toContain("Incluye el retiro y acondicionamiento de los gráficos previos.");
    // El desglose de costos es interno: nunca viaja al cliente (PNO 7.2 y errores frecuentes).
    expect(texto).not.toContain("Costo directo");
    expect(texto).not.toContain("Margen");
  });
});
