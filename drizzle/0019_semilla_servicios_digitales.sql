-- Catálogo inicial de servicios digitales. Los paquetes web llevan los precios vigentes de la página de
-- Diseñarte (renta con IVA incluido; dueño sin IVA). Los demás quedan con precio por capturar (NULL):
-- el dueño los llena desde el catálogo. Capacitación y soporte llevan el valor que usan las propuestas.
INSERT INTO "servicios_digitales" ("nombre", "categoria", "cobro", "precio", "precio_mensual", "activacion", "meses_renta", "incluye", "tiempo_entrega") VALUES
  ('Página web "Hola Mundo"', 'Paquetes web', 'paquete', 13804, 870, 3364, 12,
   E'Sitio de 1 página (3 a 4 secciones)\nDominio y hosting por 1 año\n1 correo corporativo\nBotón de WhatsApp\nMantenimiento: 1 actualización al mes', '3 días hábiles'),
  ('Página web "Next Level"', 'Paquetes web', 'paquete', 20764, 1102, 7540, 12,
   E'Hasta 4 páginas\nDominio y hosting por 1 año\nHasta 3 correos corporativos\nWhatsApp y formulario de contacto\nSEO básico (aparecer en Google)\nMantenimiento: 2 actualizaciones al mes', '4 días hábiles'),
  ('Página web "Rockstar Digital"', 'Paquetes web', 'paquete', 27724, 1392, 11020, 12,
   E'Hasta 6 páginas\nDominio y hosting por 1 año\nHasta 10 correos corporativos\nWhatsApp, llamada directa y formularios\nSEO avanzado\nMantenimiento: 5 actualizaciones al mes', '5 días hábiles'),
  ('Página adicional', 'Web a la medida', 'unico', NULL, NULL, NULL, 12, 'Diseño y desarrollo de una página adicional del sitio', NULL),
  ('Tienda en línea (carrito y pagos)', 'Web a la medida', 'unico', NULL, NULL, NULL, 12, 'Catálogo de productos con carrito de compra y pagos en línea', NULL),
  ('Idioma adicional', 'Web a la medida', 'unico', NULL, NULL, NULL, 12, 'Versión del sitio en un idioma adicional', NULL),
  ('Cuenta de correo corporativo adicional', 'Web a la medida', 'unico', NULL, NULL, NULL, 12, 'Cuenta de correo con el dominio de la empresa', NULL),
  ('Logotipo', 'Identidad de marca', 'unico', NULL, NULL, NULL, 12, 'Diseño de logotipo con propuestas y rondas de cambios', NULL),
  ('Mini manual de identidad', 'Identidad de marca', 'unico', NULL, NULL, NULL, 12, 'Guía básica de uso del logotipo, colores y tipografías', NULL),
  ('Alta de ficha en Google Business Profile', 'Google y SEO', 'unico', NULL, NULL, NULL, 12, 'Creación y verificación de la ficha para aparecer en Google Maps', NULL),
  ('Recuperación de ficha en Google Business Profile', 'Google y SEO', 'unico', NULL, NULL, NULL, 12, 'Recuperación del control de una ficha existente en Google Maps', NULL),
  ('Manejo de redes sociales', 'Redes sociales', 'mensual', NULL, NULL, NULL, 12, 'Administración mensual de redes sociales', NULL),
  ('Redacción de artículo de blog', 'Contenido', 'unico', NULL, NULL, NULL, 12, 'Redacción de un artículo optimizado para buscadores', NULL),
  ('Aviso de privacidad', 'Otros', 'unico', NULL, NULL, NULL, 12, 'Redacción del aviso de privacidad del sitio', NULL),
  ('Capacitación del proyecto', 'Soporte y capacitación', 'unico', 2789.53, NULL, NULL, 12, 'Capacitación por videollamada en el uso de las herramientas entregadas', NULL),
  ('Soporte técnico y de diseño por 1 año', 'Soporte y capacitación', 'unico', 3284.53, NULL, NULL, 12, 'Soporte técnico y cambios de diseño de hasta el 10% durante un año', NULL);
