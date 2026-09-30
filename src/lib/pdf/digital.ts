import fontkit from "@pdf-lib/fontkit";
import { PDFDocument } from "pdf-lib";
import { formatoFecha, formatoMoneda } from "@/lib/formato";
import type { EscenarioDigital, FilaDigital, ResultadoDigital } from "@/lib/motor";
import { bloqueTotales, columnasCotizacion, type DatosPdf, incrustarFondos, leerArchivos, marcoInterior, portada } from "./documento";
import { type Celda, COLOR, Lienzo, MARGEN, tabla } from "./lienzo";
import { EMPRESA, MARCO, PAGINA } from "./marca";
import {
  CONDICIONES_DIGITAL,
  ENTREGABLES_WEB,
  FUNCIONALIDAD_WEB,
  LEYENDA_DIGITAL,
  NOTA_TIEMPOS,
  POR_QUE_DIGITAL,
  PROCESO_DIGITAL,
} from "./textos-digital";

export type DatosPdfDigital = Pick<DatosPdf, "folio" | "titulo" | "solicitante" | "asesor" | "cliente" | "fecha" | "tiempoEstimado" | "alcance" | "propuesta"> & {
  resultado: ResultadoDigital;
  /** Hay página web en la propuesta: se agregan los entregables y la funcionalidad. */
  incluyeWeb: boolean;
};

/**
 * Propuesta de Digitalización con el mismo diseño que la de publicidad física: portada, Bienvenidos
 * (del Canva), por qué, proceso, una página por forma de pago (renta / dueño), entregables y
 * condiciones. Nunca se guarda en disco.
 */
export async function generarPdfDigital(datos: DatosPdfDigital): Promise<Uint8Array> {
  const { marco: bytesMarco, regular, negrita } = await leerArchivos();
  const marco = await PDFDocument.load(bytesMarco);

  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const lienzo = new Lienzo(
    doc,
    await doc.embedFont(new Uint8Array(regular), { subset: true }),
    await doc.embedFont(new Uint8Array(negrita), { subset: true }),
  );
  doc.setTitle(`${datos.folio} · ${datos.titulo}`);
  doc.setAuthor(EMPRESA.nombre);
  doc.setSubject("Propuesta de digitalización");
  doc.setCreationDate(datos.fecha);

  const copiadas = await doc.copyPages(marco, marco.getPageIndices());
  const [fondoPortada, fondoInterior] = await incrustarFondos(doc, [copiadas[MARCO.portada], copiadas[MARCO.interior]]);

  portada(lienzo, fondoPortada, datos);
  doc.addPage(copiadas[MARCO.bienvenidos]);

  lienzo.alAbrirPagina = (l) => marcoInterior(l, fondoInterior);
  porQue(lienzo);
  proceso(lienzo);
  for (const escenario of datos.resultado.escenarios) presupuesto(lienzo, datos, escenario);
  if (datos.incluyeWeb) entregables(lienzo);
  condiciones(lienzo);

  return doc.save();
}

function encabezado(lienzo: Lienzo, titulo: string) {
  lienzo.nuevaPagina();
  lienzo.espacio(10);
  lienzo.titulo(titulo, { tamano: 16, color: COLOR.tinta });
  lienzo.espacio(12);
}

function porQue(lienzo: Lienzo) {
  encabezado(lienzo, "¿Por qué Diseñarte México?");
  for (const punto of POR_QUE_DIGITAL) {
    lienzo.texto(punto.titulo, { tamano: 11, negrita: true, color: COLOR.morado });
    lienzo.texto(punto.texto, { tamano: 10, color: COLOR.suave, interlineado: 14 });
    lienzo.espacio(12);
  }
}

function proceso(lienzo: Lienzo) {
  encabezado(lienzo, "Proceso de trabajo");
  for (const paso of PROCESO_DIGITAL) {
    lienzo.texto(paso.etapa, { tamano: 11, negrita: true, color: COLOR.morado });
    lienzo.texto(paso.texto, { tamano: 9.5, color: COLOR.suave, interlineado: 13.5 });
    lienzo.espacio(10);
  }
  lienzo.espacio(4);
  lienzo.texto(NOTA_TIEMPOS, { tamano: 8.5, color: COLOR.tenue, interlineado: 12 });
}

const celdaConcepto = (fila: FilaDigital): Celda => {
  const celda: Exclude<Celda, string> = [{ texto: `Concepto: ${fila.concepto}`, negrita: true }];
  if (fila.descripcion.length) {
    celda.push({ texto: "Incluye:", negrita: true });
    for (const vineta of fila.descripcion) celda.push({ texto: `• ${vineta}`, pegado: true });
  }
  if (fila.nota) celda.push({ texto: fila.nota });
  return celda;
};

function tablaServicios(lienzo: Lienzo, filas: FilaDigital[], tiempo: string) {
  tabla(
    lienzo,
    columnasCotizacion(),
    filas.map((f) => [
      f.cantidad,
      f.tiempo ?? tiempo,
      celdaConcepto(f),
      [{ texto: `${formatoMoneda(f.unitario)} MXN`, negrita: true }],
      `${formatoMoneda(f.subtotal)} MXN`,
    ]),
    { estilo: "reticula", tamano: 8.8, alturaMinima: 48, centrarVertical: true },
  );
}

/** Renglones de importe alineados a la derecha, como los totales de la cotización física. */
function renglones(lienzo: Lienzo, lista: [string, string][], opciones: { destacado?: boolean } = {}) {
  const ancho = 260;
  const x = PAGINA.ancho - MARGEN.x - ancho - 8;
  lienzo.asegurarEspacio(lista.length * 14 + 10);
  lista.forEach(([etiqueta, valor], i) => {
    const ultimo = i === lista.length - 1 && opciones.destacado;
    const y = lienzo.y - 9;
    lienzo.textoEn(etiqueta, x, y, { tamano: 9, color: ultimo ? COLOR.tinta : COLOR.suave, negrita: ultimo });
    lienzo.textoEn(valor, x + ancho - lienzo.anchoDe(valor, 9, ultimo), y, { tamano: 9, negrita: ultimo });
    lienzo.espacio(14);
  });
}

function presupuesto(lienzo: Lienzo, datos: DatosPdfDigital, escenario: EscenarioDigital) {
  const variosEscenarios = datos.resultado.escenarios.length > 1;
  encabezado(lienzo, "Propuesta presupuestaria");
  if (variosEscenarios) {
    lienzo.espacio(-8);
    lienzo.texto(escenario.etiqueta, { tamano: 10, color: COLOR.morado, alineacion: "centro" });
    lienzo.espacio(8);
  }

  const concepto = datos.alcance?.concepto?.trim() || datos.titulo;
  lienzo.texto(`Proyecto: ${concepto}`, { tamano: 9.5, negrita: true });
  if (datos.alcance?.resumen?.trim()) lienzo.texto(datos.alcance.resumen.trim(), { tamano: 9, color: COLOR.suave, interlineado: 12.5 });
  lienzo.espacio(8);

  const tiempo = datos.tiempoEstimado || "Por definir";

  if (escenario.renta) {
    lienzo.texto("Modalidad renta", { tamano: 10, negrita: true, color: COLOR.morado });
    lienzo.espacio(4);
    tablaServicios(lienzo, escenario.filasRenta, tiempo);
    lienzo.espacio(8);
    renglones(
      lienzo,
      [
        ["Activación inicial", `${formatoMoneda(escenario.renta.activacion)} MXN`],
        [`Mensualidad × ${escenario.renta.meses} meses`, `${formatoMoneda(escenario.renta.mensualidad)} MXN`],
        ["Total del primer año (IVA incluido)", `${formatoMoneda(escenario.renta.totalPrimerAno)} MXN`],
      ],
      { destacado: true },
    );
    lienzo.espacio(8);
  }

  if (escenario.unico) {
    lienzo.texto(escenario.clave === "renta" ? "Servicios de pago único" : "Pago único", {
      tamano: 10,
      negrita: true,
      color: COLOR.morado,
    });
    lienzo.espacio(4);
    tablaServicios(lienzo, escenario.filasUnicas, tiempo);
    bloqueTotales(lienzo, { subtotal: escenario.unico.subtotal, descuento: "0", iva: escenario.unico.iva, total: escenario.unico.total });

    const pctFiniquito = 100 - Number(escenario.unico.anticipoPct);
    lienzo.texto("Esquema de pagos", { tamano: 10, negrita: true, color: COLOR.morado });
    lienzo.texto(
      `Anticipo ${escenario.unico.anticipoPct}%: ${formatoMoneda(escenario.unico.anticipo)} MXN · Finiquito ${pctFiniquito}% al entregar: ${formatoMoneda(escenario.unico.finiquito)} MXN (IVA incluido).`,
      { tamano: 9, color: COLOR.suave, interlineado: 12.5 },
    );
    lienzo.espacio(8);

    for (const promocion of escenario.unico.promociones) {
      lienzo.asegurarEspacio(70);
      lienzo.texto(`${promocion.nombre}: ${promocion.descuentoPct}% de descuento`, { tamano: 10, negrita: true, color: COLOR.morado });
      lienzo.texto(
        `Descuento: -${formatoMoneda(promocion.descuento)} MXN · Pago de contado: ${formatoMoneda(promocion.total)} MXN con IVA.`,
        { tamano: 9, interlineado: 12.5 },
      );
      if (promocion.regalo) lienzo.texto(`+ ${promocion.regalo.toUpperCase()}`, { tamano: 9, negrita: true });
      if (promocion.validaHasta) {
        lienzo.texto(`Promoción válida hasta el ${formatoFecha(promocion.validaHasta)}.`, { tamano: 8.5, color: COLOR.suave });
      }
      lienzo.espacio(8);
    }
  }

  if (escenario.mensual) {
    lienzo.texto("Servicios mensuales", { tamano: 10, negrita: true, color: COLOR.morado });
    lienzo.espacio(4);
    tablaServicios(lienzo, escenario.filasMensuales, "Mensual");
    lienzo.espacio(8);
    renglones(
      lienzo,
      [
        ["Subtotal al mes", `${formatoMoneda(escenario.mensual.subtotal)} MXN`],
        ["IVA 16%", `${formatoMoneda(escenario.mensual.iva)} MXN`],
        ["Total al mes", `${formatoMoneda(escenario.mensual.total)} MXN`],
      ],
      { destacado: true },
    );
    lienzo.espacio(8);
  }

  cierre(lienzo, datos);
}

function cierre(lienzo: Lienzo, datos: DatosPdfDigital) {
  const { propuesta } = datos;
  if (propuesta?.noIncluye?.trim()) {
    lienzo.espacio(4);
    lienzo.texto("Lo que no incluye", { tamano: 9, negrita: true, color: COLOR.morado });
    for (const renglon of propuesta.noIncluye.trim().split(/\r?\n/).filter(Boolean)) {
      lienzo.texto(`• ${renglon.replace(/^\s*[-•*]\s*/, "")}`, { tamano: 8.5, color: COLOR.suave, interlineado: 12 });
    }
  }
  if (propuesta?.supuestos?.trim()) {
    lienzo.espacio(6);
    lienzo.texto("Esta propuesta considera", { tamano: 9, negrita: true, color: COLOR.morado });
    lienzo.texto(propuesta.supuestos.trim(), { tamano: 8.5, color: COLOR.suave, interlineado: 12 });
  }
  if (Number(propuesta?.vigenciaDias) > 0) {
    lienzo.espacio(6);
    lienzo.texto(`Vigencia de la propuesta: ${propuesta?.vigenciaDias} días naturales.`, { tamano: 8.5, color: COLOR.suave });
  }
  lienzo.espacio(8);
  lienzo.texto(LEYENDA_DIGITAL, { tamano: 7.5, color: COLOR.tenue, interlineado: 10.5 });
}

function entregables(lienzo: Lienzo) {
  encabezado(lienzo, "Entregables");
  for (const e of ENTREGABLES_WEB) lienzo.texto(`• ${e}`, { tamano: 10, interlineado: 15 });
  lienzo.espacio(16);
  lienzo.titulo("Funcionalidad", { tamano: 16, color: COLOR.tinta });
  lienzo.espacio(12);
  for (const f of FUNCIONALIDAD_WEB) lienzo.texto(`• ${f}`, { tamano: 10, interlineado: 15 });
}

function condiciones(lienzo: Lienzo) {
  encabezado(lienzo, "Condiciones comerciales");
  CONDICIONES_DIGITAL.forEach((c, i) => {
    lienzo.texto(`${i + 1}. ${c}`, { tamano: 8.8, color: COLOR.suave, interlineado: 12.5 });
    lienzo.espacio(4);
  });
}
