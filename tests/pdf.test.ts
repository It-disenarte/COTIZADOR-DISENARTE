import { eq } from "drizzle-orm";
import { extractText, getDocumentProxy } from "unpdf";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { ctxId, iniciarSesion, peticion } from "./helpers/http";

vi.mock("@/lib/db", async () => {
  const { crearDbPrueba } = await import("./helpers/db");
  return { db: await crearDbPrueba() };
});

const { db } = await import("@/lib/db");
const { insumos, parametros, recetas } = await import("@/lib/db/schema");
const { crearPrimerAdmin } = await import("@/lib/servicios/configuracion-inicial");
const { nombreArchivo } = await import("@/lib/pdf/documento");
const rutaCotizaciones = await import("@/app/api/cotizaciones/route");
const rutaPdf = await import("@/app/api/cotizaciones/[id]/pdf/route");

const ADMIN = { nombre: "Erick Medina", email: "admin@disenartemx.com", password: "Admin-Definitiva-2026" };
let cookie = "";
let cotizacionId = "";

/** La cotización de Gandhi: 169 piezas en tres áreas, con dos items de reventa. */
function cotizacionGandhi(recetaId: string) {
  return {
    titulo: "Señalética protección civil",
    solicitante: "Claudia P.",
    cliente: {
      nombreContacto: "Claudia P.",
      empresa: "Gandhi",
      correo: "claudia@ejemplo.mx",
      telefono: "",
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
      tiempoEstimado: "5-7 días",
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

async function textoDelPdf(archivo: Uint8Array) {
  const pdf = await getDocumentProxy(archivo);
  const { text } = await extractText(pdf, { mergePages: true });
  return { texto: text as string, paginas: pdf.numPages };
}

beforeAll(async () => {
  await crearPrimerAdmin(ADMIN);
  cookie = await iniciarSesion(ADMIN.email, ADMIN.password);

  await db.update(parametros).set({ valor: "24.50" }).where(eq(parametros.clave, "precio_gasolina_litro"));
  await db.update(insumos).set({ costo: "95", unidadCosto: "m2" }).where(eq(insumos.nombre, "Estireno cal. 40 blanco"));
  await db.update(insumos).set({ anchoUtilM: "1.52" }).where(eq(insumos.nombre, "Impresión JV33 vinil blanco"));

  const [receta] = await db.select().from(recetas).where(eq(recetas.nombre, "Estireno cal. 40 + impresión"));
  const res = await rutaCotizaciones.POST(
    peticion("/api/cotizaciones", { metodo: "POST", cookie, cuerpo: cotizacionGandhi(receta.id) }),
    undefined,
  );
  expect(res.status).toBe(201);
  cotizacionId = (await res.json()).id;
});

describe("Criterio de la fase 5: el PDF de la propuesta", () => {
  it("se descarga como PDF con la nomenclatura del despacho", async () => {
    const res = await rutaPdf.GET(peticion(`/api/cotizaciones/${cotizacionId}/pdf`, { cookie }), ctxId(cotizacionId));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");

    const disposicion = res.headers.get("content-disposition") ?? "";
    expect(disposicion).toMatch(/^attachment; filename="COT-\d{8}-01_Senaletica_proteccion_civil_-_Claudia_P\.pdf"$/);
  });

  it("pesa menos de 5 MB y trae todas las páginas de la propuesta", async () => {
    const res = await rutaPdf.GET(peticion(`/api/cotizaciones/${cotizacionId}/pdf`, { cookie }), ctxId(cotizacionId));
    const archivo = new Uint8Array(await res.arrayBuffer());

    expect(archivo.byteLength).toBeLessThan(5 * 1024 * 1024);
    expect(new TextDecoder().decode(archivo.slice(0, 5))).toBe("%PDF-");

    // Portada, bienvenidos, por qué, proceso, consolidado, la opción, reventa y condiciones.
    const { paginas } = await textoDelPdf(archivo);
    expect(paginas).toBeGreaterThanOrEqual(8);
  });

  it("incluye portada, consolidado, precios y condiciones comerciales", async () => {
    const res = await rutaPdf.GET(peticion(`/api/cotizaciones/${cotizacionId}/pdf`, { cookie }), ctxId(cotizacionId));
    const { texto } = await textoDelPdf(new Uint8Array(await res.arrayBuffer()));

    // Portada
    expect(texto).toContain("PROPUESTA ECONÓMICA");
    expect(texto).toContain("SEÑALÉTICA PROTECCIÓN CIVIL");
    expect(texto).toContain("Claudia P.");
    expect(texto).toContain("Erick Medina");
    expect(texto).toMatch(/COT-\d{8}-01/);

    // Páginas fijas
    expect(texto).toContain("Bienvenidos");
    expect(texto).toContain("¿Por qué Diseñarte México?");
    expect(texto).toContain("Proceso de trabajo");
    expect(texto).toContain("Condiciones comerciales");
    expect(texto).toContain("70% de anticipo y 30% al entregar");

    // Consolidado y cotización
    expect(texto).toContain("Consolidado del levantamiento: 169 piezas");
    expect(texto).toContain("CENDI");
    expect(texto).toContain("Estireno cal. 40 + impresión");
    expect(texto).toContain("5-7 días");
    expect(texto).toContain("Precios sin IVA");
    expect(texto).toContain("Materiales adicionales");
    expect(texto).toContain("Detector de humo autónomo 9V");

    // Datos de contacto y bancarios del pie
    expect(texto).toContain("ventas@disenartemx.com");
    expect(texto).toContain("BBVA BANCOMER");
  });

  it("lleva la leyenda del diseño, obligatoria en cada página de cotización", async () => {
    const res = await rutaPdf.GET(peticion(`/api/cotizaciones/${cotizacionId}/pdf`, { cookie }), ctxId(cotizacionId));
    const { texto } = await textoDelPdf(new Uint8Array(await res.arrayBuffer()));
    expect(texto).toContain("El diseño presentado es un apoyo visual");
    expect(texto).toContain("cada pieza se autoriza antes de producción");
  });

  it("los importes del PDF son los mismos que calculó el motor", async () => {
    const detalle = await (await import("@/app/api/cotizaciones/[id]/route")).GET(
      peticion(`/api/cotizaciones/${cotizacionId}`, { cookie }),
      ctxId(cotizacionId),
    );
    const { cotizacion } = await detalle.json();
    const variante = cotizacion.resultado.opciones[0].variantes[0];

    const res = await rutaPdf.GET(peticion(`/api/cotizaciones/${cotizacionId}/pdf`, { cookie }), ctxId(cotizacionId));
    const { texto } = await textoDelPdf(new Uint8Array(await res.arrayBuffer()));

    const pesos = (valor: string) => new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(Number(valor));
    // El espacio de los miles que usa Intl no siempre sobrevive a la extracción de texto.
    const sinEspacios = texto.replace(/\s/g, "");
    expect(sinEspacios).toContain(pesos(variante.total).replace(/\s/g, ""));
    expect(sinEspacios).toContain(pesos(variante.subtotal).replace(/\s/g, ""));
  });

  it("respeta los permisos: otro vendedor no puede descargarla", async () => {
    const rutaUsuarios = await import("@/app/api/usuarios/route");
    const rutaCuentaPassword = await import("@/app/api/cuenta/password/route");
    await rutaUsuarios.POST(
      peticion("/api/usuarios", {
        metodo: "POST",
        cookie,
        cuerpo: { nombre: "Otro", email: "otro@disenartemx.com", rol: "ventas", passwordTemporal: "Temporal-1234567" },
      }),
      undefined,
    );
    const cookieOtro = await iniciarSesion("otro@disenartemx.com", "Temporal-1234567");
    await rutaCuentaPassword.POST(
      peticion("/api/cuenta/password", {
        metodo: "POST",
        cookie: cookieOtro,
        cuerpo: { actual: "Temporal-1234567", nueva: "Definitiva-1234567" },
      }),
      undefined,
    );

    const res = await rutaPdf.GET(
      peticion(`/api/cotizaciones/${cotizacionId}/pdf`, { cookie: cookieOtro }),
      ctxId(cotizacionId),
    );
    expect(res.status).toBe(403);
  });
});

describe("Nombre del archivo", () => {
  it("quita acentos y caracteres raros, y usa guion bajo", () => {
    expect(nombreArchivo({ folio: "COT-14092026-01", titulo: "Señalética protección civil", solicitante: "Claudia P." })).toBe(
      "COT-14092026-01_Senaletica_proteccion_civil_-_Claudia_P.pdf",
    );
  });

  it("funciona sin solicitante", () => {
    expect(nombreArchivo({ folio: "COT-14092026-02", titulo: "Rotulación flotilla", solicitante: null })).toBe(
      "COT-14092026-02_Rotulacion_flotilla.pdf",
    );
  });
});
