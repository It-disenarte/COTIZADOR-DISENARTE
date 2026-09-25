import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { iniciarSesion, peticion } from "./helpers/http";

vi.mock("@/lib/db", async () => {
  const { crearDbPrueba } = await import("./helpers/db");
  return { db: await crearDbPrueba() };
});

const { crearPrimerAdmin } = await import("@/lib/servicios/configuracion-inicial");
const { leerCoordenadas, lineaRectaKm, olvidarOrigen } = await import("@/lib/mapas/osm");
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
  // Cada prueba parte sin el punto del taller guardado en memoria.
  olvidarOrigen();
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

describe("Sugerencias mientras se escribe", () => {
  const rutaSugerencias = () => import("@/app/api/distancia/sugerencias/route");
  const sugerir = async (q: string) => {
    const ruta = await rutaSugerencias();
    return ruta.GET(peticion(`/api/distancia/sugerencias?q=${encodeURIComponent(q)}`, { cookie }), undefined);
  };

  it("usa Photon (Nominatim prohíbe el autocompletado) y arma la dirección legible", async () => {
    fetchSimulado.mockResolvedValueOnce(
      json({
        features: [
          {
            geometry: { coordinates: [-100.39, 20.59] },
            properties: {
              name: "Parque Industrial Querétaro",
              street: "Av. Universidad",
              housenumber: "123",
              city: "Querétaro",
              state: "Querétaro",
              osm_key: "place",
              osm_value: "industrial",
            },
          },
          {
            geometry: { coordinates: [-100.4, 20.6] },
            properties: { name: "Querétaro", city: "Querétaro", state: "Querétaro", osm_value: "city" },
          },
        ],
      }),
    );

    const { sugerencias } = await (await sugerir("Av. Universidad 123, Quer")).json();
    expect(sugerencias).toHaveLength(2);
    expect(sugerencias[0]).toMatchObject({
      etiqueta: "Parque Industrial Querétaro, Av. Universidad 123, Querétaro",
      lat: 20.59,
      lon: -100.39,
      exacto: true,
    });
    // Una ciudad no es una dirección exacta: se marca para que la persona lo note.
    expect(sugerencias[1].exacto).toBe(false);

    const url = new URL(llamada(0)[0]);
    expect(url.origin + url.pathname).toBe("https://photon.komoot.io/api");
    expect(url.searchParams.get("bbox")).toBe("-118.6,14.3,-86.5,32.8");
    expect(url.searchParams.get("limit")).toBe("5");
    expect(url.searchParams.get("lat")).toBe("20.3882");
    // Photon solo acepta default/en/de/fr: con "es" rechaza la consulta entera (HTTP 400)
    // y no llega ninguna sugerencia. Este fue un error real en producción.
    expect(url.searchParams.get("lang")).toBe("default");
  });

  it("si el servicio rechaza la consulta, lo reporta para poder avisar en pantalla", async () => {
    fetchSimulado.mockResolvedValueOnce(json({ message: "bad request" }, 400));
    const { sugerencias, disponible } = await (await sugerir("Av. Universidad")).json();
    expect(sugerencias).toEqual([]);
    expect(disponible).toBe(false);
  });

  it("no consulta nada si aún se escribieron menos de 4 letras", async () => {
    const { sugerencias, disponible } = await (await sugerir("Av")).json();
    expect(sugerencias).toEqual([]);
    expect(disponible).toBe(true);
    expect(fetchSimulado).not.toHaveBeenCalled();
  });

  it("si el servicio falla, devuelve lista vacía en vez de un error", async () => {
    fetchSimulado.mockRejectedValueOnce(new TypeError("fetch failed"));
    const res = await sugerir("Av. Universidad");
    expect(res.status).toBe(200);
    expect((await res.json()).sugerencias).toEqual([]);
  });
});

describe("Punto de salida (el taller)", () => {
  const sugerir = async (q: string) => {
    const ruta = await import("@/app/api/distancia/sugerencias/route");
    return ruta.GET(peticion(`/api/distancia/sugerencias?q=${encodeURIComponent(q)}`, { cookie }), undefined);
  };

  it("lee las coordenadas como se copian de un mapa, aunque traigan grados o vengan al revés", () => {
    expect(leerCoordenadas("20.3882, -99.9965")).toEqual({ lat: 20.3882, lon: -99.9965 });
    expect(leerCoordenadas("20.3882,-99.9965")).toEqual({ lat: 20.3882, lon: -99.9965 });
    expect(leerCoordenadas("20.3882° -99.9965°")).toEqual({ lat: 20.3882, lon: -99.9965 });
    // Longitud primero: se acomoda sola.
    expect(leerCoordenadas("-99.9965, 20.3882")).toEqual({ lat: 20.3882, lon: -99.9965 });
    expect(leerCoordenadas("San Juan del Río")).toBeNull();
    expect(leerCoordenadas("20.3882")).toBeNull();
  });

  it("si las coordenadas están mal escritas, no se queda sin referencia: usa el respaldo y lo reporta", async () => {
    vi.stubEnv("ORIGEN_COORDENADAS", "quién sabe");
    // Falla también la búsqueda de la dirección del taller; luego la búsqueda y su reintento.
    fetchSimulado
      .mockResolvedValueOnce(json([]))
      .mockResolvedValueOnce(json({ features: [] }))
      .mockResolvedValueOnce(json({ features: [] }));

    const { origen } = await (await sugerir("Av. Universidad")).json();
    expect(origen).toBe("respaldo");
    // Lo importante: la consulta de sugerencias SÍ llevó punto de referencia.
    const url = new URL(llamada(1)[0]);
    expect(url.searchParams.get("lat")).toBe("20.3882");
    expect(url.searchParams.get("location_bias_scale")).toBe("0.3");
  });

  it("con las coordenadas configuradas, las sugerencias se sesgan a esa zona", async () => {
    fetchSimulado.mockResolvedValue(json({ features: [] }));
    const { origen } = await (await sugerir("Av. Universidad")).json();
    expect(origen).toBe("configurado");
    expect(new URL(llamada(0)[0]).searchParams.get("lon")).toBe("-99.9965");
  });

  it("si no hay nada cerca, vuelve a buscar agregando la ciudad del taller", async () => {
    // Primera búsqueda: solo resultados lejanos (Nuevo León).
    fetchSimulado
      .mockResolvedValueOnce(
        json({
          features: [
            {
              geometry: { coordinates: [-100.3, 25.67] },
              properties: { name: "Calle Francisco Pacheco", city: "Monterrey", state: "Nuevo León" },
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        json({
          features: [
            {
              geometry: { coordinates: [-99.96, 20.38] },
              properties: { name: "Avenida Francia", city: "San Juan del Río", state: "Querétaro", street: "Avenida Francia" },
            },
          ],
        }),
      );

    const { sugerencias } = await (await sugerir("Francia 142")).json();
    expect(fetchSimulado).toHaveBeenCalledTimes(2);
    // El número no se manda (en México el mapa casi no los tiene) y el reintento lleva la ciudad.
    expect(new URL(llamada(0)[0]).searchParams.get("q")).toBe("Francia");
    expect(new URL(llamada(1)[0]).searchParams.get("q")).toBe("Francia San Juan del Río, Querétaro");
    // Primero lo que sí dice "Francia" y está cerca; la coincidencia aproximada queda al final.
    expect(sugerencias[0].etiqueta).toContain("Avenida Francia");
    expect(sugerencias[0].kmAprox).toBeLessThan(5);
    expect(sugerencias[1].etiqueta).toContain("Francisco Pacheco");
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
