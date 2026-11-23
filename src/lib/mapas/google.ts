/**
 * Enlace a Google Maps con Diseñarte como punto de partida. Sin llave ni cuenta: es el enlace público
 * de indicaciones (en el celular abre la app de Google Maps si está instalada). Vive aparte de `osm.ts`
 * porque este archivo también se usa en el navegador.
 */
export const ORIGEN_GOOGLE_MAPS = "Avenida Lomas del Pedregoso 371, San Juan del Río, Querétaro, México";

/** Si ya se escribió la dirección del cliente va como destino; si no, la persona lo escribe en Google Maps. */
export function enlaceGoogleMaps(destino?: string): string {
  const parametros = new URLSearchParams({ api: "1", origin: ORIGEN_GOOGLE_MAPS, travelmode: "driving" });
  const limpio = destino?.trim();
  if (limpio) parametros.set("destination", limpio);
  return `https://www.google.com/maps/dir/?${parametros.toString()}`;
}
