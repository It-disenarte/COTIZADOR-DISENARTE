import { ErrorHttp } from "@/lib/errores";
import type { EntradaCotizacion, EntradaDigital, ResultadoCotizacion, ResultadoDigital } from "@/lib/motor";
import { generarPdfDigital } from "@/lib/pdf/digital";
import { type DatosPdf, generarPdf, nombreArchivo } from "@/lib/pdf/documento";
import type { UsuarioSesion } from "@/lib/permisos";
import { exigirResultado, obtenerCotizacion } from "./cotizaciones";
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

  // PNO-COM-01, punto de control de la Fase 1: está prohibido comunicar precios al cliente
  // antes de que el análisis esté autorizado por el responsable inmediato.
  if (!cotizacion.autorizadaEn) {
    throw new ErrorHttp(
      409,
      "El análisis de costos todavía no está autorizado. Pide la autorización antes de generar la propuesta (PNO-COM-01, Fase 1).",
      "SIN_AUTORIZACION",
    );
  }

  if (cotizacion.tipo === "digital") {
    const entrada = cotizacion.entrada as EntradaDigital;
    const comunes = {
      folio: cotizacion.folio,
      titulo: cotizacion.titulo,
      solicitante: cotizacion.solicitante,
      asesor: cotizacion.vendedor,
      cliente: cotizacion.cliente
        ? { empresa: cotizacion.cliente.empresa, nombreContacto: cotizacion.cliente.nombreContacto, puesto: cotizacion.cliente.puesto }
        : null,
      fecha: cotizacion.actualizadoEn,
    };
    const archivo = await generarPdfDigital({
      ...comunes,
      tiempoEstimado: entrada.tiempoEstimado ?? null,
      alcance: entrada.alcance ? { concepto: entrada.alcance.concepto ?? null, resumen: entrada.alcance.resumen ?? null } : null,
      propuesta: entrada.propuesta
        ? { ...entrada.propuesta, vigenciaDias: entrada.propuesta.vigenciaDias == null ? null : String(entrada.propuesta.vigenciaDias) }
        : null,
      resultado: exigirResultado(cotizacion) as ResultadoDigital,
      // Con página web se agregan los entregables (accesos, dominio, correos) y la funcionalidad.
      incluyeWeb: entrada.lineas.some((l) => l.cobro === "paquete" || /p[aá]gina|sitio|web|tienda/i.test(l.nombre)),
    });
    return { archivo, nombre: nombreArchivo(comunes) };
  }

  const entrada = cotizacion.entrada as EntradaCotizacion;

  const datos: DatosPdf = {
    folio: cotizacion.folio,
    titulo: cotizacion.titulo,
    solicitante: cotizacion.solicitante,
    asesor: cotizacion.vendedor,
    cliente: cotizacion.cliente
      ? { empresa: cotizacion.cliente.empresa, nombreContacto: cotizacion.cliente.nombreContacto, puesto: cotizacion.cliente.puesto }
      : null,
    fecha: cotizacion.actualizadoEn,
    tiempoEstimado: entrada?.tiempoEstimado ?? null,
    propuesta: entrada?.propuesta
      ? { ...entrada.propuesta, vigenciaDias: entrada.propuesta.vigenciaDias == null ? null : String(entrada.propuesta.vigenciaDias) }
      : null,
    alcance: entrada?.alcance
      ? { concepto: entrada.alcance.concepto ?? null, resumen: entrada.alcance.resumen ?? null }
      : null,
    incluyeEnvio: entrada?.incluyeEnvio ?? false,
    sitio: entrada?.sitio ?? null,
    resultado: exigirResultado(cotizacion) as ResultadoCotizacion,
    imagenes: await imagenesParaPdf(cotizacion.id, entrada?.opciones ?? []),
  };

  return { archivo: await generarPdf(datos), nombre: nombreArchivo(datos) };
}
