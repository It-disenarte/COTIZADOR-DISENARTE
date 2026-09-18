import { eq } from "drizzle-orm";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { iniciarSesion, peticion } from "./helpers/http";

// Gemini simulado: cada prueba decide qué responde. Nunca se llama a la API real.
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
const { llamadasIa } = await import("@/lib/db/schema");
const { crearPrimerAdmin } = await import("@/lib/servicios/configuracion-inicial");
const { MODELO_PREDETERMINADO, extraerJson } = await import("@/lib/ia/gemini");
const { fusionarLevantamiento } = await import("@/lib/cotizador/estado");
const rutaLevantamiento = await import("@/app/api/ia/levantamiento/route");
const rutaReventa = await import("@/app/api/ia/reventa/route");
const rutaAlcance = await import("@/app/api/ia/alcance/route");
const rutaUsuarios = await import("@/app/api/usuarios/route");
const rutaCuentaPassword = await import("@/app/api/cuenta/password/route");

let cookie = "";

const respuesta = (datos: unknown, extra: Record<string, unknown> = {}) => ({
  text: typeof datos === "string" ? datos : JSON.stringify(datos),
  candidates: [extra],
});

function subirLevantamiento(archivo: File, { cabecera = true, instruccion = "" } = {}) {
  const formulario = new FormData();
  formulario.append("archivo", archivo);
  formulario.append("instruccion", instruccion);
  const headers = new Headers({ cookie });
  if (cabecera) headers.set("x-cotizador", "1");
  return rutaLevantamiento.POST(
    new Request("http://localhost:3000/api/ia/levantamiento", { method: "POST", headers, body: formulario }),
    undefined,
  );
}

const pdfFalso = () => new File([new TextEncoder().encode("%PDF-1.7 levantamiento") as BlobPart], "anexo.pdf", { type: "application/pdf" });

const PEDIR_ALCANCE = {
  titulo: "Señalética protección civil",
  areas: ["CENDI", "Primaria", "Secundaria"],
  piezas: "169",
  recetas: [{ nombre: "Estireno cal. 40 + impresión", descripcion: "Estireno calibre 40 rígido blanco" }],
  tiempoEstimado: "5-7 días",
  incluyeEnvio: true,
  incluyeInstalacion: false,
};

const pedirAlcance = (cookieUsuario = cookie) =>
  rutaAlcance.POST(peticion("/api/ia/alcance", { metodo: "POST", cookie: cookieUsuario, cuerpo: PEDIR_ALCANCE }), undefined);

beforeAll(async () => {
  await crearPrimerAdmin({ nombre: "Admin", email: "admin@disenartemx.com", password: "Admin-Definitiva-2026" });
  cookie = await iniciarSesion("admin@disenartemx.com", "Admin-Definitiva-2026");
});

beforeEach(() => {
  vi.stubEnv("GEMINI_API_KEY", "llave-de-prueba");
  vi.stubEnv("GEMINI_MODEL", "");
  vi.stubEnv("GEMINI_LIMITE_HORA", "1000");
  generar.mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("Sin llave de Gemini", () => {
  it("avisa que la IA no está configurada y no llama a nada", async () => {
    vi.stubEnv("GEMINI_API_KEY", "");
    const res = await pedirAlcance();
    expect(res.status).toBe(503);
    expect((await res.json()).codigo).toBe("IA_SIN_CONFIGURAR");
    expect(generar).not.toHaveBeenCalled();
  });
});

describe("9.1 Leer levantamiento", () => {
  it("normaliza la tabla: medidas en metros como texto y una cantidad por área", async () => {
    generar.mockResolvedValue(
      respuesta({
        areas: ["CENDI", "Primaria"],
        filas: [
          { concepto: "SALIDA", anchoM: 0.2, altoM: 0.4, cantidades: [2, 24], confianza: 0.95 },
          { concepto: "EXTINTOR", anchoM: 0.2, altoM: 0.25, cantidades: [3], confianza: 0.5 },
        ],
        notas: ["La fila de extintor está borrosa."],
      }),
    );

    const res = await subirLevantamiento(pdfFalso(), { instruccion: "solo señalética" });
    expect(res.status).toBe(200);
    const leido = await res.json();
    expect(leido.areas).toEqual(["CENDI", "Primaria"]);
    expect(leido.filas[0]).toMatchObject({ concepto: "SALIDA", anchoM: "0.2", altoM: "0.4", cantidades: ["2", "24"] });
    // Le faltaba la cantidad de Primaria: se completa con 0 para que cuadre la tabla.
    expect(leido.filas[1].cantidades).toEqual(["3", "0"]);
    expect(leido.filas[1].confianza).toBe(0.5);
    expect(leido.notas).toEqual(["La fila de extintor está borrosa."]);

    const [llamada] = generar.mock.calls[0] as [Record<string, never>];
    const { model, contents, config } = llamada as unknown as {
      model: string;
      contents: { parts: { inlineData?: { mimeType: string }; text?: string }[] }[];
      config: { responseMimeType: string; responseJsonSchema: unknown; tools?: unknown };
    };
    expect(model).toBe(MODELO_PREDETERMINADO);
    expect(contents[0].parts[0].inlineData?.mimeType).toBe("application/pdf");
    expect(contents[0].parts[1].text).toContain("solo señalética");
    expect(config.responseMimeType).toBe("application/json");
    expect(config.responseJsonSchema).toBeTruthy();
    expect(config.tools).toBeUndefined();
  });

  it("si no hay reparto por áreas, usa una sola llamada General", async () => {
    generar.mockResolvedValue(
      respuesta({ areas: [], filas: [{ concepto: "Fotomural", anchoM: 3, altoM: 2.4, cantidades: [1], confianza: 0.9 }], notas: [] }),
    );
    const leido = await (await subirLevantamiento(pdfFalso())).json();
    expect(leido.areas).toEqual(["General"]);
    expect(leido.filas[0].cantidades).toEqual(["1"]);
  });

  it("registra la llamada sin guardar el archivo", async () => {
    generar.mockResolvedValue(
      respuesta({ areas: ["A"], filas: [{ concepto: "X", anchoM: 0, altoM: 0, cantidades: [1], confianza: 1 }], notas: [] }),
    );
    await subirLevantamiento(pdfFalso());
    const filas = await db.select().from(llamadasIa).where(eq(llamadasIa.tarea, "levantamiento"));
    const ultima = filas.at(-1)!;
    expect(ultima.exito).toBe(true);
    expect(ultima.modelo).toBe(MODELO_PREDETERMINADO);
    expect(ultima.entrada).toMatchObject({ archivo: "anexo.pdf", tipo: "application/pdf" });
    expect(JSON.stringify(ultima.entrada)).not.toContain("JVBER"); // el PDF en base64 no se guarda
  });

  it("exige la cabecera x-cotizador y solo acepta PDF o imagen", async () => {
    expect((await subirLevantamiento(pdfFalso(), { cabecera: false })).status).toBe(400);
    const texto = new File(["hola"], "notas.txt", { type: "text/plain" });
    expect((await subirLevantamiento(texto)).status).toBe(415);
    expect(generar).not.toHaveBeenCalled();
  });

  it("si la IA responde algo que no cumple el esquema, no se usa y queda registrado", async () => {
    generar.mockResolvedValue(respuesta({ areas: ["A"], filas: [{ concepto: "X", anchoM: -5 }] }));
    const res = await subirLevantamiento(pdfFalso());
    expect(res.status).toBe(502);
    expect((await res.json()).codigo).toBe("IA_RESPUESTA_INVALIDA");
    const filas = await db.select().from(llamadasIa).where(eq(llamadasIa.exito, false));
    expect(filas.length).toBeGreaterThan(0);
  });

  it("si Gemini falla (red, cuota), responde 502 con un mensaje claro", async () => {
    generar.mockRejectedValue(new Error("RESOURCE_EXHAUSTED"));
    const res = await subirLevantamiento(pdfFalso());
    expect(res.status).toBe(502);
    expect((await res.json()).error).toContain("captura a mano");
  });
});

describe("9.2 Precio de referencia de reventa", () => {
  it("usa búsqueda de Google y pone primero las fuentes que devolvió la búsqueda", async () => {
    generar.mockResolvedValue(
      respuesta(
        "```json\n" +
          JSON.stringify({
            nombre: "Detector de humo 9V",
            precioReferencia: 179.9,
            fuentes: [{ titulo: "Otra tienda", url: "https://otra.mx/detector" }, { titulo: "sin link", url: "no-es-url" }],
            notas: "Precio con IVA.",
          }) +
          "\n```",
        { groundingMetadata: { groundingChunks: [{ web: { title: "homedepot.com.mx", uri: "https://homedepot.com.mx/detector" } }] } },
      ),
    );

    const res = await rutaReventa.POST(
      peticion("/api/ia/reventa", { metodo: "POST", cookie, cuerpo: { nombre: "Detector de humo autónomo 9V" } }),
      undefined,
    );
    expect(res.status).toBe(200);
    const precio = await res.json();
    expect(precio.precioReferencia).toBe("179.9");
    expect(precio.notas).toBe("Precio con IVA.");
    expect(precio.fuentes.map((f: { url: string }) => f.url)).toEqual([
      "https://homedepot.com.mx/detector",
      "https://otra.mx/detector",
    ]);

    const [llamada] = generar.mock.calls[0] as [{ config: { tools: unknown[] } }];
    expect(llamada.config.tools).toEqual([{ googleSearch: {} }]);
  });

  it("valida que venga el nombre del artículo", async () => {
    const res = await rutaReventa.POST(peticion("/api/ia/reventa", { metodo: "POST", cookie, cuerpo: { nombre: "" } }), undefined);
    expect(res.status).toBe(400);
    expect(generar).not.toHaveBeenCalled();
  });
});

describe("9.3 Redactar alcance", () => {
  it("devuelve concepto y resumen, sin el prefijo 'Concepto:' y con los datos de la cotización", async () => {
    generar.mockResolvedValue(
      respuesta({ concepto: "Concepto: Señalética para protección civil", resumen: "Señalética completa para CENDI, Primaria y Secundaria." }),
    );
    const res = await pedirAlcance();
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      concepto: "Señalética para protección civil",
      resumen: "Señalética completa para CENDI, Primaria y Secundaria.",
    });

    const [llamada] = generar.mock.calls[0] as [{ contents: { parts: { text: string }[] }[] }];
    const texto = llamada.contents[0].parts[0].text;
    expect(texto).toContain("CENDI, Primaria, Secundaria");
    expect(texto).toContain("Estireno calibre 40 rígido blanco");
    expect(texto).toContain("Incluye instalación: no");
  });

  it("respeta el modelo configurado en GEMINI_MODEL", async () => {
    vi.stubEnv("GEMINI_MODEL", "gemini-2.5-flash");
    generar.mockResolvedValue(respuesta({ concepto: "A", resumen: "B" }));
    await pedirAlcance();
    expect((generar.mock.calls[0] as [{ model: string }])[0].model).toBe("gemini-2.5-flash");
  });
});

describe("Límite por usuario", () => {
  /** Vendedor nuevo: empieza con el contador de llamadas en cero. */
  async function vendedorNuevo(email: string) {
    await rutaUsuarios.POST(
      peticion("/api/usuarios", {
        metodo: "POST",
        cookie,
        cuerpo: { nombre: "Ventas", email, rol: "ventas", passwordTemporal: "Temporal-1234567" },
      }),
      undefined,
    );
    const temporal = await iniciarSesion(email, "Temporal-1234567");
    await rutaCuentaPassword.POST(
      peticion("/api/cuenta/password", {
        metodo: "POST",
        cookie: temporal,
        cuerpo: { actual: "Temporal-1234567", nueva: "Definitiva-1234567" },
      }),
      undefined,
    );
    return iniciarSesion(email, "Definitiva-1234567");
  }

  it("corta al llegar a GEMINI_LIMITE_HORA llamadas en una hora, contando también las fallidas", async () => {
    const cookieVentas = await vendedorNuevo("ventas@disenartemx.com");
    const cookieOtra = await vendedorNuevo("ventas2@disenartemx.com");

    vi.stubEnv("GEMINI_LIMITE_HORA", "2");
    generar.mockResolvedValueOnce(respuesta({ concepto: "A", resumen: "B" }));
    generar.mockRejectedValueOnce(new Error("fallo"));

    expect((await pedirAlcance(cookieVentas)).status).toBe(200);
    expect((await pedirAlcance(cookieVentas)).status).toBe(502);
    const tercera = await pedirAlcance(cookieVentas);
    expect(tercera.status).toBe(429);
    expect((await tercera.json()).error).toContain("2 consultas");
    expect(generar).toHaveBeenCalledTimes(2);

    // El límite es por persona: otra vendedora sigue pudiendo.
    generar.mockResolvedValueOnce(respuesta({ concepto: "A", resumen: "B" }));
    expect((await pedirAlcance(cookieOtra)).status).toBe(200);
  });
});

describe("Utilidades", () => {
  it("extraerJson tolera respuestas envueltas en ```json", () => {
    expect(extraerJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(extraerJson('Aquí está: {"a":2} listo')).toEqual({ a: 2 });
    expect(() => extraerJson("sin datos")).toThrow();
  });

  it("fusionarLevantamiento junta áreas por nombre y agrega las nuevas como columnas", () => {
    const actual = {
      areas: ["CENDI", "Primaria"],
      filas: [
        { concepto: "SALIDA", anchoM: "0.2", altoM: "0.4", cantidades: ["2", "24"] },
        { concepto: "", anchoM: "0", altoM: "0", cantidades: ["", ""] },
      ],
    };
    const nuevo = {
      areas: ["primaria", "Secundaria"],
      filas: [{ concepto: "EXTINTOR", anchoM: "0.2", altoM: "0.25", cantidades: ["6", "13"] }],
    };
    expect(fusionarLevantamiento(actual, nuevo)).toEqual({
      areas: ["CENDI", "Primaria", "Secundaria"],
      filas: [
        { concepto: "SALIDA", anchoM: "0.2", altoM: "0.4", cantidades: ["2", "24", ""] },
        { concepto: "EXTINTOR", anchoM: "0.2", altoM: "0.25", cantidades: ["", "6", "13"] },
      ],
    });
  });
});

