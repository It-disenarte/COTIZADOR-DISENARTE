/**
 * Salida: las coordenadas del pin de Diseñarte en Google Maps (https://maps.app.goo.gl/9LkjxRTSkdqZ1s2p7); un enlace
 * corto no sirve como origen, y las coordenadas dejan la salida exacta.
 *
 * Enlace a Google Maps con Diseñarte como punto de partida. Sin llave ni cuenta: es el enlace público
 * de indicaciones (en el celular abre la app de Google Maps si está instalada).
 */
export const ORIGEN_GOOGLE_MAPS = "20.377935,-99.957981";

/** Si ya se escribió la dirección del cliente va como destino; si no, la persona lo escribe en Google Maps. */
export function enlaceGoogleMaps(destino?: string): string {
  const parametros = new URLSearchParams({ api: "1", origin: ORIGEN_GOOGLE_MAPS, travelmode: "driving" });
  const limpio = destino?.trim();
  if (limpio) parametros.set("destination", limpio);
  return `https://www.google.com/maps/dir/?${parametros.toString()}`;
}
