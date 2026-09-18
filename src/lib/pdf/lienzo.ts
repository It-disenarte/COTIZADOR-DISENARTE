import {
  type PDFDocument,
  type PDFFont,
  type PDFPage,
  popGraphicsState,
  pushGraphicsState,
  rgb,
  type RGB,
  setCharacterSpacing,
} from "pdf-lib";
import { PAGINA } from "./marca";

export const COLOR = {
  tinta: rgb(0.07, 0.07, 0.09),
  suave: rgb(0.3, 0.3, 0.34),
  tenue: rgb(0.5, 0.5, 0.54),
  morado: rgb(0.43, 0.15, 0.6),
  encabezadoTabla: rgb(0.2, 0.23, 0.29),
  reticula: rgb(0.08, 0.08, 0.1),
  reglaSuave: rgb(0.84, 0.84, 0.87),
  filaAlterna: rgb(0.965, 0.965, 0.975),
  blanco: rgb(1, 1, 1),
};

/** Área útil de las páginas interiores: entre la onda del encabezado y la barra del pie. */
export const MARGEN = { x: 45, arriba: 125, abajo: 100 };

type OpcionesTexto = {
  tamano?: number;
  negrita?: boolean;
  color?: RGB;
  ancho?: number;
  interlineado?: number;
  x?: number;
  alineacion?: "izquierda" | "derecha" | "centro";
};

/**
 * Dibuja el documento de arriba hacia abajo, llevando la cuenta de la posición
 * vertical y saltando de página cuando ya no cabe.
 */
export class Lienzo {
  pagina!: PDFPage;
  y = 0;
  paginas = 0;
  /** Se ejecuta al abrir cada página nueva (fondo del marco, encabezado, pie). */
  alAbrirPagina?: (lienzo: Lienzo) => void;

  constructor(
    readonly doc: PDFDocument,
    private readonly regular: PDFFont,
    private readonly negrita: PDFFont,
  ) {}

  get anchoUtil(): number {
    return PAGINA.ancho - MARGEN.x * 2;
  }

  fuente(negrita = false): PDFFont {
    return negrita ? this.negrita : this.regular;
  }

  nuevaPagina(): PDFPage {
    this.pagina = this.doc.addPage([PAGINA.ancho, PAGINA.alto]);
    this.paginas += 1;
    this.y = PAGINA.alto - MARGEN.arriba;
    this.alAbrirPagina?.(this);
    return this.pagina;
  }

  /** Abre página nueva si lo que sigue no cabe en el espacio restante. */
  asegurarEspacio(alto: number) {
    if (this.y - alto < MARGEN.abajo) this.nuevaPagina();
  }

  espacio(alto: number) {
    this.y -= alto;
  }

  anchoDe(texto: string, tamano: number, negrita = false, espaciado = 0): number {
    return this.fuente(negrita).widthOfTextAtSize(texto, tamano) + espaciado * Math.max(texto.length - 1, 0);
  }

  /** Corta el texto en renglones que quepan en el ancho dado. */
  renglones(texto: string, tamano: number, ancho: number, negrita = false): string[] {
    const fuente = this.fuente(negrita);
    const salida: string[] = [];

    for (const parrafo of texto.split("\n")) {
      let renglon = "";
      for (const palabra of parrafo.split(/\s+/).filter(Boolean)) {
        const intento = renglon ? `${renglon} ${palabra}` : palabra;
        if (fuente.widthOfTextAtSize(intento, tamano) <= ancho || !renglon) {
          renglon = intento;
        } else {
          salida.push(renglon);
          renglon = palabra;
        }
      }
      salida.push(renglon);
    }
    return salida;
  }

  /** Texto suelto en una posición exacta (portada, encabezado, pie). Admite interletrado. */
  textoEn(
    texto: string,
    x: number,
    y: number,
    { tamano = 10, negrita = false, color = COLOR.tinta, espaciado = 0 }: {
      tamano?: number;
      negrita?: boolean;
      color?: RGB;
      espaciado?: number;
    } = {},
  ) {
    if (espaciado) this.pagina.pushOperators(pushGraphicsState(), setCharacterSpacing(espaciado));
    this.pagina.drawText(texto, { x, y, size: tamano, font: this.fuente(negrita), color });
    if (espaciado) this.pagina.pushOperators(popGraphicsState());
  }

  texto(texto: string, opciones: OpcionesTexto = {}): void {
    const {
      tamano = 10,
      negrita = false,
      color = COLOR.tinta,
      ancho = this.anchoUtil,
      interlineado = tamano * 1.45,
      x = MARGEN.x,
      alineacion = "izquierda",
    } = opciones;

    for (const renglon of this.renglones(texto, tamano, ancho, negrita)) {
      this.asegurarEspacio(interlineado);
      const anchoRenglon = this.anchoDe(renglon, tamano, negrita);
      const posX =
        alineacion === "derecha" ? x + ancho - anchoRenglon : alineacion === "centro" ? x + (ancho - anchoRenglon) / 2 : x;
      this.pagina.drawText(renglon, { x: posX, y: this.y - tamano, size: tamano, font: this.fuente(negrita), color });
      this.y -= interlineado;
    }
  }

  /** Título centrado, como los de las páginas de cotización de Canva. */
  titulo(texto: string, { tamano = 17, color = COLOR.morado }: { tamano?: number; color?: RGB } = {}) {
    this.asegurarEspacio(tamano * 3);
    this.texto(texto, { tamano, negrita: true, color, interlineado: tamano * 1.25, alineacion: "centro" });
    this.espacio(16);
  }

  linea(color = COLOR.reglaSuave, grosor = 1, ancho = this.anchoUtil, x = MARGEN.x) {
    this.pagina.drawLine({ start: { x, y: this.y }, end: { x: x + ancho, y: this.y }, thickness: grosor, color });
  }

  rectangulo(x: number, y: number, ancho: number, alto: number, color: RGB) {
    this.pagina.drawRectangle({ x, y, width: ancho, height: alto, color });
  }
}

export type Columna = {
  titulo: string;
  ancho: number;
  alineacion?: "izquierda" | "derecha" | "centro";
};

export type Celda = string | { texto: string; negrita?: boolean }[];

type OpcionesTabla = {
  tamano?: number;
  alturaMinima?: number;
  /**
   * "oscura": encabezado relleno y renglones con línea suave (consolidado).
   * "reticula": todas las celdas con borde y encabezado en negritas (cotización).
   */
  estilo?: "oscura" | "reticula";
  /** Centra verticalmente el contenido de cada celda. */
  centrarVertical?: boolean;
};

const RELLENO = 8;

/** Tabla con encabezado que se repite si el contenido salta de página. */
export function tabla(lienzo: Lienzo, columnas: Columna[], filas: Celda[][], opciones: OpcionesTabla = {}) {
  const { tamano = 8.5, alturaMinima = 22, estilo = "oscura", centrarVertical = false } = opciones;
  const interlineado = tamano * 1.4;
  const anchoTotal = columnas.reduce((suma, c) => suma + c.ancho, 0);
  const x0 = MARGEN.x + (lienzo.anchoUtil - anchoTotal) / 2;
  const reticula = estilo === "reticula";

  const posicionX = (columna: Columna, x: number, anchoTexto: number) =>
    columna.alineacion === "derecha"
      ? x + columna.ancho - anchoTexto - RELLENO
      : columna.alineacion === "centro"
        ? x + (columna.ancho - anchoTexto) / 2
        : x + RELLENO;

  const bordes = (arriba: number, alto: number) => {
    const grosor = 0.8;
    lienzo.pagina.drawRectangle({ x: x0, y: arriba - alto, width: anchoTotal, height: alto, borderColor: COLOR.reticula, borderWidth: grosor });
    let x = x0;
    for (const columna of columnas.slice(0, -1)) {
      x += columna.ancho;
      lienzo.pagina.drawLine({ start: { x, y: arriba }, end: { x, y: arriba - alto }, thickness: grosor, color: COLOR.reticula });
    }
  };

  const dibujarEncabezado = () => {
    const titulos = columnas.map((c) => lienzo.renglones(c.titulo, tamano, c.ancho - RELLENO * 2, true));
    const alto = Math.max(reticula ? 40 : 22, ...titulos.map((t) => t.length * interlineado + 12));
    lienzo.asegurarEspacio(alto + alturaMinima);
    const arriba = lienzo.y;

    if (!reticula) lienzo.rectangulo(x0, arriba - alto, anchoTotal, alto, COLOR.encabezadoTabla);

    let x = x0;
    columnas.forEach((columna, i) => {
      const inicio = arriba - (alto - titulos[i].length * interlineado) / 2;
      titulos[i].forEach((renglon, j) => {
        lienzo.pagina.drawText(renglon, {
          x: posicionX(reticula ? { ...columna, alineacion: "centro" } : columna, x, lienzo.anchoDe(renglon, tamano, true)),
          y: inicio - tamano - j * interlineado + 1,
          size: tamano,
          font: lienzo.fuente(true),
          color: reticula ? COLOR.tinta : COLOR.blanco,
        });
      });
      x += columna.ancho;
    });

    if (reticula) bordes(arriba, alto);
    lienzo.y -= alto;
  };

  dibujarEncabezado();

  filas.forEach((fila, indiceFila) => {
    // Cada celda es una lista de párrafos; cada párrafo puede ir en negritas.
    const celdas = fila.map((celda, i) => {
      const parrafos = typeof celda === "string" ? [{ texto: celda }] : celda;
      return parrafos.flatMap((p, k) => {
        const renglones = lienzo
          .renglones(p.texto, tamano, columnas[i].ancho - RELLENO * 2, p.negrita)
          .map((texto) => ({ texto, negrita: !!p.negrita }));
        // Un renglón en blanco separa párrafos dentro de la misma celda.
        return k > 0 && typeof celda !== "string" ? [{ texto: "", negrita: false }, ...renglones] : renglones;
      });
    });
    const alto = Math.max(alturaMinima, ...celdas.map((c) => c.length * interlineado + 14));

    if (lienzo.y - alto < MARGEN.abajo) {
      lienzo.nuevaPagina();
      dibujarEncabezado();
    }

    const arriba = lienzo.y;
    if (!reticula && indiceFila % 2 === 1) lienzo.rectangulo(x0, arriba - alto, anchoTotal, alto, COLOR.filaAlterna);

    let x = x0;
    celdas.forEach((renglones, i) => {
      const inicio = centrarVertical ? arriba - (alto - renglones.length * interlineado) / 2 : arriba - 7;
      renglones.forEach((renglon, j) => {
        if (!renglon.texto) return;
        lienzo.pagina.drawText(renglon.texto, {
          x: posicionX(columnas[i], x, lienzo.anchoDe(renglon.texto, tamano, renglon.negrita)),
          y: inicio - tamano - j * interlineado + 1,
          size: tamano,
          font: lienzo.fuente(renglon.negrita),
          color: COLOR.tinta,
        });
      });
      x += columnas[i].ancho;
    });

    if (reticula) bordes(arriba, alto);
    lienzo.y -= alto;
    if (!reticula) {
      lienzo.linea(COLOR.reglaSuave, 0.6, anchoTotal, x0);
    }
  });
}
