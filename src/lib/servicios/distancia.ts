import { ErrorHttp } from "@/lib/errores";
import { buscarDireccion, distanciaEnCoche, type Lugar, origenDisenarte } from "@/lib/mapas/osm";
import { requirePermiso, type UsuarioSesion } from "@/lib/permisos";
import type { PedirDistancia } from "@/lib/validacion/distancia";

export type ResultadoDistancia = {
  destino: Lugar;
  /** Un solo trayecto, en km con un decimal. */
  km: string;
  /** Minutos manejando; null si la distancia se estimó en línea recta. */
  minutos: number | null;
  /** false: no se pudo trazar la ruta y el número es un estimado de línea recta. */
  porCarretera: boolean;
  /** false: el punto encontrado es de una colonia o ciudad, no de una dirección exacta. */
  preciso: boolean;
  /** Otras coincidencias, para elegir si la primera no es la buena. */
  alternativas: Lugar[];
  /** true si el punto de salida no está configurado con coordenadas fijas. */
  origenAproximado: boolean;
};

/** Km por carretera desde el taller de Diseñarte hasta la ubicación del cliente. */
export async function calcularDistancia(actor: UsuarioSesion | null, pedido: PedirDistancia): Promise<ResultadoDistancia> {
  requirePermiso(actor, "cotizaciones.propias");
  const origen = await origenDisenarte();

  let destino: Lugar;
  let alternativas: Lugar[] = [];
  if (pedido.destino) {
    // La persona eligió una de las alternativas: se usa ese punto tal cual.
    destino = { ...pedido.destino, detalle: "elegido", exacto: true };
  } else {
    const encontrados = await buscarDireccion(pedido.direccion ?? "");
    if (encontrados.length === 0) {
      throw new ErrorHttp(404, "No encontré esa dirección. Agrega ciudad y estado, o captura los km a mano.", "MAPAS_SIN_RESULTADOS");
    }
    [destino, ...alternativas] = encontrados;
  }

  const { km, minutos, porCarretera } = await distanciaEnCoche(origen, destino);
  return {
    destino,
    km: km.toFixed(1),
    minutos,
    porCarretera,
    preciso: destino.exacto,
    alternativas: alternativas.slice(0, 4),
    origenAproximado: !process.env.ORIGEN_COORDENADAS?.trim(),
  };
}
