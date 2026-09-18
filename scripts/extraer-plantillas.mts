/**
 * Saca del PDF de Canva el "marco" de la propuesta: las páginas fijas tal cual y
 * las dos plantillas (portada e interior) sin el texto ni las tablas de la
 * cotización concreta con la que se exportó.
 *
 * Se corre UNA sola vez por rediseño; el resultado se guarda en el repositorio y
 * la app solo lo incrusta. No forma parte del código que se ejecuta en Vercel.
 *
 *   npx tsx scripts/extraer-plantillas.mts "ruta/al/PDF de Canva.pdf"
 *
 * Si algún día cambia el diseño: vuelve a correrlo con el PDF nuevo y revisa el
 * listado de imágenes que imprime, por si hay que ajustar IMAGENES_A_QUITAR.
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { inflateSync } from "node:zlib";
import { PDFDict, PDFDocument, PDFName, PDFRawStream, type PDFRef } from "pdf-lib";

// Páginas del PDF de origen (base 1).
const ORIGEN = {
  portada: 1,
  interior: 5, // Cualquier página de contenido sirve: solo se usa su marco.
  fijas: [2, 3, 4, 10], // Bienvenidos · Por qué Diseñarte · Proceso · Condiciones.
};

/**
 * Imágenes pegadas dentro del cuerpo de la página de interior (la tabla de la
 * cotización original venía como captura, no como texto). Se quitan del marco.
 */
const IMAGENES_A_QUITAR = ["X116"];

const DESTINO = path.join(process.cwd(), "src", "lib", "pdf", "plantillas", "marco.pdf");

const FILTER = PDFName.of("Filter");
const LENGTH = PDFName.of("Length");
const RESOURCES = PDFName.of("Resources");
const XOBJECT = PDFName.of("XObject");
const SUBTYPE = PDFName.of("Subtype");
const CONTENTS = PDFName.of("Contents");

function descomprimir(flujo: PDFRawStream): string {
  const bytes = String(flujo.dict.get(FILTER)).includes("FlateDecode")
    ? inflateSync(Buffer.from(flujo.getContents()))
    : Buffer.from(flujo.getContents());
  return bytes.toString("latin1");
}

/**
 * Quita del flujo de dibujo cada bloque BT…ET, que es donde va todo el texto,
 * y las imágenes listadas. Se salta las cadenas literales "( … )" para no
 * confundir un "BT" que forme parte de un texto con el inicio de un bloque.
 */
function limpiarFlujo(ops: string): { limpio: string; bloques: number } {
  const separador = (c: string | undefined) => c === undefined || /[\s/[\]<>()]/.test(c);
  let salida = "";
  let bloques = 0;
  let i = 0;

  while (i < ops.length) {
    const c = ops[i];

    if (c === "B" && ops[i + 1] === "T" && separador(ops[i - 1]) && separador(ops[i + 2])) {
      const fin = ops.indexOf("ET", i);
      if (fin === -1) break;
      i = fin + 2;
      bloques++;
      continue;
    }

    if (c === "(") {
      let j = i + 1;
      let nivel = 1;
      while (j < ops.length && nivel > 0) {
        if (ops[j] === "\\") j++;
        else if (ops[j] === "(") nivel++;
        else if (ops[j] === ")") nivel--;
        j++;
      }
      salida += ops.slice(i, j);
      i = j;
      continue;
    }

    salida += c;
    i++;
  }

  for (const nombre of IMAGENES_A_QUITAR) salida = salida.replaceAll(`/${nombre} Do`, "");
  return { limpio: salida, bloques };
}

function copiarClaves(origen: PDFDict, destino: PDFDict, omitir: PDFName[]) {
  const fuera = new Set(omitir.map(String));
  for (const [clave, valor] of origen.entries()) {
    if (!fuera.has(String(clave))) destino.set(clave, valor);
  }
}

let bloquesQuitados = 0;

/** Sustituye los Form XObject de unos recursos por copias ya limpias. */
function limpiarRecursos(doc: PDFDocument, recursos: PDFDict, hechas: Map<string, PDFRef>): PDFDict {
  const xobjs = doc.context.lookupMaybe(recursos.get(XOBJECT), PDFDict);
  if (!xobjs) return recursos;

  const nuevosX = doc.context.obj({}) as PDFDict;
  for (const [nombre, ref] of xobjs.entries()) {
    const objeto = doc.context.lookup(ref);
    const esForma = objeto instanceof PDFRawStream && String(objeto.dict.get(SUBTYPE)) === "/Form";
    nuevosX.set(nombre, esForma ? limpiarForma(doc, objeto, ref as PDFRef, hechas) : ref);
  }

  const nuevos = doc.context.obj({}) as PDFDict;
  copiarClaves(recursos, nuevos, [XOBJECT]);
  nuevos.set(XOBJECT, nuevosX);
  return nuevos;
}

function limpiarForma(doc: PDFDocument, forma: PDFRawStream, ref: PDFRef, hechas: Map<string, PDFRef>): PDFRef {
  const clave = String(ref);
  const yaHecha = hechas.get(clave);
  if (yaHecha) return yaHecha;

  const { limpio, bloques } = limpiarFlujo(descomprimir(forma));
  bloquesQuitados += bloques;

  const nueva = doc.context.flateStream(Buffer.from(limpio, "latin1"));
  copiarClaves(forma.dict, nueva.dict, [FILTER, LENGTH, RESOURCES]);
  const nuevoRef = doc.context.register(nueva);
  hechas.set(clave, nuevoRef); // Se registra antes de recorrer por si hay ciclos.

  const recursos = doc.context.lookupMaybe(forma.dict.get(RESOURCES), PDFDict);
  if (recursos) nueva.dict.set(RESOURCES, limpiarRecursos(doc, recursos, hechas));
  return nuevoRef;
}

function limpiarPagina(doc: PDFDocument, indice: number, hechas: Map<string, PDFRef>) {
  const pagina = doc.getPage(indice);
  const flujo = doc.context.lookup(pagina.node.get(CONTENTS));
  if (flujo instanceof PDFRawStream) {
    const { limpio, bloques } = limpiarFlujo(descomprimir(flujo));
    bloquesQuitados += bloques;
    pagina.node.set(CONTENTS, doc.context.register(doc.context.flateStream(Buffer.from(limpio, "latin1"))));
  }
  const recursos = doc.context.lookupMaybe(pagina.node.get(RESOURCES), PDFDict);
  if (recursos) pagina.node.set(RESOURCES, limpiarRecursos(doc, recursos, hechas));
}

/** Lista las imágenes de una página, para poder ajustar IMAGENES_A_QUITAR tras un rediseño. */
function inventarioDeImagenes(doc: PDFDocument, indice: number) {
  const vistas = new Set<string>();
  const recorrer = (recursos: PDFDict | undefined, nivel: number) => {
    const xobjs = recursos && doc.context.lookupMaybe(recursos.get(XOBJECT), PDFDict);
    if (!xobjs) return;
    for (const [nombre, ref] of xobjs.entries()) {
      const x = doc.context.lookup(ref);
      if (!(x instanceof PDFRawStream) || vistas.has(String(ref))) continue;
      vistas.add(String(ref));
      const subtipo = String(x.dict.get(SUBTYPE));
      if (subtipo === "/Image") {
        const medidas = `${x.dict.get(PDFName.of("Width"))}×${x.dict.get(PDFName.of("Height"))}`;
        const peso = (x.getContents().length / 1024).toFixed(0);
        console.log(`${"  ".repeat(nivel)}${String(nombre)} imagen ${medidas} (${peso} KB)`);
      } else if (subtipo === "/Form") {
        recorrer(doc.context.lookupMaybe(x.dict.get(RESOURCES), PDFDict), nivel + 1);
      }
    }
  };
  recorrer(doc.context.lookupMaybe(doc.getPage(indice).node.get(RESOURCES), PDFDict), 1);
}

/**
 * Canva guarda las texturas de fondo a 2400 px (2 MB y más). En una hoja de 21 cm
 * no se nota la diferencia con 1400 px, y el PDF pasa de ~3.5 MB a ~1 MB.
 * Solo toca imágenes grandes en JPG; la máscara de transparencia (SMask) se conserva.
 */
async function aligerarImagenes(doc: PDFDocument, ladoMaximo = 1400, calidad = 72) {
  const { createCanvas, loadImage } = await import("@napi-rs/canvas");

  for (const [ref, objeto] of doc.context.enumerateIndirectObjects()) {
    if (!(objeto instanceof PDFRawStream) || String(objeto.dict.get(SUBTYPE)) !== "/Image") continue;
    const ancho = Number(String(objeto.dict.get(PDFName.of("Width"))));
    const alto = Number(String(objeto.dict.get(PDFName.of("Height"))));
    const filtro = String(objeto.dict.get(FILTER));
    if (Math.max(ancho, alto) <= ladoMaximo || !filtro.includes("DCTDecode")) continue;

    // Puede venir como [/FlateDecode /DCTDecode]: primero se quita la capa Flate.
    const jpg = filtro.includes("FlateDecode") ? inflateSync(Buffer.from(objeto.getContents())) : Buffer.from(objeto.getContents());
    const imagen = await loadImage(jpg);
    const escala = ladoMaximo / Math.max(ancho, alto);
    const nuevoAncho = Math.round(ancho * escala);
    const nuevoAlto = Math.round(alto * escala);
    const lienzo = createCanvas(nuevoAncho, nuevoAlto);
    lienzo.getContext("2d").drawImage(imagen, 0, 0, nuevoAncho, nuevoAlto);
    const reducido = lienzo.toBuffer("image/jpeg", calidad);

    const nuevo = doc.context.stream(reducido);
    copiarClaves(objeto.dict, nuevo.dict, [FILTER, LENGTH, PDFName.of("DecodeParms"), PDFName.of("Width"), PDFName.of("Height")]);
    nuevo.dict.set(FILTER, PDFName.of("DCTDecode"));
    nuevo.dict.set(PDFName.of("Width"), doc.context.obj(nuevoAncho));
    nuevo.dict.set(PDFName.of("Height"), doc.context.obj(nuevoAlto));
    doc.context.assign(ref, nuevo);

    const antes = (objeto.getContents().length / 1024).toFixed(0);
    console.log(`imagen ${String(ref)}: ${ancho}×${alto} ${antes} KB → ${nuevoAncho}×${nuevoAlto} ${(reducido.length / 1024).toFixed(0)} KB`);
  }
}

// ---

const fuente = process.argv[2];
if (!fuente) throw new Error("Falta la ruta del PDF de Canva.");

const original = await PDFDocument.load(await readFile(fuente));
const pagina = original.getPage(0);
console.log(`origen: ${original.getPageCount()} páginas de ${pagina.getWidth()} × ${pagina.getHeight()} pt`);
console.log("imágenes de la página de interior (para IMAGENES_A_QUITAR):");
inventarioDeImagenes(original, ORIGEN.interior - 1);

const hechas = new Map<string, PDFRef>();
limpiarPagina(original, ORIGEN.portada - 1, hechas);
limpiarPagina(original, ORIGEN.interior - 1, hechas);
console.log(`bloques de texto quitados: ${bloquesQuitados}`);

const marco = await PDFDocument.create();
const orden = [ORIGEN.portada, ORIGEN.interior, ...ORIGEN.fijas].map((n) => n - 1);
for (const copiada of await marco.copyPages(original, orden)) marco.addPage(copiada);
await aligerarImagenes(marco);

marco.setTitle("Marco de la propuesta · Diseñarte México");
const bytes = await marco.save();
await writeFile(DESTINO, bytes);
console.log(`marco: ${marco.getPageCount()} páginas, ${(bytes.length / 1024).toFixed(0)} KB → ${path.relative(process.cwd(), DESTINO)}`);
