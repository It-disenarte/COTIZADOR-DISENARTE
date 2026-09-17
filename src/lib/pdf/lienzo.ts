import { type PDFDocument, type PDFFont, type PDFImage, type PDFPage, rgb, type RGB } from "pdf-lib";
import { EMPRESA, PAGINA } from "./marca";

export const COLOR = {
  tinta: rgb(0.09, 0.086, 0.11),
  suave: rgb(0.42, 0.41, 0.45),
  tenue: rgb(0.62, 0.61, 0.65),
  acento: rgb(0.82, 0.31, 0.15),
  regla: rgb(0.87, 0.86, 0.9),
  fondoSuave: rgb(0.96, 0.955, 0.97),
  blanco: rgb(1, 1, 1),
};

export const MARGEN = { x: 52, arriba: 62, abajo: 78 };

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
  /** Se ejecuta al abrir cada página nueva (fondos, encabezados). */
  alAbrirPagina?: (lienzo: Lienzo) => void;

  constructor(
    private readonly doc: PDFDocument,
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

  anchoDe(texto: string, tamano: number, negrita = false): number {
    return this.fuente(negrita).widthOfTextAtSize(texto, tamano);
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

  titulo(texto: string, tamano = 22) {
    this.asegurarEspacio(tamano * 2);
    this.texto(texto, { tamano, negrita: true, interlineado: tamano * 1.2 });
    this.espacio(6);
    this.linea(COLOR.acento, 2, 64);
    this.espacio(18);
  }

  linea(color = COLOR.regla, grosor = 1, ancho = this.anchoUtil, x = MARGEN.x) {
    this.pagina.drawLine({
      start: { x, y: this.y },
      end: { x: x + ancho, y: this.y },
      thickness: grosor,
      color,
    });
  }

  /** Rectángulo de fondo, útil para encabezados de tabla y bloques de totales. */
  rectangulo(x: number, y: number, ancho: number, alto: number, color: RGB) {
    this.pagina.drawRectangle({ x, y, width: ancho, height: alto, color });
  }

  imagenFondo(imagen: PDFImage) {
    this.pagina.drawImage(imagen, { x: 0, y: 0, width: PAGINA.ancho, height: PAGINA.alto });
  }

  /** Pie con domicilio, contacto y datos bancarios, igual que la propuesta actual. */
  pieDeContacto() {
    const tamano = 6.5;
    const interlineado = 8.5;
    const { banco } = EMPRESA;
    const izquierda = [EMPRESA.direccion, EMPRESA.correo, EMPRESA.telefonos];
    const derecha = [
      `Banco: ${banco.banco}`,
      `Titular: ${banco.titular}`,
      `Cuenta: ${banco.cuenta} · CLABE: ${banco.clabe}`,
      EMPRESA.sitio,
    ];

    const base = MARGEN.abajo - 26;
    this.pagina.drawLine({
      start: { x: MARGEN.x, y: base + derecha.length * interlineado + 6 },
      end: { x: PAGINA.ancho - MARGEN.x, y: base + derecha.length * interlineado + 6 },
      thickness: 0.7,
      color: COLOR.regla,
    });

    izquierda.forEach((renglon, i) => {
      this.pagina.drawText(renglon, {
        x: MARGEN.x,
        y: base + (izquierda.length - 1 - i) * interlineado,
        size: tamano,
        font: this.regular,
        color: COLOR.tenue,
      });
    });

    derecha.forEach((renglon, i) => {
      const ancho = this.anchoDe(renglon, tamano);
      this.pagina.drawText(renglon, {
        x: PAGINA.ancho - MARGEN.x - ancho,
        y: base + (derecha.length - 1 - i) * interlineado,
        size: tamano,
        font: this.regular,
        color: COLOR.tenue,
      });
    });
  }
}

export type Columna = {
  titulo: string;
  ancho: number;
  alineacion?: "izquierda" | "derecha";
};

/** Tabla con encabezado que se repite si el contenido salta de página. */
export function tabla(
  lienzo: Lienzo,
  columnas: Columna[],
  filas: string[][],
  { tamano = 8.5, alturaMinima = 22 }: { tamano?: number; alturaMinima?: number } = {},
) {
  const dibujarEncabezado = () => {
    const alto = 20;
    lienzo.asegurarEspacio(alto + 4);
    lienzo.rectangulo(MARGEN.x, lienzo.y - alto + 6, lienzo.anchoUtil, alto, COLOR.fondoSuave);
    let x = MARGEN.x + 8;
    for (const columna of columnas) {
      const ancho = lienzo.anchoDe(columna.titulo, tamano - 0.5, true);
      lienzo.pagina.drawText(columna.titulo, {
        x: columna.alineacion === "derecha" ? x + columna.ancho - ancho - 16 : x,
        y: lienzo.y - alto + 13,
        size: tamano - 0.5,
        font: lienzo.fuente(true),
        color: COLOR.suave,
      });
      x += columna.ancho;
    }
    lienzo.y -= alto + 4;
  };

  dibujarEncabezado();

  for (const fila of filas) {
    const celdas = fila.map((celda, i) => lienzo.renglones(celda, tamano, columnas[i].ancho - 16));
    const alto = Math.max(alturaMinima, ...celdas.map((c) => c.length * (tamano * 1.35) + 10));

    if (lienzo.y - alto < MARGEN.abajo) {
      lienzo.nuevaPagina();
      dibujarEncabezado();
    }

    let x = MARGEN.x + 8;
    celdas.forEach((renglones, i) => {
      renglones.forEach((renglon, j) => {
        const anchoTexto = lienzo.anchoDe(renglon, tamano);
        lienzo.pagina.drawText(renglon, {
          x: columnas[i].alineacion === "derecha" ? x + columnas[i].ancho - anchoTexto - 16 : x,
          y: lienzo.y - tamano - 2 - j * (tamano * 1.35),
          size: tamano,
          font: lienzo.fuente(false),
          color: COLOR.tinta,
        });
      });
      x += columnas[i].ancho;
    });

    lienzo.y -= alto;
    lienzo.linea();
  }
}
