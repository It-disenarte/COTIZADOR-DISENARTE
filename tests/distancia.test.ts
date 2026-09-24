import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { iniciarSesion, peticion } from "./helpers/http";

vi.mock("@/lib/db", async () => {
  const { crearDbPrueba } = await import("./helpers/db");
  return { db: await crearDbPrueba() };
});

const { crearPrimerAdmin } = await import("@/lib/servicios/configuracion-inicial");
const { lineaRectaKm } = await import("@/lib/mapas/osm");
const rutaDistancia = await import("@/app/api/distancia/route");

let cookie = "";
// OpenStreetMap simulado: nunca se llama a los servicios reales.
const fetchSimulado = vi.fn();
const fetchReal = globalThis.fetch;

const lugar = (display_name: string, lat: number, lon: number, addresstype = "house_number") => ({
  lat: String(lat),
  lon: String(lon),
  display_name,
  addresstype,
});

const json = (datos: unknown, status = 200) =>
  new Response(JSON.stringify(datos), { status, headers: { "content-type": "application/json" } });

const pedir = (cuerpo: unknown, cookieUsuario = cookie) =>
  rutaDistancia.POST(peticion("/api/distancia", { metodo: "POST", cookie: cookieUsuario, cuerpo }), undefined);

const llamada = (i: number) => fetchSimulado.mock.calls[i] as [string, RequestInit];

beforeAll(async () => {
  await crearPrimerAdmin({ nombre: "Admin", email: "admin@disenartemx.com", password: "Admin-Definitiva-2026" });
  cookie = await iniciarSesion("admin@disenartemx.com", "Admin-Definitiva-2026");
});

beforeEach(() => {
  vi.stubEnv("ORIGEN_COORDENADAS", "20.3882, -99.9965");
  vi.stubEnv("MAPAS_ESPERA_MS", "0");
  fetchSimulado.mockReset();
  vi.stubGlobal("fetch", fetchSimulado);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.stubGlobal("fetch", fetchReal);
});

describe("Km desde el taller, sin cuentas ni llaves", () => {
  it("busca la dirección en OpenStreetMap y traza la ruta en coche", async () => {
    fetchSimulado
      .mockResolvedValueOnce(
        json([
          lugar("371, Av. Universidad, Centro, Querétaro, México", 20.59, -100.39),
          lugar("Av. Universidad, Querétaro, México", 20.6, -100.4, "road"),
        ]),
      )
      .mockResolvedValueOnce(json({ routes: [{ distance: 58_640, duration: 3_150 }] }));

    const res = await pedir({ direccion: "Av. Universidad 371, Centro, Querétaro" });
    expect(res.status).toBe(200);
    const r = await res.json();
    expect(r).toMatchObject({ km: "58.6", minutos: 53, porCarretera: true, preciso: true, origenAproximado: false });
    expect(r.alternativas).toHaveLength(1);

    // Búsqueda: solo México y con un User-Agent que identifica a la app (lo pide su política de uso).
    const [urlBusqueda, opciones] = llamada(0);
    const url = new URL(urlBusqueda);
    expect(url.origin + url.pathname).toBe("https://nominatim.openstreetmap.org/search");
    expect(url.searchParams.get("countrycodes")).toBe("mx");
    expect((opciones.headers as Record<string, string>)["User-Agent"]).toContain("CotizadorDisenarte");

    // Ruta: del taller al destino, en [longitud, latitud].
    expect(llamada(1)[0]).toContain("/routed-car/route/v1/driving/-99.9965,20.3882;-100.39,20.59");
  });

  it("si el servicio de rutas no contesta, estima con la línea recta y lo avisa", async () => {
    fetchSimulado
      .mockResolvedValueOnce(json([lugar("Querétaro, México", 20.59, -100.39, "city")]))
      .mockResolvedValueOnce(json({ error: "unavailable" }, 500));

    const r = await (await pedir({ direccion: "Querétaro" })).json();
    expect(r.porCarretera).toBe(false);
    expect(r.minutos).toBeNull();
    // Línea recta por el factor de carretera (1.3).
    const recta = lineaRectaKm({ lat: 20.3882, lon: -99.9965 }, { lat: 20.59, lon: -100.39 });
    expect(Number(r.km)).toBeCloseTo(recta * 1.3, 1);
    // "city" no es una dirección exacta.
    expect(r.preciso).toBe(false);
  });

  it("al elegir una alternativa calcula directo a ese punto, sin volver a buscar", async () => {
    fetchSimulado.mockResolvedValueOnce(json({ routes: [{ distance: 60_000, duration: 3_600 }] }));
    const r = await (await pedir({ destino: { lat: 20.6, lon: -100.4, etiqueta: "Av. Universidad" } })).json();
    expect(fetchSimulado).toHaveBeenCalledTimes(1);
    expect(r).toMatchObject({ km: "60.0", minutos: 60, preciso: true, alternativas: [] });
  });

  it("sin coordenadas del taller, busca su dirección una vez y avisa que la salida es aproximada", async () => {
    vi.stubEnv("ORIGEN_COORDENADAS", "");
    fetchSimulado
      .mockResolvedValueOnce(json([lugar("371, Lomas del Pedregoso, San Juan del Río, México", 20.39, -99.99)]))
      .mockResolvedValueOnce(json([lugar("Destino, Querétaro", 20.59, -100.39)]))
      .mockResolvedValueOnce(json({ routes: [{ distance: 50_000, duration: 3_000 }] }));

    const r = await (await pedir({ direccion: "Av. Universidad 371, Querétaro" })).json();
    expect(r.origenAproximado).toBe(true);
    expect(new URL(llamada(0)[0]).searchParams.get("q")).toContain("Lomas del Pedregoso");
  });
});

describe("Errores claros", () => {
  it("dirección que no se encuentra → 404 con indicación de qué hacer", async () => {
    fetchSimulado.mockResolvedValueOnce(json([]));
    const res = await pedir({ direccion: "xyzxyz no existe" });
    expect(res.status).toBe(404);
    expect((await res.json()).error).toContain("captura los km a mano");
  });

  it("si OpenStreetMap limita las consultas, avisa con 429", async () => {
    fetchSimulado.mockResolvedValueOnce(json({ error: "too many requests" }, 429));
    const res = await pedir({ direccion: "Av. Universidad 371, Querétaro" });
    expect(res.status).toBe(429);
  });

  it("si la red falla al buscar la dirección, responde 502 sin romper la cotización", async () => {
    fetchSimulado.mockRejectedValueOnce(new TypeError("fetch failed"));
    expect((await pedir({ direccion: "Av. Universidad 371, Querétaro" })).status).toBe(502);
  });

  it("valida que haya dirección y exige sesión", async () => {
    expect((await pedir({ direccion: "Qro" })).status).toBe(400);
    expect((await pedir({ direccion: "Av. Universidad 371, Querétaro" }, "")).status).toBe(401);
    expect(fetchSimulado).not.toHaveBeenCalled();
  });
});

describe("Distancia en línea recta", () => {
  it("calcula la distancia entre dos puntos conocidos", () => {
    // San Juan del Río → Querétaro, unos 46 km en línea recta.
    const km = lineaRectaKm({ lat: 20.3882, lon: -99.9965 }, { lat: 20.5888, lon: -100.3899 });
    expect(km).toBeGreaterThan(40);
    expect(km).toBeLessThan(52);
    expect(lineaRectaKm({ lat: 20, lon: -100 }, { lat: 20, lon: -100 })).toBe(0);
  });
});
