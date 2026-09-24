import "server-only";
import { ErrorHttp } from "@/lib/errores";

/**
 * Kilómetros desde el taller usando los servicios públicos de OpenStreetMap.
 * No hay que crear cuenta ni llave: son los mismos que usa openstreetmap.org.
 *   - Nominatim  (buscar la dirección)
 *   - OSRM       (trazar la ruta en coche)
 * Son servicios donados: se usan de a poco (un botón que alguien presiona), se identifican
 * con un User-Agent propio y se deja al menos un segundo entre llamadas, como pide su
 * política de uso justo (https://operations.osmfoundation.org/policies/nominatim/).
 *
 * Variables de entorno (todas opcionales):
 *   ORIGEN_COORDENADAS  "latitud,longitud" del taller. Recomendada: sin ella se busca su dirección.
 *   CONTACTO_MAPAS      sitio o correo de contacto para el User-Agent (por defecto, el sitio de la empresa).
 */

const NOMINATIM = "https://nominatim.openstreetmap.org/search";
const OSRM = "https://routing.openstreetmap.de/routed-car/route/v1/driving";
/**
 * Photon, para las sugerencias mientras se escribe. Nominatim NO se puede usar para eso:
 * su política lo prohíbe expresamente ("you must not implement such a service").
 */
const PHOTON = "https://photon.komoot.io/api";
/** México, para no sugerir direcciones de otros países. */
const CAJA_MEXICO = "-118.6,14.3,-86.5,32.8";
const TIEMPO_MAXIMO_MS = 15_000;
/** Política de uso justo: máximo una consulta por segundo. MAPAS_ESPERA_MS solo se baja en pruebas. */
const esperaEntreLlamadasMs = () => Number(process.env.MAPAS_ESPERA_MS ?? 1_100);
/** Las sugerencias van tecleando: ritmo más corto, pero igual con freno. */
const ESPERA_SUGERENCIAS_MS = 300;
/** La carretera siempre es más larga que la línea recta; factor típico para México. */
const FACTOR_CARRETERA = 1.3;

export const DIRECCION_DISENARTE = "Avenida Lomas del Pedregoso 371, San Juan del Río, Querétaro, México";

export type Punto = { lat: number; lon: number };
export type Lugar = Punto & {
  etiqueta: string;
  /** "casa", "calle", "colonia", "ciudad"…: qué tan fino es el punto que encontró. */
  detalle: string;
  /** true si el punto es de una dirección concreta y no de toda una colonia o ciudad. */
  exacto: boolean;
};

const agente = () =>
  `CotizadorDisenarte/1.0 (+${process.env.CONTACTO_MAPAS?.trim() || "https://www.disenartemx.com"})`;

const ultimaLlamada = new Map<string, number>();
/** Deja pasar un tiempo entre consultas al mismo servicio, como pide su política de uso. */
async function esperarTurno(url: string, esperaMs: number) {
  const servicio = new URL(url).host;
  const falta = (ultimaLlamada.get(servicio) ?? 0) + esperaMs - Date.now();
  if (falta > 0) await new Promise((seguir) => setTimeout(seguir, falta));
  ultimaLlamada.set(servicio, Date.now());
}

async function pedir(url: string, obligatorio: boolean, esperaMs = esperaEntreLlamadasMs()): Promise<unknown> {
  await esperarTurno(url, esperaMs);
  let respuesta: Response;
  try {
    respuesta = await fetch(url, {
      headers: { "User-Agent": agente(), Accept: "application/json", "Accept-Language": "es-MX,es" },
      signal: AbortSignal.timeout(TIEMPO_MAXIMO_MS),
      cache: "no-store",
    });
  } catch {
    if (!obligatorio) return null;
    throw new ErrorHttp(502, "No se pudo consultar el mapa. Intenta de nuevo o captura los km a mano.", "MAPAS_FALLO");
  }
  if (!respuesta.ok) {
    if (!obligatorio) return null;
    if (respuesta.status === 429 || respuesta.status === 403) {
      throw new ErrorHttp(429, "El mapa está limitando las consultas. Espera un momento o captura los km a mano.", "MAPAS_LIMITE");
    }
    console.error("[mapas] respuesta", respuesta.status, url);
    throw new ErrorHttp(502, "El mapa respondió con un error. Captura los km a mano.", "MAPAS_FALLO");
  }
  return respuesta.json().catch(() => null);
}

type FilaNominatim = { lat?: string; lon?: string; display_name?: string; addresstype?: string; type?: string };

const DETALLES_EXACTOS = ["house_number", "building", "house", "road", "amenity", "shop", "industrial", "commercial"];

/** Busca una dirección en México. Devuelve varias opciones, de la más probable a la menos. */
export async function buscarDireccion(texto: string): Promise<Lugar[]> {
  const parametros = new URLSearchParams({ q: texto, format: "jsonv2", countrycodes: "mx", limit: "5" });
  const filas = ((await pedir(`${NOMINATIM}?${parametros}`, true)) ?? []) as FilaNominatim[];

  return filas
    .map((f) => {
      const detalle = f.addresstype ?? f.type ?? "";
      return {
        lat: Number(f.lat),
        lon: Number(f.lon),
        etiqueta: f.display_name ?? texto,
        detalle,
        exacto: DETALLES_EXACTOS.includes(detalle),
      };
    })
    .filter((l) => Number.isFinite(l.lat) && Number.isFinite(l.lon));
}

type RespuestaPhoton = {
  features?: {
    geometry?: { coordinates?: [number, number] };
    properties?: Record<string, string | undefined>;
  }[];
};

/** Arma "Calle 123, Colonia, Ciudad, Estado" con lo que traiga cada resultado. */
function etiquetaPhoton(p: Record<string, string | undefined>): string {
  const calle = [p.street, p.housenumber].filter(Boolean).join(" ");
  return [p.name, calle && calle !== p.name ? calle : null, p.district, p.city, p.state]
    .filter((parte, i, todas) => parte && todas.indexOf(parte) === i)
    .join(", ");
}

/**
 * Sugerencias mientras se escribe (Photon). Solo México y dando preferencia a lo cercano
 * al taller. Si el servicio falla, devuelve vacío: escribir nunca debe mostrar errores.
 */
export async function sugerirDirecciones(texto: string, cerca?: Punto): Promise<Lugar[]> {
  if (texto.trim().length < 4) return [];
  const parametros = new URLSearchParams({ q: texto, limit: "5", lang: "es", bbox: CAJA_MEXICO });
  if (cerca) {
    parametros.set("lat", String(cerca.lat));
    parametros.set("lon", String(cerca.lon));
    parametros.set("location_bias_scale", "0.3");
  }

  const datos = (await pedir(`${PHOTON}?${parametros}`, false, ESPERA_SUGERENCIAS_MS)) as RespuestaPhoton | null;
  return (datos?.features ?? [])
    .map((f) => {
      const p = f.properties ?? {};
      const [lon, lat] = f.geometry?.coordinates ?? [];
      return {
        lat,
        lon,
        etiqueta: etiquetaPhoton(p),
        detalle: p.osm_value ?? p.osm_key ?? "",
        exacto: Boolean(p.housenumber) || Boolean(p.street),
      };
    })
    .filter((l): l is Lugar => Number.isFinite(l.lat) && Number.isFinite(l.lon) && l.etiqueta !== "");
}

/** Distancia en línea recta, en kilómetros (fórmula del haversine). */
export function lineaRectaKm(a: Punto, b: Punto): number {
  const radio = 6371;
  const rad = (grados: number) => (grados * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * radio * Math.asin(Math.min(1, Math.sqrt(h)));
}

type RespuestaOsrm = { routes?: { distance?: number; duration?: number }[] };

/**
 * Kilómetros y minutos manejando, de un solo trayecto. Si el servicio de rutas no
 * contesta, se estima con la línea recta por un factor, avisando que es aproximado.
 */
export async function distanciaEnCoche(
  desde: Punto,
  hasta: Punto,
): Promise<{ km: number; minutos: number | null; porCarretera: boolean }> {
  // OSRM usa [longitud, latitud].
  const url = `${OSRM}/${desde.lon},${desde.lat};${hasta.lon},${hasta.lat}?overview=false`;
  const datos = (await pedir(url, false)) as RespuestaOsrm | null;
  const ruta = datos?.routes?.[0];

  if (ruta && typeof ruta.distance === "number") {
    return { km: ruta.distance / 1000, minutos: ruta.duration ? Math.round(ruta.duration / 60) : null, porCarretera: true };
  }
  return { km: lineaRectaKm(desde, hasta) * FACTOR_CARRETERA, minutos: null, porCarretera: false };
}

let origenEnMemoria: Promise<Punto> | null = null;

/** Punto de salida: el taller de Diseñarte. */
export function origenDisenarte(): Promise<Punto> {
  const fijo = process.env.ORIGEN_COORDENADAS?.trim();
  if (fijo) {
    const [lat, lon] = fijo.split(",").map((v) => Number(v.trim()));
    if (Number.isFinite(lat) && Number.isFinite(lon)) return Promise.resolve({ lat, lon });
    throw new ErrorHttp(503, "ORIGEN_COORDENADAS debe tener el formato 'latitud,longitud'.", "MAPAS_ORIGEN");
  }
  // Sin coordenadas fijas se busca la dirección del taller una vez y se reutiliza.
  origenEnMemoria ??= buscarDireccion(DIRECCION_DISENARTE).then((lugares) => {
    if (!lugares[0]) {
      throw new ErrorHttp(502, "No se encontró la dirección del taller. Captura ORIGEN_COORDENADAS.", "MAPAS_ORIGEN");
    }
    return { lat: lugares[0].lat, lon: lugares[0].lon };
  });
  origenEnMemoria.catch(() => {
    origenEnMemoria = null;
  });
  return origenEnMemoria;
}
