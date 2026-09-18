import type { EntradaCotizacion } from "@/lib/motor";
import { type DatosPdf, generarPdf, nombreArchivo } from "@/lib/pdf/documento";
import type { UsuarioSesion } from "@/lib/permisos";
import { obtenerCotizacion } from "./cotizaciones";
import { imagenesParaPdf } from "./imagenes";

/**
 * Arma el PDF de una cotización al momento. No se guarda en disco:
 * se genera con la versión vigente cada vez que alguien lo descarga.
 */
export async function pdfDeCotizacion(
  actor: UsuarioSesion | null,
  id: string,
): Promise<{ archivo: Uint8Array; nombre: string }> {
  const cotizacion = await obtenerCotizacion(actor, id);
  const entrada = cotizacion.entrada as EntradaCotizacion;

  const datos: DatosPdf = {
    folio: cotizacion.folio,
    titulo: cotizacion.titulo,
    solicitante: cotizacion.solicitante,
    asesor: cotizacion.vendedor,
    cliente: cotizacion.cliente
      ? { empresa: cotizacion.cliente.empresa, nombreContacto: cotizacion.cliente.nombreContacto }
      : null,
    fecha: cotizacion.actualizadoEn,
    tiempoEstimado: entrada?.tiempoEstimado ?? null,
    incluyeEnvio: entrada?.incluyeEnvio ?? false,
    resultado: cotizacion.resultado,
    imagenes: await imagenesParaPdf(cotizacion.id, entrada?.opciones ?? []),
  };

  return { archivo: await generarPdf(datos), nombre: nombreArchivo(datos) };
}
