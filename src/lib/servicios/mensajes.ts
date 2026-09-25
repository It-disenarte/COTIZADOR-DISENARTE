import { ErrorHttp } from "@/lib/errores";
import { type DatosMensajes, type Mensajes, redactarMensajes } from "@/lib/ia/mensajes";
import type { EntradaCotizacion } from "@/lib/motor";
import type { UsuarioSesion } from "@/lib/permisos";
import { obtenerCotizacion } from "./cotizaciones";

/**
 * Redacta el correo (Fase 2) y el mensaje de WhatsApp (Fase 3) de una cotización.
 * Los datos salen de la versión guardada, no de lo que mande el navegador, y solo se
 * permite con el análisis ya autorizado: el PNO prohíbe comunicar precios antes de eso.
 */
export async function mensajesDeCotizacion(actor: UsuarioSesion | null, id: string): Promise<Mensajes> {
  const cotizacion = await obtenerCotizacion(actor, id);
  if (!cotizacion.autorizadaEn) {
    throw new ErrorHttp(
      409,
      "El análisis de costos todavía no está autorizado. No se puede redactar la comunicación al cliente (PNO-COM-01, Fase 1).",
      "SIN_AUTORIZACION",
    );
  }

  const entrada = cotizacion.entrada as EntradaCotizacion;
  const { resultado } = cotizacion;

  const datos: DatosMensajes = {
    folio: cotizacion.folio,
    titulo: cotizacion.titulo,
    concepto: entrada?.alcance?.concepto ?? null,
    resumen: entrada?.alcance?.resumen ?? null,
    empresa: cotizacion.cliente?.empresa ?? null,
    contacto: cotizacion.cliente?.nombreContacto ?? cotizacion.solicitante ?? "el contacto",
    puesto: cotizacion.cliente?.puesto ?? null,
    asesor: cotizacion.vendedor,
    piezas: resultado.levantamiento.piezas,
    areas: resultado.levantamiento.porArea.map((a) => a.area),
    tiempoEstimado: entrada?.tiempoEstimado ?? null,
    incluyeEnvio: entrada?.incluyeEnvio ?? false,
    incluyeInstalacion: entrada?.operacion?.instalacion?.incluye ?? false,
    retiroGraficosPrevios: entrada?.sitio?.retiroGraficosPrevios === true,
    notasSuperficie: entrada?.sitio?.notasSuperficie ?? null,
    noIncluye: entrada?.propuesta?.noIncluye ?? null,
    supuestos: entrada?.propuesta?.supuestos ?? null,
    vigenciaDias: entrada?.propuesta?.vigenciaDias == null ? null : String(entrada.propuesta.vigenciaDias),
    peticionAccion: entrada?.propuesta?.peticionAccion || null,
    // Solo precios de venta: el desglose de costos no sale de la empresa (PNO 7.2 y 7.3.4).
    opciones: resultado.opciones.flatMap((opcion) =>
      opcion.variantes.map((v) => ({
        nombre: opcion.nombre,
        descripcion: opcion.descripcionPdf,
        modalidad: v.etiqueta,
        subtotal: v.subtotal,
        iva: v.iva,
        total: v.total,
      })),
    ),
    reventa: resultado.reventa.items.map((i) => ({ nombre: i.nombre, cantidad: i.cantidad, subtotal: i.subtotal })),
  };

  return redactarMensajes(actor as UsuarioSesion, datos);
}
