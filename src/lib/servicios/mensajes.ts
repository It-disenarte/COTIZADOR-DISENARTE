import { ErrorHttp } from "@/lib/errores";
import { type Canal, type DatosMensajes, type Mensaje, redactarMensaje } from "@/lib/ia/mensajes";
import type { EntradaCotizacion, EntradaDigital, ResultadoCotizacion, ResultadoDigital } from "@/lib/motor";
import type { UsuarioSesion } from "@/lib/permisos";
import { exigirResultado, obtenerCotizacion } from "./cotizaciones";

/**
 * Redacta el mensaje con el que se manda la propuesta, por correo o por WhatsApp (el vendedor elige).
 * Los datos salen de la versión guardada, no de lo que mande el navegador, y solo se
 * permite con el análisis ya autorizado: el PNO prohíbe comunicar precios antes de eso.
 */
export async function mensajeDeCotizacion(actor: UsuarioSesion | null, id: string, canal: Canal): Promise<Mensaje> {
  const cotizacion = await obtenerCotizacion(actor, id);
  if (!cotizacion.autorizadaEn) {
    throw new ErrorHttp(
      409,
      "El análisis de costos todavía no está autorizado. No se puede redactar la comunicación al cliente (PNO-COM-01, Fase 1).",
      "SIN_AUTORIZACION",
    );
  }

  if (cotizacion.tipo === "digital") {
    return redactarMensaje(actor as UsuarioSesion, datosDigitales(cotizacion, exigirResultado(cotizacion) as ResultadoDigital), canal);
  }
  const entrada = cotizacion.entrada as EntradaCotizacion;
  const resultado = exigirResultado(cotizacion) as ResultadoCotizacion;

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
    // Solo las cotizaciones de antes reparten por áreas; ahora cada área es un concepto.
    areas: resultado.levantamiento.porArea.length > 1 ? resultado.levantamiento.porArea.map((a) => a.area) : [],
    tiempoEstimado: entrada?.tiempoEstimado ?? null,
    incluyeEnvio: entrada?.incluyeEnvio ?? false,
    incluyeInstalacion: entrada?.operacion?.instalacion?.incluye ?? false,
    retiroGraficosPrevios: entrada?.sitio?.retiroGraficosPrevios === true,
    notasSuperficie: entrada?.sitio?.notasSuperficie ?? null,
    noIncluye: entrada?.propuesta?.noIncluye ?? null,
    supuestos: entrada?.propuesta?.supuestos ?? null,
    vigenciaDias: entrada?.propuesta?.vigenciaDias == null ? null : String(entrada.propuesta.vigenciaDias),
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

  return redactarMensaje(actor as UsuarioSesion, datos, canal);
}

const dinero = (valor: string) => `$${Number(valor).toLocaleString("es-MX", { minimumFractionDigits: 2 })}`;

/**
 * Digitalización: cada escenario (renta, dueño o propuesta única) se le pasa a la IA con sus formas de
 * pago ya en texto: activación y mensualidad con IVA incluido, pagos únicos con IVA, anticipo y promociones.
 */
function datosDigitales(cotizacion: Awaited<ReturnType<typeof obtenerCotizacion>>, resultado: ResultadoDigital): DatosMensajes {
  const entrada = cotizacion.entrada as EntradaDigital;
  const servicios = entrada.lineas.map((l) => l.nombre).filter(Boolean).join(", ");
  return {
    folio: cotizacion.folio,
    titulo: cotizacion.titulo,
    concepto: entrada.alcance?.concepto ?? null,
    resumen: entrada.alcance?.resumen ?? null,
    empresa: cotizacion.cliente?.empresa ?? null,
    contacto: cotizacion.cliente?.nombreContacto ?? cotizacion.solicitante ?? "el contacto",
    puesto: cotizacion.cliente?.puesto ?? null,
    asesor: cotizacion.vendedor,
    piezas: "",
    areas: [],
    tiempoEstimado: entrada.tiempoEstimado ?? null,
    incluyeEnvio: false,
    incluyeInstalacion: false,
    retiroGraficosPrevios: false,
    notasSuperficie: null,
    noIncluye: entrada.propuesta?.noIncluye ?? null,
    supuestos: entrada.propuesta?.supuestos ?? null,
    vigenciaDias: entrada.propuesta?.vigenciaDias == null ? null : String(entrada.propuesta.vigenciaDias),
    digital: true,
    opciones: resultado.escenarios.map((e) => {
      const partes: string[] = [];
      if (e.renta) {
        partes.push(`activación ${dinero(e.renta.activacion)} y ${dinero(e.renta.mensualidad)} al mes por ${e.renta.meses} meses, IVA incluido`);
      }
      if (e.unico) {
        partes.push(
          `pagos únicos: subtotal ${dinero(e.unico.subtotal)}, IVA ${dinero(e.unico.iva)}, total ${dinero(e.unico.total)} ` +
            `(${e.unico.anticipoPct}% de anticipo: ${dinero(e.unico.anticipo)}; finiquito al entregar: ${dinero(e.unico.finiquito)})`,
        );
        for (const p of e.unico.promociones) {
          partes.push(
            `${p.nombre}: ${p.descuentoPct}% de descuento, total ${dinero(p.total)} con IVA` +
              (p.regalo ? `, incluye ${p.regalo}` : "") +
              (p.validaHasta ? `, válida hasta el ${p.validaHasta}` : ""),
          );
        }
      }
      if (e.mensual) partes.push(`servicios mensuales: ${dinero(e.mensual.total)} al mes con IVA`);
      return {
        nombre: e.etiqueta,
        descripcion: servicios || null,
        modalidad: e.etiqueta,
        subtotal: e.unico?.subtotal ?? "0",
        iva: e.unico?.iva ?? "0",
        total: e.unico?.total ?? "0",
        precioTexto: partes.join("; "),
      };
    }),
    reventa: [],
  };
}
