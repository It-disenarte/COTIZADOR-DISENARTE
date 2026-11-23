-- Cotización rápida: costos indirectos de 5% y tarifa por hora del tiempo de desarrollo (diseño y producción
-- juntos). La tarifa de partida es el día de trabajo homologado ($700) entre 8 horas; el dueño la confirma.
INSERT INTO "parametros" ("clave", "valor", "unidad", "descripcion") VALUES
  ('pct_indirectos', 0.05, 'fracción', 'Costos indirectos de la cotización rápida, sobre el costo directo (se aplica junto con el margen de error).'),
  ('tarifa_hora_desarrollo', 87.5, 'MXN por hora', 'Tarifa por hora del tiempo de desarrollo (diseño y producción) de la cotización rápida. Parte de $700 por día entre 8 horas.');
