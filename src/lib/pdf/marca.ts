/**
 * Datos y textos de la propuesta. Todo lo editable de la marca vive aquí:
 * si cambian el domicilio, los teléfonos o las condiciones, se cambian en este archivo.
 *
 * Los textos fijos están tomados de la propuesta actual de Canva
 * (COT-14092026 Señaletica - Claudia.P.pdf).
 */

/** Página de 21 × 28 cm, el mismo tamaño que exporta Canva. */
export const PAGINA = { ancho: 595.5, alto: 793.5 };

export const EMPRESA = {
  nombre: "Diseñarte México",
  sitio: "www.disenartemx.com",
  correo: "ventas@disenartemx.com",
  telefonos: "427 211 05 28 · 427 100 41 83",
  direccion: "Av. Lomas del Pedregoso #371, 76806, San Juan del Río, Qro.",
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

export const BIENVENIDOS = {
  titulo: "Bienvenidos",
  parrafos: [
    "En Diseñarte México creemos que cada proyecto es una oportunidad para transformar espacios y crear experiencias que proyecten confianza, identidad y orgullo.",
    "Nos respaldan más de 22 años de experiencia desarrollando soluciones integrales: desde comunicación visual, señalética estratégica e imagen corporativa, hasta marketing digital avanzado e inteligencia artificial para multiplicar la competitividad de su empresa.",
    "Nuestro nivel de excelencia y compromiso no solo se dice, se demuestra con resultados. Hemos sido galardonados por Imbera México con el Primer Lugar como Proveedor Destacado (2023 y 2024).",
    "No buscamos ser un simple proveedor; somos el aliado estratégico que aportará valor, certidumbre y resultados a su visión de negocio.",
    "Gracias por su confianza. Será un placer construir juntos este proyecto.",
  ],
};

export const POR_QUE = {
  titulo: "¿Por qué Diseñarte México?",
  puntos: [
    {
      titulo: "No lo decimos nosotros",
      texto: "Más de 60 personas nos han regalado sus reseñas brutalmente honestas de nuestro servicio.",
    },
    {
      titulo: "Soluciones integrales in-house",
      texto: "Controlamos la maquinaria en sitio para asegurar congruencia total en color y calidad.",
    },
    {
      titulo: "Operación automatizada",
      texto: "Trazabilidad total de sus requerimientos mediante flujos de trabajo estrictos. Cero improvisación.",
    },
    {
      titulo: "Ingeniería de pre-diseño",
      texto: "Filtramos y corregimos archivos mal planteados antes de gastar un peso de su presupuesto.",
    },
    {
      titulo: "Tiempos innegociables",
      texto: "Nuestras fechas de entrega son promesas selladas respaldadas por nuestro orden de fábrica.",
    },
  ],
};

export const PROCESO = {
  titulo: "Proceso de trabajo",
  pasos: [
    {
      titulo: "Solicitud",
      texto:
        "El cliente identifica su necesidad y nos contacta por WhatsApp o correo. Para proyectos grandes agendamos una visita; si no es necesario, puede enviarnos la información.",
    },
    {
      titulo: "Cotización y aprobación",
      texto: "Enviamos la cotización y, tras su aprobación, esperamos la orden de compra para iniciar el trabajo.",
    },
    {
      titulo: "Diseño y revisión",
      texto:
        "Se realiza una primera reunión con el equipo involucrado en el proyecto, se entrega un pre-diseño, se trabajan modificaciones y se entrega el diseño final.",
    },
    {
      titulo: "Producción y entrega",
      texto:
        "Una vez aprobado el diseño, se procesa la orden y se entrega al cliente. Si se requiere instalación, se agenda directamente con el cliente.",
    },
  ],
};

export const CONDICIONES = {
  titulo: "Condiciones comerciales",
  puntos: [
    "Forma de pago: 70% de anticipo y 30% al entregar.",
    "Tiempo de entrega y requisitos: el plazo depende del concepto; los días hábiles comenzarán a correr a partir de que se cumplan tres condiciones: recepción del anticipo o de la orden de compra, aprobación final del diseño y entrega total de la información y materiales (logos, textos, referencias) por parte del cliente.",
    "Responsabilidad de información y retrasos: el cliente reconoce que la fluidez en la entrega de activos es vital. Cualquier demora en la entrega de información o en los tiempos de respuesta para aprobaciones suspenderá el conteo de días hábiles, reprogramando la fecha final según la disponibilidad de la cola de producción.",
    "Para la generación de factura es necesario cumplir con un consumo mínimo de $100.00.",
    "El diseño estará incluido en el costo si se realiza el trabajo con Diseñarte.",
    "El diseño se comenzará a trabajar a partir de recibir la orden de compra.",
    "Ante varias propuestas del mismo material imperarán las condiciones del último presupuesto.",
    "Una vez aceptado el pedido o cotización, los precios de suministro serán fijos y no están sujetos a revisión.",
    "Penalización por cancelación: Diseñarte no acepta la cancelación de órdenes de compra. En caso de que ocurriera, habrá un cargo del 30% del valor total de la cotización.",
    "Si cuenta con saldo a favor con Diseñarte, tendrá 1 mes a partir de la última entrega registrada para hacer uso del mismo; de lo contrario se considerará un saldo insoluto de $0.00.",
    "Nuestros precios están sujetos a cambios sin previo aviso.",
    "Una vez aceptada la cotización y después de haber manejado un anticipo, la propuesta de diseño será propiedad del cliente. De no ser así, Diseñarte puede disponer de ella.",
    "Gestión multidisciplinaria del proyecto: su proyecto es gestionado de manera integral. Contamos con diversos departamentos y especialistas (diseño, producción y calidad) al tanto de los procesos para garantizar la excelencia en cada etapa.",
    "Alcance y modificaciones: una vez aprobada la propuesta visual, cualquier cambio estructural o de concepto derivado de información nueva proporcionada por el cliente se considerará un re-trabajo y generará un costo adicional proporcional.",
    "Almacenaje y retiro: una vez notificada la terminación del trabajo, el cliente cuenta con 5 días hábiles para recolectar el material. Pasado este tiempo, Diseñarte no se hace responsable por daños y se podrá aplicar un cargo por almacenaje.",
  ],
};
