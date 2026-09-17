import { readFile } from "node:fs/promises";
import path from "node:path";
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument } from "pdf-lib";
import { formatoFecha, formatoMoneda } from "@/lib/formato";
import type { ResultadoCotizacion, Variante } from "@/lib/motor";
import { COLOR, type Columna, Lienzo, MARGEN, tabla } from "./lienzo";
import { BIENVENIDOS, CONDICIONES, EMPRESA, LEYENDA_DISENO, PAGINA, POR_QUE, PROCESO } from "./marca";

export type DatosPdf = {
  folio: string;
  titulo: string;
  solicitante: string | null;
  asesor: string | null;
  cliente: { empresa: string | null; nombreContacto: string } | null;
  fecha: Date;
  tiempoEstimado: string | null;
  resultado: ResultadoCotizacion;
};

const RAIZ_FUENTES = path.join(process.cwd(), "src", "lib", "pdf", "fuentes");

async function cargarFuentes(doc: PDFDocument) {
  doc.registerFontkit(fontkit);
  const [regular, negrita] = await Promise.all([
    readFile(path.join(RAIZ_FUENTES, "Poppins-Regular.ttf")),
    readFile(path.join(RAIZ_FUENTES, "Poppins-SemiBold.ttf")),
  ]);
  return {
    regular: await doc.embedFont(new Uint8Array(regular), { subset: true }),
    negrita: await doc.embedFont(new Uint8Array(negrita), { subset: true }),
  };
}

/** Nombre de archivo de la propuesta: COT-DDMMYYYY-NN_Titulo_-_Solicitante.pdf */
export function nombreArchivo(datos: Pick<DatosPdf, "folio" | "titulo" | "solicitante">): string {
  const limpiar = (texto: string) =>
    texto
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-zA-Z0-9 ]/g, "")
      .trim()
      .replace(/\s+/g, "_");

  const partes = [datos.folio, limpiar(datos.titulo)];
  if (datos.solicitante?.trim()) partes.push("-", limpiar(datos.solicitante));
  return `${partes.filter(Boolean).join("_")}.pdf`;
}

export async function generarPdf(datos: DatosPdf): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const { regular, negrita } = await cargarFuentes(doc);
  const lienzo = new Lienzo(doc, regular, negrita);

  doc.setTitle(`${datos.folio} · ${datos.titulo}`);
  doc.setAuthor(EMPRESA.nombre);
  doc.setSubject("Propuesta económica");
  doc.setCreationDate(datos.fecha);

  portada(lienzo, datos);
  bienvenidos(lienzo);
  porQue(lienzo);
  proceso(lienzo);
  consolidado(lienzo, datos);
  for (const opcion of datos.resultado.opciones) {
    for (const variante of opcion.variantes) {
      paginaDeOpcion(lienzo, datos, opcion.nombre, opcion.descripcionPdf, variante);
    }
  }
  materialesAdicionales(lienzo, datos);
  condiciones(lienzo);

  return doc.save();
}

// Páginas ------------------------------------------------------------------------------------

function portada(lienzo: Lienzo, datos: DatosPdf) {
  lienzo.nuevaPagina();
  lienzo.espacio(120);

  lienzo.texto("PROPUESTA ECONÓMICA", { tamano: 11, negrita: true, color: COLOR.acento });
  lienzo.espacio(14);
  lienzo.texto(datos.titulo.toUpperCase(), { tamano: 30, negrita: true, interlineado: 36 });
  lienzo.espacio(28);
  lienzo.linea(COLOR.acento, 2, 96);
  lienzo.espacio(34);

  const filas: [string, string][] = [
    ["Fecha", formatoFecha(datos.fecha)],
    ["Folio", datos.folio],
  ];
  if (datos.cliente) filas.push(["Cliente", datos.cliente.empresa ?? datos.cliente.nombreContacto]);
  if (datos.solicitante) filas.push(["Solicitante", datos.solicitante]);
  if (datos.asesor) filas.push(["Asesor comercial", datos.asesor]);

  for (const [etiqueta, valor] of filas) {
    lienzo.texto(etiqueta.toUpperCase(), { tamano: 7.5, color: COLOR.tenue, negrita: true });
    lienzo.texto(valor, { tamano: 12 });
    lienzo.espacio(10);
  }

  lienzo.y = MARGEN.abajo + 30;
  lienzo.texto(EMPRESA.nombre, { tamano: 10, negrita: true });
  lienzo.texto(EMPRESA.sitio, { tamano: 9, color: COLOR.suave });
}

function bienvenidos(lienzo: Lienzo) {
  lienzo.nuevaPagina();
  lienzo.titulo(BIENVENIDOS.titulo);
  for (const parrafo of BIENVENIDOS.parrafos) {
    lienzo.texto(parrafo, { tamano: 10.5, color: COLOR.suave, interlineado: 16 });
    lienzo.espacio(10);
  }
  lienzo.pieDeContacto();
}

function porQue(lienzo: Lienzo) {
  lienzo.nuevaPagina();
  lienzo.titulo(POR_QUE.titulo);
  for (const punto of POR_QUE.puntos) {
    lienzo.asegurarEspacio(54);
    lienzo.texto(punto.titulo, { tamano: 11, negrita: true });
    lienzo.espacio(2);
    lienzo.texto(punto.texto, { tamano: 10, color: COLOR.suave, interlineado: 15 });
    lienzo.espacio(14);
  }
  lienzo.pieDeContacto();
}

function proceso(lienzo: Lienzo) {
  lienzo.nuevaPagina();
  lienzo.titulo(PROCESO.titulo);
  PROCESO.pasos.forEach((paso, i) => {
    lienzo.asegurarEspacio(62);
    const y = lienzo.y;
    lienzo.pagina.drawText(String(i + 1).padStart(2, "0"), {
      x: MARGEN.x,
      y: y - 12,
      size: 14,
      font: lienzo.fuente(true),
      color: COLOR.acento,
    });
    lienzo.texto(paso.titulo, { tamano: 11, negrita: true, x: MARGEN.x + 34, ancho: lienzo.anchoUtil - 34 });
    lienzo.espacio(2);
    lienzo.texto(paso.texto, {
      tamano: 10,
      color: COLOR.suave,
      interlineado: 15,
      x: MARGEN.x + 34,
      ancho: lienzo.anchoUtil - 34,
    });
    lienzo.espacio(16);
  });
  lienzo.pieDeContacto();
}

/** Consolidado del levantamiento: qué se va a producir, agrupado por área. */
function consolidado(lienzo: Lienzo, datos: DatosPdf) {
  const { levantamiento } = datos.resultado;
  lienzo.nuevaPagina();
  lienzo.titulo(`Consolidado del levantamiento: ${levantamiento.piezas} piezas`);

  const areas = levantamiento.porArea.map((a) => a.area);
  const anchoFijo = 96;
  const anchoAreas = Math.min(60, (lienzo.anchoUtil - 220) / Math.max(areas.length, 1));
  const columnas: Columna[] = [
    { titulo: "Concepto", ancho: lienzo.anchoUtil - anchoFijo - anchoAreas * areas.length - 60 },
    { titulo: "Medida", ancho: anchoFijo },
    ...areas.map((area) => ({ titulo: area, ancho: anchoAreas, alineacion: "derecha" as const })),
    { titulo: "Piezas", ancho: 60, alineacion: "derecha" as const },
  ];

  const filas = levantamiento.filas.map((fila) => [
    fila.concepto || "Sin concepto",
    Number(fila.anchoM) > 0 || Number(fila.altoM) > 0 ? `${fila.anchoM} × ${fila.altoM} m` : "Por pieza",
    ...fila.cantidades.map((c) => c || "0"),
    fila.piezas,
  ]);

  tabla(lienzo, columnas, filas);
  lienzo.espacio(12);
  lienzo.texto(`Total: ${levantamiento.piezas} piezas · ${levantamiento.areaM2} m²`, { tamano: 10, negrita: true });

  if (levantamiento.porArea.length > 1) {
    lienzo.espacio(10);
    for (const area of levantamiento.porArea) {
      lienzo.texto(`${area.area}: ${area.piezas} piezas · ${area.areaM2} m²`, { tamano: 9, color: COLOR.suave });
    }
  }
  lienzo.pieDeContacto();
}

/** Una página por opción de material (y por modalidad A/B si aplica). */
function paginaDeOpcion(
  lienzo: Lienzo,
  datos: DatosPdf,
  nombre: string,
  descripcion: string | null,
  variante: Variante,
) {
  lienzo.nuevaPagina();
  lienzo.titulo("Cotización", 20);

  lienzo.texto(nombre, { tamano: 13, negrita: true });
  if (variante.clave !== "unica") lienzo.texto(variante.etiqueta, { tamano: 10, color: COLOR.acento });
  lienzo.espacio(14);

  const alcance = [
    `Concepto: ${datos.titulo}`,
    descripcion ? `Descripción: ${descripcion}` : null,
    datos.tiempoEstimado ? `Tiempo estimado: ${datos.tiempoEstimado}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const columnas: Columna[] = [
    { titulo: "Cantidad", ancho: 62, alineacion: "derecha" },
    { titulo: "Resumen de alcance", ancho: lienzo.anchoUtil - 62 - 100 - 108 },
    { titulo: "Costo unitario", ancho: 100, alineacion: "derecha" },
    { titulo: "Subtotal", ancho: 108, alineacion: "derecha" },
  ];

  const filas = variante.filas.map((fila, i) => [
    fila.cantidad,
    i === 0 ? alcance : fila.concepto,
    formatoMoneda(fila.unitario),
    formatoMoneda(fila.subtotal),
  ]);

  tabla(lienzo, columnas, filas, { alturaMinima: 30 });
  bloqueTotales(lienzo, variante);

  lienzo.espacio(16);
  lienzo.texto("Precios sin IVA", { tamano: 8.5, color: COLOR.suave });
  lienzo.espacio(10);
  lienzo.texto(LEYENDA_DISENO, { tamano: 7.5, color: COLOR.tenue, interlineado: 11 });
  lienzo.pieDeContacto();
}

function bloqueTotales(lienzo: Lienzo, variante: Pick<Variante, "subtotal" | "descuento" | "iva" | "total">) {
  const ancho = 220;
  const x = PAGINA.ancho - MARGEN.x - ancho;
  const renglones: [string, string][] = [["Subtotal", variante.subtotal]];
  if (Number(variante.descuento) > 0) renglones.push(["Descuento", `-${variante.descuento}`]);
  renglones.push(["IVA 16%", variante.iva]);

  lienzo.espacio(14);
  lienzo.asegurarEspacio(renglones.length * 16 + 34);

  for (const [etiqueta, valor] of renglones) {
    lienzo.texto(etiqueta, { tamano: 9.5, color: COLOR.suave, x, ancho: ancho / 2 });
    lienzo.y += 9.5 * 1.45;
    lienzo.texto(formatoMoneda(valor), { tamano: 9.5, x: x + ancho / 2, ancho: ancho / 2, alineacion: "derecha" });
  }

  lienzo.espacio(4);
  lienzo.rectangulo(x, lienzo.y - 26, ancho, 30, COLOR.fondoSuave);
  lienzo.espacio(6);
  lienzo.texto("Total", { tamano: 11, negrita: true, x: x + 10, ancho: ancho / 2 });
  lienzo.y += 11 * 1.45;
  lienzo.texto(formatoMoneda(variante.total), {
    tamano: 11,
    negrita: true,
    x: x + ancho / 2,
    ancho: ancho / 2 - 10,
    alineacion: "derecha",
  });
  lienzo.espacio(10);
}

function materialesAdicionales(lienzo: Lienzo, datos: DatosPdf) {
  const { reventa } = datos.resultado;
  if (reventa.items.length === 0) return;

  lienzo.nuevaPagina();
  lienzo.titulo("Materiales adicionales", 20);

  const columnas: Columna[] = [
    { titulo: "Cantidad", ancho: 62, alineacion: "derecha" },
    { titulo: "Concepto", ancho: lienzo.anchoUtil - 62 - 100 - 108 },
    { titulo: "Costo unitario", ancho: 100, alineacion: "derecha" },
    { titulo: "Subtotal", ancho: 108, alineacion: "derecha" },
  ];

  const filas = reventa.items.map((item) => [
    item.cantidad,
    datos.tiempoEstimado ? `Concepto: ${item.nombre}\nTiempo estimado: ${datos.tiempoEstimado}` : `Concepto: ${item.nombre}`,
    formatoMoneda(item.unitario),
    formatoMoneda(item.subtotal),
  ]);

  tabla(lienzo, columnas, filas, { alturaMinima: 28 });
  bloqueTotales(lienzo, { subtotal: reventa.subtotal, descuento: "0", iva: reventa.iva, total: reventa.total });

  lienzo.espacio(16);
  lienzo.texto("Precios sin IVA", { tamano: 8.5, color: COLOR.suave });
  lienzo.espacio(10);
  lienzo.texto(LEYENDA_DISENO, { tamano: 7.5, color: COLOR.tenue, interlineado: 11 });
  lienzo.pieDeContacto();
}

function condiciones(lienzo: Lienzo) {
  lienzo.nuevaPagina();
  lienzo.titulo(CONDICIONES.titulo);
  CONDICIONES.puntos.forEach((punto, i) => {
    lienzo.asegurarEspacio(30);
    const y = lienzo.y;
    lienzo.pagina.drawText(`${i + 1}.`, {
      x: MARGEN.x,
      y: y - 9,
      size: 9,
      font: lienzo.fuente(true),
      color: COLOR.acento,
    });
    lienzo.texto(punto, {
      tamano: 8.8,
      color: COLOR.suave,
      interlineado: 13,
      x: MARGEN.x + 22,
      ancho: lienzo.anchoUtil - 22,
    });
    lienzo.espacio(7);
  });
  lienzo.pieDeContacto();
}
