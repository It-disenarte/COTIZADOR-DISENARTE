-- Precios de operación de la ficha «Cómo cotizamos, y qué tiene que calcular el cotizador» (sep 2026),
-- tomados de la lista PLANEACIÓN DE TRABAJO – PRECIOS. Son los números con los que se cotiza de verdad
-- y con los que el motor debe reproducir el caso del Nissan Versa.
-- Los costos del Excel (costo primo de maquila) se conservan como referencia interna.
-- Todo es editable desde la app; esto solo es el punto de partida.

-- Distinguir en el catálogo los costos primos del Excel -----------------------------------------
UPDATE "insumos" SET "categoria" = 'Costo primo · ' || "categoria"
WHERE "fuente" LIKE 'Excel%';
--> statement-breakpoint

-- Precios de operación --------------------------------------------------------------------------
INSERT INTO "insumos" ("nombre", "categoria", "unidad_costo", "costo", "requiere_revision", "fuente") VALUES
  ('Corte de vinil', 'Rotulación', 'm2', 400, false, 'Lista PLANEACIÓN DE TRABAJO – PRECIOS. Mismo precio en cualquier color.'),
  ('Trovicel 3 mm con impresión', 'Señalética', 'm2', 1200, false, 'Lista PLANEACIÓN DE TRABAJO – PRECIOS. Ya incluye impresión a dos caras: no se duplica el metraje.'),
  ('Impresión en vinil UV', 'Impresión', 'm2', 1700, false, 'Lista PLANEACIÓN DE TRABAJO – PRECIOS. Impresión de larga duración.'),
  ('Fotomural Wall Xtreme', 'Vinil de muro', 'm2', 580.80, false, 'Lista PLANEACIÓN DE TRABAJO – PRECIOS. Solo material.'),
  ('Corte en acrílico 6 mm', 'Acrílico', 'm2', 2299, false, 'Lista PLANEACIÓN DE TRABAJO – PRECIOS. Material y corte.'),
  ('Placa de MDF', 'Tableros', 'pieza', 800, false, 'Lista PLANEACIÓN DE TRABAJO – PRECIOS. Base de tablero.'),
  ('Chapetón', 'Herrajes', 'pieza', 65, false, 'Lista PLANEACIÓN DE TRABAJO – PRECIOS. Separador de montaje.'),
  ('Contador digital', 'Tableros', 'pieza', 3000, false, 'Lista PLANEACIÓN DE TRABAJO – PRECIOS. Para tableros de días sin accidentes.'),
  ('Enmarcado / caja de 15 cm', 'Tableros', 'pieza', 4500, false, 'Lista PLANEACIÓN DE TRABAJO – PRECIOS. Marco perimetral de tablero.'),
  ('Amarre de letrero', 'Herrajes', 'pieza', 75, false, 'Lista PLANEACIÓN DE TRABAJO – PRECIOS. 2 cables de acero de 1 m con ojillos.'),
  ('Cinta doble cara', 'Consumibles', 'pieza', 800, false, 'Lista PLANEACIÓN DE TRABAJO – PRECIOS. Rollo para montaje de porta gráficos.'),
  ('Insumos de aplicación en rotulación', 'Consumibles', 'pieza', 200, true, 'Lista PLANEACIÓN DE TRABAJO – PRECIOS. Alcohol, franelas, espátulas y cinta de montaje; en la ficha aparece como ≈$200.'),
  ('Tablero dinámico 120 × 244 cm', 'Tableros', 'pieza', 22044, false, 'Lista PLANEACIÓN DE TRABAJO – PRECIOS. Lámina galvanizada cal. 18, impresión 1400 dpi, borrado en seco, ruedas, perfil R-249 y diseño.');
--> statement-breakpoint

-- Sin merma explícita: hoy se cotiza sobre el área de la pieza (ficha, pregunta abierta 2) -------
UPDATE "recetas" SET "pct_merma" = 0;
--> statement-breakpoint

-- Rotulación: el caso del Versa usa corte de vinil por m² + insumos de aplicación por unidad -----
DELETE FROM "receta_componentes"
WHERE "receta_id" = (SELECT "id" FROM "recetas" WHERE "nombre" = 'Corte de vinil (rotulación)');
--> statement-breakpoint

INSERT INTO "receta_componentes" ("receta_id", "insumo_id", "modo", "cantidad")
SELECT r."id", i."id", 'por_m2', 1
FROM "recetas" r, "insumos" i
WHERE r."nombre" = 'Corte de vinil (rotulación)' AND i."nombre" = 'Corte de vinil';
--> statement-breakpoint

INSERT INTO "receta_componentes" ("receta_id", "insumo_id", "modo", "cantidad")
SELECT r."id", i."id", 'por_pieza', 1
FROM "recetas" r, "insumos" i
WHERE r."nombre" = 'Corte de vinil (rotulación)' AND i."nombre" = 'Insumos de aplicación en rotulación';
--> statement-breakpoint

-- Recetas de las demás familias de la ficha ------------------------------------------------------
WITH r AS (
  INSERT INTO "recetas" ("nombre", "familia", "descripcion_pdf", "pct_merma")
  VALUES ('Trovicel 3 mm con impresión', 'senaletica', 'Letrero en trovicel de 3 mm con impresión a dos caras.', 0)
  RETURNING "id"
)
INSERT INTO "receta_componentes" ("receta_id", "insumo_id", "modo", "cantidad")
SELECT r."id", i."id", 'por_m2', 1 FROM r, "insumos" i WHERE i."nombre" = 'Trovicel 3 mm con impresión';
--> statement-breakpoint

WITH r AS (
  INSERT INTO "recetas" ("nombre", "familia", "descripcion_pdf", "pct_merma")
  VALUES ('Fotomural Wall Xtreme', 'vinil_muro', 'Fotomural impreso en vinil de muro Wall Xtreme.', 0)
  RETURNING "id"
)
INSERT INTO "receta_componentes" ("receta_id", "insumo_id", "modo", "cantidad")
SELECT r."id", i."id", 'por_m2', 1 FROM r, "insumos" i WHERE i."nombre" = 'Fotomural Wall Xtreme';
--> statement-breakpoint

-- El número de chapetones cambia por pieza: aquí van 4 como punto de partida.
WITH r AS (
  INSERT INTO "recetas" ("nombre", "familia", "descripcion_pdf", "pct_merma")
  VALUES ('Acrílico 6 mm con chapetones', 'acrilico', 'Acrílico de 6 mm con corte y montaje con chapetones.', 0)
  RETURNING "id"
)
INSERT INTO "receta_componentes" ("receta_id", "insumo_id", "modo", "cantidad")
SELECT r."id", i."id", 'por_m2', 1 FROM r, "insumos" i WHERE i."nombre" = 'Corte en acrílico 6 mm';
--> statement-breakpoint

INSERT INTO "receta_componentes" ("receta_id", "insumo_id", "modo", "cantidad")
SELECT r."id", i."id", 'por_pieza', 4
FROM "recetas" r, "insumos" i
WHERE r."nombre" = 'Acrílico 6 mm con chapetones' AND i."nombre" = 'Chapetón';
--> statement-breakpoint

WITH r AS (
  INSERT INTO "recetas" ("nombre", "familia", "descripcion_pdf", "pct_merma")
  VALUES ('Tablero dinámico 120 × 244 cm', 'tablero', 'Tablero dinámico en lámina galvanizada calibre 18, impresión a 1400 dpi, superficie de borrado en seco, ruedas y perfil R-249.', 0)
  RETURNING "id"
)
INSERT INTO "receta_componentes" ("receta_id", "insumo_id", "modo", "cantidad")
SELECT r."id", i."id", 'por_pieza', 1 FROM r, "insumos" i WHERE i."nombre" = 'Tablero dinámico 120 × 244 cm';
