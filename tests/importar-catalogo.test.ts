import { eq } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { iniciarSesion, peticion } from "./helpers/http";
import { crearXlsx } from "./helpers/xlsx";

// Gemini simulado: cada prueba decide qué "leyó" la IA. Nunca se llama a la API real.
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
const { insumos } = await import("@/lib/db/schema");
const { crearPrimerAdmin } = await import("@/lib/servicios/configuracion-inicial");
const { buscarCoincidencia, claveImportacion, normalizar, similitud } = await import("@/lib/importacion/coincidencias");
const rutaImportar = await import("@/app/api/catalogo/importar/route");
const rutaAplicar = await import("@/app/api/catalogo/importar/aplicar/route");
const rutaUsuarios = await import("@/app/api/usuarios/route");
const rutaCuentaPassword = await import("@/app/api/cuenta/password/route");

let cookie = "";
let cookieVentas = "";

/** El formato de "Actualización de costos": secciones con título, encabezado y renglones. */
const EXCEL_DISENARTE = crearXlsx([
  {
    nombre: "COSTO PRIMO DE MAQUILA",
    filas: [
      ["Corte de vinil"],
      ["Material", "Precio de compra", "Inflación de 5%", "Costo Material / ML", "Depreciación", "Preparación", "Sub total", "IVA 16%", "Costo"],
      ["Vinil de corte 1.22", 4100, 4305, 86.1, 5.48, 18.77, 110.35, null, 110.35],
      ["Vinil holográfico 1.22", 5000, 5250, 105, 5.48, 18.77, 129.25, null, 129.25],
      [null],
      ["Impresión Mimaki JV33-160BS (Basico)"],
      ["Material", "Precio de compra", "Inflación de 5%", "Costo Material / ML", "Depreciación", "Preparación", "Tintas por ML", "Sub total"],
      ["Lona Umag", 1300, 1365, 27.3, 12.68, 18.77, 122.35, 181.1],
    ],
  },
  { nombre: "COSTO DE TINTAS UV", filas: [["Calculadora"], ["Precio de botella", 2932.5]] },
]);

const renglonIa = (datos: Record<string, unknown>) => ({
  hoja: "COSTO PRIMO DE MAQUILA",
  fila: 0,
  seccion: "",
  nombre: "",
  costo: 0,
  columnaCosto: "Sub total",
  unidad: "ml",
  anchoUtilM: 0,
  coincideCon: "",
  confianza: 0.95,
  nota: "",
  ...datos,
});

const respuestaIa = (filas: Record<string, unknown>[], notas: string[] = []) => ({
  text: JSON.stringify({ filas: filas.map(renglonIa), notas }),
  candidates: [{}],
});

function subir(bytes: Uint8Array, { nombre = "costos.xlsx", tipo = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", cookieUsuario = cookie } = {}) {
  const formulario = new FormData();
  formulario.append("archivo", new File([bytes as BlobPart], nombre, { type: tipo }));
  return rutaImportar.POST(
    new Request("http://localhost:3000/api/catalogo/importar", {
      method: "POST",
      headers: { cookie: cookieUsuario, "x-cotizador": "1" },
      body: formulario,
    }),
    undefined,
  );
}

const aplicar = (cuerpo: unknown, cookieUsuario = cookie) =>
  rutaAplicar.POST(peticion("/api/catalogo/importar/aplicar", { metodo: "POST", cookie: cookieUsuario, cuerpo }), undefined);

async function insumoPorNombre(nombre: string) {
  const [fila] = await db.select().from(insumos).where(eq(insumos.nombre, nombre));
  return fila;
}

beforeAll(async () => {
  await crearPrimerAdmin({ nombre: "Admin", email: "admin@disenartemx.com", password: "Admin-Definitiva-2026" });
  cookie = await iniciarSesion("admin@disenartemx.com", "Admin-Definitiva-2026");

  await rutaUsuarios.POST(
    peticion("/api/usuarios", {
      metodo: "POST",
      cookie,
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

beforeEach(() => {
  vi.stubEnv("GEMINI_API_KEY", "llave-de-prueba");
  vi.stubEnv("GEMINI_LIMITE_HORA", "1000");
  generar.mockReset();
});

describe("Analizar el Excel de costos de Diseñarte", () => {
  it("propone cambios con el número exacto de la celda y descarta precios que no están en el Excel", async () => {
    generar.mockResolvedValue(
      respuestaIa(
        [
          { fila: 3, seccion: "Corte de vinil", nombre: "Vinil de corte 1.22", costo: 110.35, coincideCon: "Vinil de corte 1.22" },
          { fila: 4, seccion: "Corte de vinil", nombre: "Vinil holográfico 1.22", costo: 129.25, anchoUtilM: 1.22 },
          { fila: 8, seccion: "Impresión Mimaki JV33-160BS (Basico)", nombre: "Lona Umag", costo: 181.1 },
          // Número inventado: no existe en la fila 3.
          { fila: 3, seccion: "Corte de vinil", nombre: "Vinil fantasma", costo: 999 },
        ],
        ["La hoja de tintas UV es una calculadora; se ignoró."],
      ),
    );

    const res = await subir(EXCEL_DISENARTE);
    expect(res.status).toBe(200);
    const propuesta = await res.json();

    expect(propuesta.tipo).toBe("excel");
    expect(propuesta.descartados).toBe(1);
    expect(propuesta.renglones.map((r: { nombre: string }) => r.nombre)).toEqual([
      "Vinil de corte 1.22",
      "Vinil holográfico 1.22",
      "Lona Umag",
    ]);
    expect(propuesta.notas.join(" ")).toContain("descartaron");

    const [vinil, holografico, lona] = propuesta.renglones;
    const vinilActual = await insumoPorNombre("Vinil de corte 1.22");

    expect(vinil).toMatchObject({
      costo: "110.35",
      unidad: "ml",
      verificado: true,
      accionSugerida: "actualizar",
      origen: { hoja: "COSTO PRIMO DE MAQUILA", fila: 3, columna: "G", encabezado: "Sub total" },
    });
    expect(vinil.coincidencia).toMatchObject({ insumoId: vinilActual.id, metodo: "ia", unidadActual: "ml" });
    expect(vinil.coincidencia.cambio).toBeCloseTo((110.35 - Number(vinilActual.costo)) / Number(vinilActual.costo), 6);

    // No existe en el catálogo y la IA está segura: se propone crearlo, con su ancho de rollo.
    expect(holografico).toMatchObject({ coincidencia: null, accionSugerida: "crear", anchoUtilM: "1.22" });

    // "Lona Umag" de la sección JV33 se relaciona por nombre con "Impresión JV33 lona Umag", no con la de UV.
    const lonaJv33 = await insumoPorNombre("Impresión JV33 lona Umag");
    expect(lona.coincidencia).toMatchObject({ insumoId: lonaJv33.id, metodo: "similitud" });
    expect(lona.avisos.join(" ")).toContain("nombre parecido");

    // La IA recibió el Excel como texto, con filas y columnas, y la lista del catálogo.
    const [llamada] = generar.mock.calls[0] as [{ contents: { parts: { text?: string }[] }[] }];
    const partes = llamada.contents[0].parts.map((p) => p.text ?? "").join("\n");
    expect(partes).toContain('### Hoja "COSTO PRIMO DE MAQUILA"');
    expect(partes).toContain("3: A=Vinil de corte 1.22");
    expect(partes).toContain("- Impresión JV33 lona Umag");
  });

  it("no preselecciona un renglón si la unidad no coincide con la del catálogo", async () => {
    generar.mockResolvedValue(
      respuestaIa([{ fila: 3, seccion: "Corte de vinil", nombre: "Vinil de corte 1.22", costo: 110.35, unidad: "m2", coincideCon: "Vinil de corte 1.22" }]),
    );
    const { renglones } = await (await subir(EXCEL_DISENARTE)).json();
    expect(renglones[0].accionSugerida).toBe("ignorar");
    expect(renglones[0].avisos.join(" ")).toContain("no es la del catálogo");
  });

  it("aplica solo lo confirmado y recuerda la relación para la siguiente importación", async () => {
    const vinil = await insumoPorNombre("Vinil de corte 1.22");
    const clave = claveImportacion("Corte de vinil", "Vinil de corte 1.22");

    const res = await aplicar({
      archivo: "costos.xlsx",
      cambios: [
        { accion: "actualizar", insumoId: vinil.id, costo: "110.35", unidadCosto: "ml", anchoUtilM: "", clave },
        {
          accion: "crear",
          nombre: "Vinil holográfico 1.22",
          categoria: "Vinil de corte",
          costo: "129.25",
          unidadCosto: "ml",
          anchoUtilM: "1.22",
          clave: claveImportacion("Corte de vinil", "Vinil holográfico 1.22"),
        },
      ],
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ actualizados: 1, creados: 1 });

    const despues = await insumoPorNombre("Vinil de corte 1.22");
    expect(despues.costo).toBe("110.3500");
    expect(despues.fuente).toContain("Importación: costos.xlsx");
    expect(despues.clavesImportacion).toEqual([clave]);
    const nuevo = await insumoPorNombre("Vinil holográfico 1.22");
    expect(nuevo).toMatchObject({ costo: "129.2500", unidadCosto: "ml", anchoUtilM: "1.2200", categoria: "Vinil de corte" });

    // La siguiente vez se reconoce por la clave guardada, aunque la IA no sugiera nada.
    generar.mockResolvedValue(respuestaIa([{ fila: 3, seccion: "Corte de vinil", nombre: "Vinil de corte 1.22", costo: 110.35 }]));
    const { renglones } = await (await subir(EXCEL_DISENARTE)).json();
    expect(renglones[0].coincidencia).toMatchObject({ insumoId: vinil.id, metodo: "memoria" });
    // Mismo costo que el catálogo: no hay nada que cambiar.
    expect(renglones[0].accionSugerida).toBe("ignorar");
    expect(renglones[0].avisos[0]).toContain("Sin cambios");

    // Aplicar otra vez la misma clave no la duplica.
    await aplicar({
      archivo: "costos.xlsx",
      cambios: [{ accion: "actualizar", insumoId: vinil.id, costo: "110.35", unidadCosto: "ml", anchoUtilM: "", clave }],
    });
    expect((await insumoPorNombre("Vinil de corte 1.22")).clavesImportacion).toEqual([clave]);
  });

  it("si un insumo ya no existe, no aplica nada (todo o nada)", async () => {
    const antes = await insumoPorNombre("Impresión JV33 lona Umag");
    const res = await aplicar({
      archivo: "costos.xlsx",
      cambios: [
        { accion: "actualizar", insumoId: antes.id, costo: "999", unidadCosto: "ml", anchoUtilM: "", clave: "x" },
        { accion: "actualizar", insumoId: "00000000-0000-4000-8000-000000000000", costo: "1", unidadCosto: "ml", anchoUtilM: "", clave: "y" },
      ],
    });
    expect(res.status).toBe(404);
    expect((await insumoPorNombre("Impresión JV33 lona Umag")).costo).toBe(antes.costo);
  });

  it("exige la unidad de cada renglón que se aplica", async () => {
    const vinil = await insumoPorNombre("Vinil de corte 1.22");
    const res = await aplicar({
      archivo: "costos.xlsx",
      cambios: [{ accion: "actualizar", insumoId: vinil.id, costo: "1", unidadCosto: "", anchoUtilM: "", clave: "x" }],
    });
    expect(res.status).toBe(400);
  });
});

describe("Listas de proveedores en PDF", () => {
  it("usa lo que leyó la IA pero lo marca como no comprobado", async () => {
    generar.mockResolvedValue(
      respuestaIa([{ hoja: "", fila: 0, seccion: "Láminas", nombre: "Estireno cal 40 bco", costo: 185.5, unidad: "lamina" }]),
    );
    const pdf = new TextEncoder().encode("%PDF-1.7 lista de precios");
    const res = await subir(pdf, { nombre: "proveedor.pdf", tipo: "application/pdf" });
    expect(res.status).toBe(200);
    const { tipo, renglones } = await res.json();

    expect(tipo).toBe("documento");
    expect(renglones[0]).toMatchObject({ costo: "185.5", verificado: false });
    expect(renglones[0].avisos.join(" ")).toContain("compara el precio");
    // "Estireno cal 40 bco" se relaciona con "Estireno cal. 40 blanco".
    const estireno = await insumoPorNombre("Estireno cal. 40 blanco");
    expect(renglones[0].coincidencia?.insumoId).toBe(estireno.id);

    const [llamada] = generar.mock.calls[0] as [{ contents: { parts: { inlineData?: { mimeType: string } }[] }[] }];
    expect(llamada.contents[0].parts[0].inlineData?.mimeType).toBe("application/pdf");
  });

  it("rechaza archivos que no son Excel, PDF ni imagen", async () => {
    const res = await subir(new TextEncoder().encode("a,b,c"), { nombre: "costos.csv", tipo: "text/csv" });
    expect(res.status).toBe(415);
    expect(generar).not.toHaveBeenCalled();
  });
});

describe("Permisos", () => {
  it("ventas puede ver el catálogo pero no importar ni aplicar", async () => {
    expect((await subir(EXCEL_DISENARTE, { cookieUsuario: cookieVentas })).status).toBe(403);
    const vinil = await insumoPorNombre("Vinil de corte 1.22");
    const res = await aplicar(
      { archivo: "x.xlsx", cambios: [{ accion: "actualizar", insumoId: vinil.id, costo: "1", unidadCosto: "ml", anchoUtilM: "", clave: "x" }] },
      cookieVentas,
    );
    expect(res.status).toBe(403);
    expect(generar).not.toHaveBeenCalled();
  });
});

describe("Relacionar nombres", () => {
  it("normaliza acentos, mayúsculas y signos", () => {
    expect(normalizar("  Acrílico 6 mm. (Sencillo) ")).toBe("acrilico 6 mm sencillo");
    expect(normalizar("Vinil 1.22")).toBe("vinil 1.22");
  });

  it("da parecido alto a abreviaturas y bajo a materiales distintos", () => {
    expect(similitud("Estireno cal 40 bco", "Estireno cal. 40 blanco")).toBeGreaterThan(0.75);
    expect(similitud("Acrílico 6 mm Sencillo", "Acrílico 6 mm corte láser sencillo")).toBeGreaterThan(0.75);
    expect(similitud("Lona Umag", "Trovicel 3 mm")).toBeLessThan(0.4);
  });

  it("no relaciona materiales distintos aunque los nombres se parezcan", () => {
    const catalogo = [
      { id: "corte", nombre: "Vinil de corte 1.22", clavesImportacion: [] },
      { id: "acr6", nombre: "Acrílico 6 mm corte láser sencillo", clavesImportacion: [] },
      { id: "est", nombre: "Estireno cal. 40 blanco", clavesImportacion: [] },
    ];
    // Palabra distintiva que no está en el catálogo → no hay coincidencia (se ofrece como nuevo).
    expect(buscarCoincidencia({ seccion: "Corte de vinil", nombre: "Vinil holográfico 1.22", sugerenciaIa: null }, catalogo)).toBeNull();
    // Medida distinta → no hay coincidencia.
    expect(buscarCoincidencia({ seccion: "Láser", nombre: "Acrílico 3 mm Sencillo", sugerenciaIa: null }, catalogo)).toBeNull();
    // Abreviaturas sí.
    expect(buscarCoincidencia({ seccion: null, nombre: "Estireno cal 40 bco", sugerenciaIa: null }, catalogo)?.insumoId).toBe("est");
    expect(buscarCoincidencia({ seccion: "Láser", nombre: "Acrílico 6 mm Sencillo", sugerenciaIa: null }, catalogo)?.insumoId).toBe("acr6");
  });

  it("la memoria de importaciones gana sobre la IA y sobre el parecido", () => {
    const catalogo = [
      { id: "a", nombre: "Vinil blanco", clavesImportacion: [claveImportacion("JV33", "Vinil B")] },
      { id: "b", nombre: "Vinil B", clavesImportacion: [] },
    ];
    expect(buscarCoincidencia({ seccion: "JV33", nombre: "Vinil B", sugerenciaIa: "Vinil B" }, catalogo)).toMatchObject({
      insumoId: "a",
      metodo: "memoria",
    });
    // Una sugerencia de la IA que no existe en el catálogo se ignora.
    expect(buscarCoincidencia({ seccion: null, nombre: "Algo raro", sugerenciaIa: "No existe" }, catalogo)).toBeNull();
  });
});
