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
/** De dónde salió el punto de salida: la variable de entorno, la búsqueda, o el respaldo. */
export type FuenteOrigen = "configurado" | "buscado" | "respaldo";
export type Lugar = Punto & {
  /** Distancia en línea recta al taller, redondeada. Solo informativa. */
  kmAprox?: number | null;
  /** Ciudad y estado que reportó el mapa; sirven para saber si la persona ya los escribió. */
  ciudad?: string;
  estado?: string;
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

/**
 * Una consulta al mapa. Todo lo inesperado (red caída, respuesta rara, JSON mal formado)
 * termina aquí: si la consulta es obligatoria se convierte en un error con mensaje claro,
 * y si no, en null. Nunca se escapa un error suelto que tumbe la petición.
 */
async function pedir(url: string, obligatorio: boolean, esperaMs = esperaEntreLlamadasMs()): Promise<unknown> {
  const fallo = (estado: 429 | 502, mensaje: string, codigo: string) => {
    if (!obligatorio) return null;
    throw new ErrorHttp(estado, mensaje, codigo);
  };

  try {
    await esperarTurno(url, esperaMs);
    const respuesta = await fetch(url, {
      headers: { "User-Agent": agente(), Accept: "application/json", "Accept-Language": "es-MX,es" },
      signal: AbortSignal.timeout(TIEMPO_MAXIMO_MS),
      cache: "no-store",
    });

    if (!respuesta.ok) {
      if (respuesta.status === 429 || respuesta.status === 403) {
        return fallo(429, "El mapa está limitando las consultas. Espera un momento o captura los km a mano.", "MAPAS_LIMITE");
      }
      console.error("[mapas] respuesta", respuesta.status, url);
      return fallo(502, "El mapa respondió con un error. Captura los km a mano.", "MAPAS_FALLO");
    }
    return await respuesta.json().catch(() => null);
  } catch (error) {
    if (error instanceof ErrorHttp) throw error;
    console.error("[mapas] no se pudo consultar", url, error instanceof Error ? error.message : error);
    return fallo(502, "No se pudo consultar el mapa. Intenta de nuevo o captura los km a mano.", "MAPAS_FALLO");
  }
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
/** Ciudad del taller, para reintentar una búsqueda que no trajo nada cercano. */
const CIUDAD_TALLER = "San Juan del Río, Querétaro";
/** Más lejos que esto no se considera "de la zona". */
const RADIO_CERCANIA_KM = 100;

/**
 * Quita los números de calle: en México OpenStreetMap casi no los tiene, y dejarlos hace que
 * la búsqueda se vaya a otras ciudades donde sí existen ("Av. Universidad 142" devolvía
 * Celaya y Tepic; sin el número, San Juan del Río). Se conservan los que son parte del
 * nombre ("Calle 5 de Mayo", "Carretera 57") porque van pegados a una palabra clave.
 */
export function limpiarParaBuscar(texto: string): string {
  const palabras = texto.trim().split(/\s+/);
  if (palabras.length < 2) return texto.trim();

  const claves = /^(carretera|km|kil[oó]metro|calle|avenida|av\.?|blvd\.?|boulevard|eje|circuito)$/i;
  const limpio = palabras.filter((palabra, i) => {
    const esNumero = /^#?\d{1,5}[a-z]?$/i.test(palabra);
    const despuesDeClave = i > 0 && claves.test(palabras[i - 1]);
    return !esNumero || despuesDeClave;
  });
  return (limpio.length ? limpio : palabras).join(" ");
}

export async function sugerirDirecciones(
  texto: string,
  cerca?: Punto,
): Promise<{ lugares: Lugar[]; disponible: boolean }> {
  if (texto.trim().length < 4) return { lugares: [], disponible: true };
  const base = limpiarParaBuscar(texto);

  const primera = await consultarPhoton(base, cerca);
  if (!primera) return { lugares: [], disponible: false };

  // Si nada quedó cerca del taller, se busca otra vez agregando la ciudad: así aparecen las
  // calles locales, que es lo más común ("Francia" existe en San Juan del Río, pero el mapa
  // respondía "Francisco" de Guanajuato).
  const hayCercanos = cerca && primera.some((l) => lineaRectaKm(cerca, l) <= RADIO_CERCANIA_KM);
  const locales = cerca && !hayCercanos ? ((await consultarPhoton(`${base} ${CIUDAD_TALLER}`, cerca)) ?? []) : [];

  const vistos = new Set<string>();
  const lugares = [...primera, ...locales]
    .filter((l) => {
      const clave = `${l.lat.toFixed(5)},${l.lon.toFixed(5)},${l.etiqueta}`;
      return vistos.has(clave) ? false : (vistos.add(clave), true);
    })
    .map((l) => ({
      ...l,
      kmAprox: cerca ? Math.round(lineaRectaKm(cerca, l)) : null,
      coincide: coincideConLoEscrito(base, l),
    }))
    // Primero lo que sí contiene lo que se escribió; entre iguales, lo más cercano al taller.
    // Así "Francia" muestra la de San Juan del Río antes que la del Estado de México, y
    // "Avenida Tulum Cancún" muestra Cancún aunque esté a 1,300 km.
    .sort((a, b) => Number(b.coincide) - Number(a.coincide) || (a.kmAprox ?? 0) - (b.kmAprox ?? 0))
    .slice(0, 6)
    .map((l) => ({ lat: l.lat, lon: l.lon, etiqueta: l.etiqueta, detalle: l.detalle, exacto: l.exacto, ciudad: l.ciudad, estado: l.estado, kmAprox: l.kmAprox }));

  return { lugares, disponible: true };
}

const sinAcentos = (t: string) =>
  t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/**
 * ¿La sugerencia contiene de verdad las palabras que se escribieron? El mapa responde con
 * coincidencias aproximadas ("Francia" → "Francisco"), y esas deben quedar hasta abajo.
 */
export function coincideConLoEscrito(consulta: string, lugar: Lugar): boolean {
  const palabras = sinAcentos(consulta)
    .split(/[^a-z0-9]+/)
    .filter((p) => p.length >= 4);
  if (palabras.length === 0) return true;

  const etiqueta = sinAcentos(`${lugar.etiqueta} ${lugar.ciudad ?? ""} ${lugar.estado ?? ""}`);
  return palabras.every((p) => new RegExp(`\\b${p}`).test(etiqueta));
}

/** Una consulta a Photon. Devuelve null si el servicio falló. */
async function consultarPhoton(texto: string, cerca?: Punto): Promise<Lugar[] | null> {
  // OJO: Photon solo acepta lang default, en, de y fr. Con "es" rechaza toda la consulta
  // (HTTP 400) y no llega ninguna sugerencia. "default" devuelve los nombres locales.
  const parametros = new URLSearchParams({ q: texto, limit: "5", lang: "default", bbox: CAJA_MEXICO });
  if (cerca) {
    parametros.set("lat", String(cerca.lat));
    parametros.set("lon", String(cerca.lon));
    parametros.set("location_bias_scale", "0.3");
  }

  const datos = (await pedir(`${PHOTON}?${parametros}`, false, ESPERA_SUGERENCIAS_MS)) as RespuestaPhoton | null;
  if (datos === null) return null;

  return (datos.features ?? [])
    .map((f): Lugar => {
      const p = f.properties ?? {};
      const [lon, lat] = f.geometry?.coordinates ?? [Number.NaN, Number.NaN];
      return {
        lat,
        lon,
        etiqueta: etiquetaPhoton(p),
        detalle: p.osm_value ?? p.osm_key ?? "",
        ciudad: p.city ?? p.district ?? "",
        estado: p.state ?? "",
        exacto: Boolean(p.housenumber) || Boolean(p.street),
      };
    })
    .filter((l) => Number.isFinite(l.lat) && Number.isFinite(l.lon) && l.etiqueta !== "");
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

/**
 * Centro de San Juan del Río. Solo es un respaldo: sirve para que las sugerencias siempre
 * salgan primero de la zona, aunque no haya coordenadas configuradas o falle la búsqueda.
 */
const RESPALDO_SAN_JUAN = { lat: 20.3882, lon: -99.9965 };

let origenEnMemoria: Promise<Punto | null> | null = null;

/** Olvida el punto del taller guardado en memoria. Se usa en las pruebas. */
export function olvidarOrigen() {
  origenEnMemoria = null;
}

/**
 * Punto de salida: el taller de Diseñarte. `exacto` es false cuando se tuvo que recurrir a
 * la búsqueda o al respaldo, para poder avisar que el resultado es aproximado.
 * Nunca falla: sin punto de salida no habría sesgo y las sugerencias saldrían de todo el país.
 */
export async function origenDisenarte(): Promise<{ punto: Punto; exacto: boolean; fuente: FuenteOrigen }> {
  const fijo = process.env.ORIGEN_COORDENADAS?.trim();
  if (fijo) {
    const punto = leerCoordenadas(fijo);
    if (punto) return { punto, exacto: true, fuente: "configurado" };
    console.error(`[mapas] ORIGEN_COORDENADAS no se pudo leer: "${fijo}". Se espera algo como "20.3882, -99.9965".`);
  }

  // Sin coordenadas fijas se busca la dirección del taller una vez y se reutiliza.
  origenEnMemoria ??= buscarDireccion(DIRECCION_DISENARTE)
    .then((lugares) => (lugares[0] ? { lat: lugares[0].lat, lon: lugares[0].lon } : null))
    .catch(() => null);

  const encontrado = await origenEnMemoria;
  if (!encontrado) origenEnMemoria = null; // se vuelve a intentar la próxima vez
  return encontrado
    ? { punto: encontrado, exacto: false, fuente: "buscado" }
    : { punto: RESPALDO_SAN_JUAN, exacto: false, fuente: "respaldo" };
}

/**
 * Lee "20.3882, -99.9965" y también lo que suele salir al copiar de un mapa: con grados,
 * con punto y coma, o con los dos números separados por espacios. Si vienen al revés
 * (longitud primero), los acomoda: en México la latitud va de 14 a 33 y la longitud es negativa.
 */
export function leerCoordenadas(texto: string): Punto | null {
  const numeros = texto
    .replace(/[°º]/g, " ")
    .split(/[;,\s]+/)
    .map(Number)
    .filter((n) => Number.isFinite(n));
  if (numeros.length < 2) return null;

  let [lat, lon] = numeros;
  if (Math.abs(lat) > 90 || (lat < 0 && lon > 0)) [lat, lon] = [lon, lat];
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return { lat, lon };
}
