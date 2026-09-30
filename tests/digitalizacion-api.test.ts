import { eq } from "drizzle-orm";
import { extractText, getDocumentProxy } from "unpdf";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ctxId, iniciarSesion, peticion } from "./helpers/http";

// Gemini simulado: nunca se llama a la API real.
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
const { cotizaciones, serviciosDigitales } = await import("@/lib/db/schema");
const { crearPrimerAdmin } = await import("@/lib/servicios/configuracion-inicial");
const { leerBrief } = await import("@/lib/cotizador/brief");
const rutaCotizaciones = await import("@/app/api/cotizaciones/route");
const rutaCotizacion = await import("@/app/api/cotizaciones/[id]/route");
const rutaAutorizar = await import("@/app/api/cotizaciones/[id]/autorizar/route");
const rutaPdf = await import("@/app/api/cotizaciones/[id]/pdf/route");
const rutaDuplicar = await import("@/app/api/cotizaciones/[id]/duplicar/route");
const rutaServicios = await import("@/app/api/servicios-digitales/route");
const rutaBrief = await import("@/app/api/ia/brief/route");

let cookie = "";
let nextLevel: typeof serviciosDigitales.$inferSelect;

function cotizacionDigital(cambios: Record<string, unknown> = {}) {
  return {
    tipo: "digital",
    titulo: "Página web Zafiro Dental",
    solicitante: "Emilio Vázquez",
    cliente: { nombreContacto: "Emilio Vázquez", puesto: "Director clínico", empresa: "Zafiro Clínica Dental", correo: "", telefono: "", direccion: "", kmDesdeSjr: "", zona: "local", notas: "" },
    entrada: {
      tipo: "digital",
      modalidadWeb: "ambas",
      lineas: [
        {
          id: "web",
          servicioId: nextLevel.id,
          nombre: nextLevel.nombre,
          descripcion: nextLevel.incluye,
          cobro: "paquete",
          cantidad: "1",
          precio: nextLevel.precio,
          precioMensual: nextLevel.precioMensual,
          activacion: nextLevel.activacion,
          mesesRenta: "12",
          tiempoEntrega: nextLevel.tiempoEntrega,
        },
        { id: "extra", servicioId: null, nombre: "Página adicional: Casos antes y después", cobro: "unico", cantidad: "1", precio: "2500" },
      ],
      anticipoPct: "70",
      promociones: [
        { id: "p1", nombre: "Promoción #1 por pago de contado", descuentoPct: "10", regalo: "Capacitación del proyecto", validaHasta: "2099-12-31", activa: true },
      ],
      tiempoEstimado: "",
      alcance: { concepto: "Sitio web corporativo para clínica dental", resumen: "Sitio con 4 páginas, formulario y SEO básico." },
      propuesta: { noIncluye: "Sesión de fotografía o video.", supuestos: "", vigenciaDias: "15" },
      brief: null,
      ...cambios,
    },
  };
}

const crear = async (cuerpo: unknown) =>
  rutaCotizaciones.POST(peticion("/api/cotizaciones", { metodo: "POST", cookie, cuerpo }), undefined);

beforeAll(async () => {
  await crearPrimerAdmin({ nombre: "Mishell Ledesma", email: "admin@disenartemx.com", password: "Admin-Definitiva-2026" });
  cookie = await iniciarSesion("admin@disenartemx.com", "Admin-Definitiva-2026");
  [nextLevel] = await db.select().from(serviciosDigitales).where(eq(serviciosDigitales.nombre, 'Página web "Next Level"'));
});

beforeEach(() => {
  vi.stubEnv("GEMINI_API_KEY", "llave-de-prueba");
  vi.stubEnv("GEMINI_LIMITE_HORA", "1000");
  generar.mockReset();
});

describe("Catálogo de servicios digitales", () => {
  it("trae los tres paquetes con los precios vigentes y los extras con precio por capturar", async () => {
    const res = await rutaServicios.GET(peticion("/api/servicios-digitales", { cookie }), undefined);
    const { servicios, iva } = await res.json();
    expect(iva).toBe("0.1600");
    const porNombre = (n: string) => servicios.find((s: { nombre: string }) => s.nombre === n);
    expect(porNombre('Página web "Hola Mundo"')).toMatchObject({ cobro: "paquete", precio: "13804.0000", precioMensual: "870.0000", activacion: "3364.0000" });
    expect(porNombre('Página web "Rockstar Digital"')).toMatchObject({ precio: "27724.0000", precioMensual: "1392.0000", activacion: "11020.0000" });
    expect(porNombre("Logotipo")).toMatchObject({ cobro: "unico", precio: null });
    expect(porNombre("Manejo de redes sociales")).toMatchObject({ cobro: "mensual", precio: null });
  });

  it("un servicio escrito a mano se guarda en el catálogo para futuros proyectos", async () => {
    const res = await rutaServicios.POST(
      peticion("/api/servicios-digitales", {
        metodo: "POST",
        cookie,
        cuerpo: { nombre: "Módulo de reservas en línea", categoria: "Web a la medida", cobro: "unico", precio: "6500", incluye: "Calendario de citas" },
      }),
      undefined,
    );
    expect(res.status).toBe(201);
    expect((await res.json()).servicio).toMatchObject({ nombre: "Módulo de reservas en línea", precio: "6500.0000" });
  });
});

describe("Cotización de Digitalización", () => {
  it("se guarda como digital y calcula renta y dueño con los precios de lista", async () => {
    const res = await crear(cotizacionDigital());
    expect(res.status).toBe(201);
    const datos = await res.json();
    expect(datos.pendiente).toBeNull();
    const [renta, dueno] = datos.resultado.escenarios;
    expect(renta.renta).toMatchObject({ activacion: "7540.00", mensualidad: "1102.00" });
    expect(renta.unico.subtotal).toBe("2500.00"); // solo la página extra: el paquete va en renta
    expect(dueno.unico.subtotal).toBe("23264.00"); // paquete como dueño + página extra
    const [fila] = await db.select().from(cotizaciones).where(eq(cotizaciones.id, datos.id));
    expect(fila.tipo).toBe("digital");
  });

  it("guarda el borrador sin servicios y avisa qué falta, con el paso del asistente digital", async () => {
    const res = await crear(cotizacionDigital({ lineas: [] }));
    expect(res.status).toBe(201);
    expect((await res.json()).pendiente).toBe("Servicios: Agrega al menos un servicio.");
  });

  it("un servicio con precio por capturar se guarda, pero no se puede autorizar", async () => {
    const res = await crear(
      cotizacionDigital({ lineas: [{ id: "logo", servicioId: null, nombre: "Logotipo", cobro: "unico", cantidad: "1", precio: "" }] }),
    );
    const { id, pendiente } = await res.json();
    expect(pendiente).toMatch(/Falta el precio de "Logotipo"/);
    const autorizado = await rutaAutorizar.POST(peticion(`/api/cotizaciones/${id}/autorizar`, { metodo: "POST", cookie, cuerpo: {} }), ctxId(id));
    expect(autorizado.status).toBe(409);
  });

  it("no deja cambiar una cotización física a digital", async () => {
    const { id } = await (await crear(cotizacionDigital())).json();
    const res = await rutaCotizacion.PUT(
      peticion(`/api/cotizaciones/${id}`, { metodo: "PUT", cookie, cuerpo: { ...cotizacionDigital(), tipo: "fisica", entrada: undefined } }),
      ctxId(id),
    );
    expect(res.status).toBe(400);
  });

  it("autorizada, genera el PDF con renta, dueño, promoción y lo que no incluye; nunca costos", async () => {
    const { id } = await (await crear(cotizacionDigital())).json();
    await rutaAutorizar.POST(peticion(`/api/cotizaciones/${id}/autorizar`, { metodo: "POST", cookie, cuerpo: {} }), ctxId(id));
    const res = await rutaPdf.GET(peticion(`/api/cotizaciones/${id}/pdf`, { cookie }), ctxId(id));
    expect(res.status).toBe(200);
    const { text } = await extractText(await getDocumentProxy(new Uint8Array(await res.arrayBuffer())), { mergePages: true });
    const texto = (text as string).replace(/\s+/g, " ");
    expect(texto).toContain("Propuesta presupuestaria");
    expect(texto).toContain("Modalidad renta");
    expect(texto).toContain("Modalidad dueño");
    expect(texto).toContain("Activación inicial");
    expect(texto).toContain("Promoción #1 por pago de contado: 10% de descuento");
    expect(texto).toContain("+ CAPACITACIÓN DEL PROYECTO");
    expect(texto).toContain("Sesión de fotografía o video.");
    expect(texto).toContain("Condiciones comerciales");
    expect(texto).toContain("Entregables"); // lleva página web
    expect(texto).not.toMatch(/costo directo|margen|utilidad/i);
  });

  it("aparece en la lista con lo que se paga al contratar, y se duplica como digital", async () => {
    const { id } = await (await crear(cotizacionDigital({ modalidadWeb: "renta" }))).json();
    const lista = await (await rutaCotizaciones.GET(peticion("/api/cotizaciones", { cookie }), undefined)).json();
    const enLista = lista.cotizaciones.find((c: { id: string }) => c.id === id);
    expect(enLista.tipo).toBe("digital");
    expect(enLista.total).toBe("10440.00"); // activación $7,540 + página extra $2,500 + IVA $400

    const copia = await (await rutaDuplicar.POST(peticion(`/api/cotizaciones/${id}/duplicar`, { metodo: "POST", cookie, cuerpo: {} }), ctxId(id))).json();
    const [fila] = await db.select().from(cotizaciones).where(eq(cotizaciones.id, copia.id));
    expect(fila.tipo).toBe("digital");
  });
});

describe("Brief del cliente", () => {
  const CSV = [
    'Marca temporal,"Nombre del negocio, tal cual quieres que aparezca en la página",¿Cómo andas de logo?,Describe tu negocio en 4 a 6 renglones',
    '22/8/2026 12:14:05,Panadería La Espiga Dorada,"No tengo absolutamente nada, necesito que me hagan un logo","Panadería familiar.',
    'Horneamos con masa madre, sin conservadores."',
    "18/9/2026 17:03:43,SEMIR,Tengo mi logo en archivo,Mantenimiento industrial",
  ].join("\n");

  it("lee el CSV de Google Forms con comas y saltos de línea dentro de las respuestas", () => {
    const { clientes } = leerBrief(CSV);
    expect(clientes.map((c) => c.etiqueta)).toEqual(["Panadería La Espiga Dorada · 22/8/2026 12:14:05", "SEMIR · 18/9/2026 17:03:43"]);
    expect(clientes[0].respuestas.find((r) => r.pregunta.startsWith("Describe"))?.respuesta).toBe(
      "Panadería familiar.\nHorneamos con masa madre, sin conservadores.",
    );
  });

  it("la IA propone paquete y extras solo del catálogo, y descarta lo que no existe", async () => {
    const servicios = (await (await rutaServicios.GET(peticion("/api/servicios-digitales", { cookie }), undefined)).json()).servicios
      .filter((s: { archivado: boolean }) => !s.archivado)
      .sort((a: { categoria: string; nombre: string }, b: { categoria: string; nombre: string }) =>
        a.categoria.localeCompare(b.categoria) || a.nombre.localeCompare(b.nombre),
      );
    const numero = (nombre: string) => servicios.findIndex((s: { nombre: string }) => s.nombre === nombre) + 1;

    generar.mockResolvedValue({
      text: JSON.stringify({
        paquete: numero('Página web "Hola Mundo"'),
        extras: [
          { numero: numero("Logotipo"), motivo: "No tiene logo y pidió cotizarlo." },
          { numero: 999, motivo: "Inventado" },
          { numero: numero('Página web "Next Level"'), motivo: "No debería entrar: es otro paquete" },
        ],
        concepto: "Página web para panadería artesanal",
        resumen: "Sitio de una página con productos, galería y contacto por WhatsApp.",
        noIncluye: ["Fotografía profesional de producto"],
        supuestos: ["El cliente entregará sus textos"],
      }),
      candidates: [{}],
    });

    const { clientes } = leerBrief(CSV);
    const res = await rutaBrief.POST(
      peticion("/api/ia/brief", { metodo: "POST", cookie, cuerpo: { archivo: "Hola Mundo.csv", respuestas: clientes[0].respuestas } }),
      undefined,
    );
    expect(res.status).toBe(200);
    const propuesta = await res.json();
    expect(propuesta.paqueteId).toBe(servicios[numero('Página web "Hola Mundo"') - 1].id);
    expect(propuesta.extras.map((e: { nombre: string }) => e.nombre)).toEqual(["Logotipo"]);
    // La IA no manda precios: solo servicios del catálogo.
    expect(JSON.stringify(propuesta)).not.toMatch(/\$\s?\d/);
  });
});
