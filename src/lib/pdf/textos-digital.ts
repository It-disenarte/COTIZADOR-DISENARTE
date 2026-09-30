/**
 * Textos fijos del PDF de Digitalización. Van dibujados sobre la página interior del marco de Canva
 * (mismo diseño que la publicidad física). Si algún día se hacen en Canva, se sustituyen por esas
 * páginas y este archivo queda solo para lo que escribe el programa.
 */

export const POR_QUE_DIGITAL: { titulo: string; texto: string }[] = [
  {
    titulo: "Todo tu ecosistema digital en un solo lugar.",
    texto: "Página web, identidad de marca, redes sociales y perfil de Google trabajando juntos.",
  },
  {
    titulo: "Diseño con aprobación por etapas.",
    texto: "Primero aprobamos tu página de inicio y sobre esa línea visual construimos lo demás. Cero sorpresas.",
  },
  {
    titulo: "Tiempos claros.",
    texto: "Un calendario de trabajo definido desde el inicio, con entregas que puedes revisar.",
  },
  {
    titulo: "No lo decimos nosotros.",
    texto: "Más de 60 personas nos han regalado sus reseñas brutalmente honestas de nuestro servicio.",
  },
];

export const PROCESO_DIGITAL: { etapa: string; texto: string }[] = [
  {
    etapa: "01 · Kickoff",
    texto: "Platicamos en llamada para entender tu idea y te enviamos el brief para conocer tu marca, tu contenido y lo que esperas de tu sitio.",
  },
  {
    etapa: "02 · Arquitectura",
    texto:
      "Diagnóstico de tu marca con base en el brief. Entregamos el prediseño de la página de inicio, que marca la línea visual del sitio. No se diseña otra sección hasta que la apruebes.",
  },
  {
    etapa: "03 · Diseño",
    texto: "Diseñamos las secciones del sitio en versión de escritorio y celular, con las rondas de cambios incluidas en tu paquete.",
  },
  {
    etapa: "04 · Programación",
    texto:
      "Configuramos dominio, servidor y correos, cargamos tus textos e imágenes, creamos el contacto por formulario y WhatsApp, y damos de alta el sitio en buscadores.",
  },
  {
    etapa: "05 · Entrega",
    texto: "Tu sitio rápido, adaptado a celular y completamente probado, con todos sus accesos.",
  },
];

export const NOTA_TIEMPOS =
  "Los tiempos de entrega pueden adelantarse o retrasarse según la agilidad con la que recibamos tu información y tus aprobaciones.";

export const ENTREGABLES_WEB = [
  "Accesos a todas las plataformas administrativas del sitio.",
  "1 año del servicio de correo (después se renueva).",
  "1 año del dominio (después se renueva).",
];

/** En renta el sitio se queda en nuestro hosting: no se entregan accesos ni se renueva aparte. */
export const ENTREGABLES_RENTA = [
  "Sitio publicado en el hosting que administra Diseñarte, con dominio y correos, mientras dure la renta.",
  "Actualizaciones incluidas en tu paquete cada mes.",
];

export const FUNCIONALIDAD_WEB = [
  "Diseño adaptado a celular y computadora.",
  "Optimización de la velocidad de carga.",
  "Revisión completa de cada sección antes de entregar.",
];

/** Se propone en la cotización nueva; el vendedor lo edita en el Resumen. */
export const NO_INCLUYE_DIGITAL = [
  "Sesión de fotografía, video o producción de contenido audiovisual.",
  "Integración con plataformas ERP, CRM o cualquier sistema externo.",
  "Campañas digitales o pauta publicitaria.",
  "Cambios fuera de las rondas incluidas, o reestructuras que excedan el 10% del diseño aprobado.",
  "Restauraciones por errores o cambios hechos por terceros después de la entrega, y recuperación de información generada durante el desarrollo.",
].join("\n");

export const CONDICIONES_RENTA = [
  "Modalidad renta: el primer pago es la activación, que ya incluye la primera mensualidad. A partir del segundo mes se paga la mensualidad cada mes.",
  "Te enviamos recordatorios días antes de la fecha de pago, el mismo día y el último día de tolerancia. La tolerancia es de 1 día: si la mensualidad no se paga, el sitio se da de baja y se vuelve a habilitar en cuanto se cubre el pago.",
  "Mientras el sitio esté en renta, el dominio y el sitio permanecen en el hosting que Diseñarte administra para sus clientes.",
];

export const CONDICIONES_DIGITAL = [
  "Forma de pago de los servicios de pago único y de la modalidad dueño: anticipo y finiquito al entregar, según los porcentajes indicados en esta propuesta.",
  "El plazo de entrega empieza a contar cuando se cumplen tres condiciones: anticipo recibido, brief contestado y entrega de los contenidos (logotipo, textos y fotografías).",
  "Cualquier demora en la información o en las aprobaciones del cliente pausa el conteo, y la fecha de entrega se reprograma.",
  "Las rondas de cambios son las incluidas en cada paquete. Los cambios adicionales, o los que excedan el 10% del diseño aprobado, se cotizan aparte.",
  "En la modalidad dueño, el dominio y los correos incluyen 1 año de servicio; después de ese año deben renovarse.",
  "En la modalidad dueño, al liquidar se entregan todos los accesos del sitio.",
  "Los textos, imágenes y datos los proporciona el cliente. La producción de fotografía o video no está incluida.",
  "Los precios no incluyen IVA, salvo los paquetes en modalidad renta, que ya lo incluyen.",
  "El soporte está incluido durante el periodo contratado; fuera de él se cotiza aparte.",
  "Penalización por cancelación: Diseñarte no acepta la cancelación de órdenes de compra. En caso de que ocurra, habrá un cargo del 30% del valor total de la cotización.",
  "Las promociones son válidas solo hasta la fecha indicada y por pago de contado.",
  "Nuestros precios están sujetos a cambios sin previo aviso.",
];

export const LEYENDA_DIGITAL =
  "El diseño final se desarrolla a partir del brief contestado y se aprueba por etapas. Los tiempos de entrega podrán verse afectados positiva o negativamente dependiendo de la agilidad del proceso por parte del cliente.";
