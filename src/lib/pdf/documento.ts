import { readFile } from "node:fs/promises";
import path from "node:path";
import fontkit from "@pdf-lib/fontkit";
import { type PDFEmbeddedPage, PDFDocument, type PDFImage, type PDFPage } from "pdf-lib";
import { formatoMoneda } from "@/lib/formato";
import type { ResultadoCotizacion, Variante } from "@/lib/motor";
import { type Celda, COLOR, type Columna, Lienzo, MARGEN, tabla } from "./lienzo";
import { EMPRESA, LEYENDA_DISENO, MARCO, PAGINA } from "./marca";

export type ImagenPdf = { bytes: Uint8Array; tipo: string };

export type DatosPdf = {
  folio: string;
  titulo: string;
  solicitante: string | null;
  asesor: string | null;
  cliente: { empresa: string | null; nombreContacto: string } | null;
  fecha: Date;
  tiempoEstimado: string | null;
  /** Concepto y resumen del alcance; si faltan, se usa el título. */
  alcance?: { concepto: string | null; resumen: string | null } | null;
  incluyeEnvio: boolean;
  resultado: ResultadoCotizacion;
  /** Foto de referencia de cada opción, por id de receta. */
  imagenes?: Map<string, ImagenPdf>;
};

const RAIZ_PDF = path.join(process.cwd(), "src", "lib", "pdf");

// El marco y las fuentes no cambian entre peticiones: se leen del disco una sola vez.
let archivos: Promise<{ marco: Buffer; regular: Buffer; negrita: Buffer }> | null = null;
function leerArchivos() {
  archivos ??= Promise.all([
    readFile(path.join(RAIZ_PDF, "plantillas", "marco.pdf")),
    readFile(path.join(RAIZ_PDF, "fuentes", "Poppins-Regular.ttf")),
    readFile(path.join(RAIZ_PDF, "fuentes", "Poppins-SemiBold.ttf")),
  ]).then(([marco, regular, negrita]) => ({ marco, regular, negrita }));
  return archivos;
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

const fechaCorta = (fecha: Date) =>
  new Intl.DateTimeFormat("es-MX", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "America/Mexico_City",
  }).format(fecha);

export async function generarPdf(datos: DatosPdf): Promise<Uint8Array> {
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
  doc.setSubject("Propuesta económica");
  doc.setCreationDate(datos.fecha);

  // Una sola copia del marco: así las imágenes que comparten sus páginas (la textura
  // del fondo pesa ~1 MB) quedan una vez en el archivo y no una por página.
  const copiadas = await doc.copyPages(marco, marco.getPageIndices());
  const [fondoPortada, fondoInterior] = await incrustarFondos(doc, [copiadas[MARCO.portada], copiadas[MARCO.interior]]);
  const bienvenidos = copiadas[MARCO.bienvenidos];
  const porQue = copiadas[MARCO.porQue];
  const proceso = copiadas[MARCO.proceso];
  const condiciones = copiadas[MARCO.condiciones];

  portada(lienzo, fondoPortada, datos);
  doc.addPage(bienvenidos);
  doc.addPage(porQue);
  doc.addPage(proceso);

  // Todas las páginas de cotización llevan el marco interior, con su encabezado y su pie.
  lienzo.alAbrirPagina = (l) => marcoInterior(l, fondoInterior);

  consolidado(lienzo, datos);
  for (const opcion of datos.resultado.opciones) {
    const imagen = await incrustarImagen(doc, datos.imagenes?.get(opcion.recetaId));
    for (const variante of opcion.variantes) {
      paginaDeOpcion(lienzo, datos, opcion.nombre, opcion.descripcionPdf, variante, imagen);
    }
  }
  materialesAdicionales(lienzo, datos);

  doc.addPage(condiciones);
  return doc.save();
}

async function incrustarImagen(doc: PDFDocument, imagen: ImagenPdf | undefined): Promise<PDFImage | null> {
  if (!imagen) return null;
  try {
    return imagen.tipo === "image/png" ? await doc.embedPng(imagen.bytes) : await doc.embedJpg(imagen.bytes);
  } catch {
    // Una imagen dañada no debe impedir que salga la propuesta.
    return null;
  }
}

// Marco ------------------------------------------------------------------------------------

/**
 * Canva exporta las páginas con el origen corrido (MediaBox que empieza en y = 8.58
 * por el sangrado) y pdf-lib, por defecto, recorta desde (0, 0). Por eso se le pasa
 * la caja real: si no, el diseño sube 8.58 pt y queda una franja blanca abajo.
 */
function incrustarFondos(doc: PDFDocument, paginas: PDFPage[]): Promise<PDFEmbeddedPage[]> {
  const cajas = paginas.map((pagina) => {
    const caja = pagina.getMediaBox();
    return { left: caja.x, bottom: caja.y, right: caja.x + caja.width, top: caja.y + caja.height };
  });
  // Las páginas ya son del documento, así que pdf-lib las reutiliza sin volver a copiarlas.
  return doc.embedPages(paginas, cajas);
}

function dibujarFondo(lienzo: Lienzo, fondo: PDFEmbeddedPage) {
  lienzo.pagina.drawPage(fondo, { x: 0, y: 0, width: PAGINA.ancho, height: PAGINA.alto });
}

function portada(lienzo: Lienzo, fondo: PDFEmbeddedPage, datos: DatosPdf) {
  lienzo.pagina = lienzo.doc.addPage([PAGINA.ancho, PAGINA.alto]);
  dibujarFondo(lienzo, fondo);
  const blanco = COLOR.blanco;
  const x = 158.5;

  // "PROPUESTA ECONÓMICA" ocupa el mismo ancho que en el diseño de Canva.
  const ajustar = (texto: string, ancho: number, negrita: boolean) => ancho / lienzo.anchoDe(texto, 1, negrita);
  lienzo.textoEn("PROPUESTA", x, 451, { tamano: ajustar("PROPUESTA", 313, true), negrita: true, color: blanco });
  lienzo.textoEn("ECONÓMICA", x, 399.5, { tamano: ajustar("ECONÓMICA", 319, false), color: blanco });

  // El título del proyecto va justo encima de la raya; si es largo se achica o se parte en dos renglones.
  const titulo = datos.titulo.toUpperCase();
  const anchoMaximo = 395;
  const espaciado = 2;
  let tamano = 17.5;
  while (tamano > 11 && lienzo.anchoDe(titulo, tamano, false, espaciado) > anchoMaximo) tamano -= 0.5;
  const renglones =
    lienzo.anchoDe(titulo, tamano, false, espaciado) > anchoMaximo
      ? lienzo.renglones(titulo, tamano, anchoMaximo - espaciado * 40).slice(0, 2)
      : [titulo];
  renglones.forEach((renglon, i) => {
    lienzo.textoEn(renglon, x, 355 + (renglones.length - 1 - i) * (tamano * 1.3), { tamano, color: blanco, espaciado });
  });

  lienzo.textoEn(`FECHA ${fechaCorta(datos.fecha)}`, x + 2, 320, { tamano: 12, color: blanco, espaciado: 3 });
  lienzo.textoEn(datos.folio, x + 2, 303, { tamano: 7.5, color: blanco, espaciado: 1.6 });

  const centro = 296;
  const centrado = (texto: string, y: number, tamanoTexto: number, negrita: boolean) =>
    lienzo.textoEn(texto, centro - lienzo.anchoDe(texto, tamanoTexto, negrita) / 2, y, {
      tamano: tamanoTexto,
      negrita,
      color: blanco,
    });

  let y = 186;
  const solicitante = datos.solicitante ?? datos.cliente?.nombreContacto ?? null;
  if (solicitante) {
    centrado("Solicitante:", y, 12.5, true);
    centrado(solicitante, y - 17, 11.5, false);
    y -= 49;
  }
  if (datos.asesor) {
    centrado("Asesor comercial:", y, 12.5, true);
    centrado(datos.asesor, y - 17, 11.5, false);
  }

  const sitio = "disenartemx.com";
  lienzo.textoEn(sitio, 304.5 - lienzo.anchoDe(sitio, 13, true) / 2, 14, { tamano: 13, negrita: true, color: COLOR.morado });
}

function marcoInterior(lienzo: Lienzo, fondo: PDFEmbeddedPage) {
  dibujarFondo(lienzo, fondo);

  const blanco = COLOR.blanco;
  lienzo.textoEn("COTIZACIÓN", 37, 745, { tamano: 27, negrita: true, color: blanco });

  // Pie: domicilio y contacto a la izquierda, datos bancarios al centro, sitio bajo las redes.
  const tamano = 7.1;
  const texto = (valor: string, x: number, y: number, negrita = false) =>
    lienzo.textoEn(valor, x, y, { tamano, negrita, color: blanco });

  texto(EMPRESA.direccion[0], 55, 53);
  texto(EMPRESA.direccion[1], 55, 46);
  texto(EMPRESA.correo, 55, 31);
  texto(EMPRESA.telefonos[0], 55, 15.5);
  texto(EMPRESA.telefonos[1], 116, 15.5);

  const { banco } = EMPRESA;
  const renglones: [string, string][] = [
    ["Banco:", banco.banco],
    ["Titular:", banco.titular],
    ["Cuenta:", banco.cuenta],
    ["Cuenta clave:", banco.clabe],
    ["No. tarjeta:", banco.tarjeta],
  ];
  renglones.forEach(([etiqueta, valor], i) => {
    const y = 52.5 - i * 9.7;
    texto(etiqueta, 209.5, y, true);
    texto(valor, 209.5 + lienzo.anchoDe(`${etiqueta} `, tamano, true), y);
  });

  lienzo.textoEn(EMPRESA.sitio, 481, 24, { tamano: 7.6, color: blanco });
}

// Páginas de cotización ----------------------------------------------------------------------

/** Consolidado del levantamiento: qué se va a producir, agrupado por área. */
function consolidado(lienzo: Lienzo, datos: DatosPdf) {
  const { levantamiento } = datos.resultado;
  lienzo.nuevaPagina();
  lienzo.titulo(`Consolidado del levantamiento: ${levantamiento.piezas} piezas`);

  const areas = levantamiento.porArea.map((a) => a.area);
  const anchoMedida = 72;
  const anchoTotal = 52;
  const anchoAreas = Math.min(72, (lienzo.anchoUtil - 200 - anchoMedida - anchoTotal) / Math.max(areas.length, 1));
  const columnas: Columna[] = [
    { titulo: "Concepto", ancho: lienzo.anchoUtil - anchoMedida - anchoAreas * areas.length - anchoTotal },
    { titulo: "Medida", ancho: anchoMedida, alineacion: "centro" },
    ...areas.map((area) => ({ titulo: area, ancho: anchoAreas, alineacion: "centro" as const })),
    { titulo: "Total", ancho: anchoTotal, alineacion: "centro" },
  ];

  const filas: Celda[][] = levantamiento.filas.map((fila) => [
    fila.concepto || "Sin concepto",
    Number(fila.anchoM) > 0 || Number(fila.altoM) > 0 ? `${fila.anchoM}×${fila.altoM}` : "Pieza",
    ...fila.cantidades.map((c) => (Number(c) > 0 ? c : "—")),
    fila.piezas,
  ]);
  filas.push([
    [{ texto: "Totales", negrita: true }],
    "",
    ...levantamiento.porArea.map((a) => [{ texto: a.piezas, negrita: true }]),
    [{ texto: String(levantamiento.piezas), negrita: true }],
  ]);

  tabla(lienzo, columnas, filas, { estilo: "oscura", centrarVertical: true });
  lienzo.espacio(12);
  lienzo.texto(`Área total de producción: ${levantamiento.areaM2} m²`, { tamano: 9, color: COLOR.suave });
}

const columnasCotizacion = (): Columna[] => [
  { titulo: "Cantidad", ancho: 66, alineacion: "centro" },
  { titulo: "Tiempo estimado", ancho: 76, alineacion: "centro" },
  { titulo: "Resumen de alcance", ancho: 190 },
  { titulo: "Costo unitario", ancho: 76, alineacion: "centro" },
  { titulo: "Subtotal", ancho: 88, alineacion: "centro" },
];

/** Una página por opción de material (y por modalidad A/B si aplica). */
function paginaDeOpcion(
  lienzo: Lienzo,
  datos: DatosPdf,
  nombre: string,
  descripcion: string | null,
  variante: Variante,
  imagen: PDFImage | null,
) {
  lienzo.nuevaPagina();
  lienzo.espacio(30);
  lienzo.titulo(nombre, { tamano: 16, color: COLOR.tinta });
  if (variante.clave !== "unica") {
    lienzo.espacio(-8);
    lienzo.texto(variante.etiqueta, { tamano: 10, color: COLOR.morado, alineacion: "centro" });
    lienzo.espacio(10);
  }
  lienzo.espacio(14);

  const tiempo = datos.tiempoEstimado ?? "Por definir";
  const concepto = datos.alcance?.concepto?.trim() || datos.titulo;
  const alcance: { texto: string; negrita?: boolean }[] = [{ texto: `Concepto: ${concepto}`, negrita: true }];
  if (datos.alcance?.resumen?.trim()) alcance.push({ texto: datos.alcance.resumen.trim() });
  if (descripcion) alcance.push({ texto: `Descripción: ${descripcion}`, negrita: true });
  if (datos.incluyeEnvio) alcance.push({ texto: "Incluye envío", negrita: true });

  const filas: Celda[][] = variante.filas.map((fila, i) => [
    fila.cantidad,
    tiempo,
    i === 0 ? alcance : [{ texto: fila.concepto, negrita: true }],
    [{ texto: `${formatoMoneda(fila.unitario)} MXN`, negrita: true }],
    `${formatoMoneda(fila.subtotal)} MXN`,
  ]);

  tabla(lienzo, columnasCotizacion(), filas, { estilo: "reticula", tamano: 8.8, alturaMinima: 70, centrarVertical: true });
  bloqueTotales(lienzo, variante);
  cierreDeCotizacion(lienzo);

  if (imagen) dibujarImagen(lienzo, imagen);
}

function materialesAdicionales(lienzo: Lienzo, datos: DatosPdf) {
  const { reventa } = datos.resultado;
  if (reventa.items.length === 0) return;

  lienzo.nuevaPagina();
  lienzo.espacio(10);
  lienzo.titulo("Materiales adicionales", { tamano: 16, color: COLOR.tinta });
  lienzo.espacio(14);

  const tiempo = datos.tiempoEstimado ?? "Por definir";
  const filas: Celda[][] = reventa.items.map((item) => {
    const alcance = [{ texto: `Concepto: ${item.nombre}`, negrita: true }];
    if (datos.incluyeEnvio) alcance.push({ texto: "Incluye envío", negrita: true });
    return [
      item.cantidad,
      tiempo,
      alcance,
      [{ texto: `${formatoMoneda(item.unitario)} MXN`, negrita: true }],
      `${formatoMoneda(item.subtotal)} MXN`,
    ];
  });

  tabla(lienzo, columnasCotizacion(), filas, { estilo: "reticula", tamano: 8.8, alturaMinima: 58, centrarVertical: true });
  bloqueTotales(lienzo, { subtotal: reventa.subtotal, descuento: "0", iva: reventa.iva, total: reventa.total });
  cierreDeCotizacion(lienzo);
}

function bloqueTotales(lienzo: Lienzo, variante: Pick<Variante, "subtotal" | "descuento" | "iva" | "total">) {
  const ancho = 200;
  const x = PAGINA.ancho - MARGEN.x - ancho - 8;
  const renglones: [string, string][] = [["Subtotal", variante.subtotal]];
  if (Number(variante.descuento) > 0) renglones.push(["Descuento", `-${variante.descuento}`]);
  renglones.push(["IVA 16%", variante.iva]);

  lienzo.espacio(12);
  lienzo.asegurarEspacio(renglones.length * 14 + 30);

  for (const [etiqueta, valor] of renglones) {
    const y = lienzo.y - 9;
    lienzo.textoEn(etiqueta, x, y, { tamano: 9, color: COLOR.suave });
    const importe = formatoMoneda(valor);
    lienzo.textoEn(importe, x + ancho - lienzo.anchoDe(importe, 9), y, { tamano: 9 });
    lienzo.espacio(14);
  }

  lienzo.espacio(2);
  lienzo.rectangulo(x - 8, lienzo.y - 22, ancho + 16, 24, COLOR.morado);
  const total = formatoMoneda(variante.total);
  lienzo.textoEn("Total", x, lienzo.y - 15, { tamano: 10.5, negrita: true, color: COLOR.blanco });
  lienzo.textoEn(total, x + ancho - lienzo.anchoDe(total, 10.5, true), lienzo.y - 15, {
    tamano: 10.5,
    negrita: true,
    color: COLOR.blanco,
  });
  lienzo.espacio(26);
}

/** "Precios sin IVA" y la leyenda del diseño, obligatoria en cada página de cotización. */
function cierreDeCotizacion(lienzo: Lienzo) {
  lienzo.espacio(4);
  lienzo.texto("Precios sin IVA", { tamano: 11 });
  lienzo.espacio(4);
  lienzo.texto(LEYENDA_DISENO, { tamano: 7.5, color: COLOR.tenue, interlineado: 10.5 });
}

/** Foto de referencia centrada debajo de la tabla, como en las propuestas de Canva. */
function dibujarImagen(lienzo: Lienzo, imagen: PDFImage) {
  const anchoMaximo = 420;
  const altoMaximo = 300;
  lienzo.espacio(16);
  if (lienzo.y - MARGEN.abajo < 140) lienzo.nuevaPagina();

  const disponible = Math.min(altoMaximo, lienzo.y - MARGEN.abajo);
  const escala = Math.min(anchoMaximo / imagen.width, disponible / imagen.height, 1.5);
  const ancho = imagen.width * escala;
  const alto = imagen.height * escala;

  lienzo.pagina.drawImage(imagen, { x: (PAGINA.ancho - ancho) / 2, y: lienzo.y - alto, width: ancho, height: alto });
  lienzo.espacio(alto);
}
