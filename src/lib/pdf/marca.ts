/**
 * Datos de la propuesta que dibuja el motor encima del marco de Canva.
 *
 * El diseño (fondos, logo, onda, barra del pie, QR) y las páginas fijas
 * —Bienvenidos, ¿Por qué Diseñarte?, Proceso y Condiciones— salen tal cual de
 * plantillas/marco.pdf, extraído con scripts/extraer-plantillas.mts. Para cambiar
 * esas páginas se edita el diseño en Canva y se vuelve a extraer el marco.
 *
 * Lo de aquí son los textos del pie que el motor escribe sobre la barra morada:
 * si cambian el domicilio, los teléfonos o la cuenta, se cambian en este archivo.
 */

/** Página de 21 × 28 cm, el mismo tamaño que exporta Canva. */
export const PAGINA = { ancho: 595.5, alto: 793.5 };

/** Páginas de plantillas/marco.pdf (base 0). */
export const MARCO = { portada: 0, interior: 1, bienvenidos: 2, porQue: 3, proceso: 4, condiciones: 5 };

export const EMPRESA = {
  nombre: "Diseñarte México",
  sitio: "www.disenartemx.com",
  correo: "ventas@disenartemx.com",
  telefonos: ["427 211 05 28", "427 100 41 83"],
  direccion: ["Av. Lomas del Pedregoso #371", "76806, San Juan del Río, Qro."],
  banco: {
    banco: "BBVA BANCOMER",
    titular: "Sergio Medina Calixto",
    cuenta: "0485998778",
    clabe: "012 685 004859987783",
    tarjeta: "4152 3142 4977 0275",
  },
};

/** Obligatoria en cada página de cotización (sección 10.1 de la especificación). */
export const LEYENDA_DISENO =
  "El diseño presentado es un apoyo visual de lo que se cotiza. El diseño final se desarrolla con la orden de " +
  "compra, alineado a su identidad, y cada pieza se autoriza antes de producción.";
