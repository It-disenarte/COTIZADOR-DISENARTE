-- Datos semilla de la especificación (secciones 6.1 y 7).
-- Costos = columnas "Sub total" del Excel "Actualización de costos agosto 2026" (sin IVA, sin utilidad,
-- con la inflación de 5% ya incluida). Valores "por capturar" quedan en NULL con requiere_revision = true.
-- Corre una sola vez (tabla de control de migraciones); después todo se edita desde la app.

-- Parámetros de la casa ------------------------------------------------------------------------
INSERT INTO "parametros" ("clave", "valor", "unidad", "descripcion") VALUES
  ('margen', 0.30, 'fracción', 'Margen sobre precio de venta: precio = costo ÷ (1 − margen). Variantes de uso: 0.35 complejidad, 0.40 alta gerencia.'),
  ('pct_margen_error', 0.10, 'fracción', 'Margen de error, opcional por cotización. El Excel lo llama "costos indirectos".'),
  ('pct_consumibles', 0.05, 'fracción', 'Consumibles sobre el costo de materiales.'),
  ('tarifa_instalador_dia', 700, 'MXN por persona por día', 'Tarifa de instalación por persona. También se usa para producción.'),
  ('tarifa_diseno_dia', 700, 'MXN por día', 'Tarifa de diseño por día.'),
  ('viaticos_local_dia', 250, 'MXN por persona por día', 'Viáticos por persona dentro de zona Querétaro.'),
  ('viaticos_foraneo_dia', 500, 'MXN por persona por día', 'Viáticos foráneos por persona: desayuno, comida y cena. Sin hospedaje.'),
  ('rendimiento_km_l', 10, 'km/L', 'Rendimiento de la Hilux. Editable por cotización.'),
  ('precio_gasolina_litro', NULL, 'MXN/L', 'Gasolina Magna. Se avisa si tiene más de 7 días sin actualizar.'),
  ('pct_reventa', 0.35, 'fracción', 'Markup de artículos de reventa sobre el precio de referencia.'),
  ('iva', 0.16, 'fracción', 'IVA.'),
  ('alerta_margen_minimo', 0.25, 'fracción', 'Alerta si el margen real de una opción queda por debajo de este valor.'),
  ('alerta_desvio_precio', 0.15, 'fracción', 'Alerta si un unitario manual se desvía más que esto del calculado.'),
  ('escenario_margen_1', 0.30, 'fracción', 'Escenario de margen 1 de la vista interna.'),
  ('escenario_margen_2', 0.35, 'fracción', 'Escenario de margen 2 de la vista interna.'),
  ('escenario_margen_3', 0.40, 'fracción', 'Escenario de margen 3 de la vista interna.');
--> statement-breakpoint

-- Insumos --------------------------------------------------------------------------------------
INSERT INTO "insumos" ("nombre", "categoria", "unidad_costo", "costo", "ancho_util_m", "area_lamina_m2", "requiere_revision", "fuente") VALUES
  ('Vinil de corte 1.22', 'Vinil de corte', 'ml', 106.15, 1.22, NULL, false, 'Excel · Costo primo de maquila'),
  ('Vinil reflejante grado diamante 1.22', 'Vinil de corte', 'ml', 914.61, 1.22, NULL, true, 'Excel · Costo primo de maquila. Revisar: el costo por ML no se dividió entre el largo del rollo.'),
  ('Vinil esmerilado (corte)', 'Vinil de corte', 'ml', 151.18, 1.22, NULL, true, 'Excel · Costo primo de maquila. Revisar: única fila con IVA dentro del costo; se toma sin IVA.'),
  ('Papel transfer', 'Consumible', 'm2', 43.33, NULL, NULL, false, 'Excel · Costo mixtos'),
  ('Trovicel 3 mm', 'Sustrato', 'lamina', 228.79, NULL, 2.9768, false, 'Excel · Costo mixtos (lámina 1.22 × 2.44 m)'),
  ('Trovicel 6 mm', 'Sustrato', 'lamina', 300.15, NULL, 2.9768, false, 'Excel · Costo mixtos (lámina 1.22 × 2.44 m)'),
  ('Impresión JV33 lona Umag', 'Impresión JV33', 'ml', 180.34, NULL, NULL, true, 'Excel · Costo primo de maquila. Revisar: ancho útil no definido.'),
  ('Impresión JV33 vinil transparente 1.52', 'Impresión JV33', 'ml', 213.65, 1.52, NULL, false, 'Excel · Costo primo de maquila'),
  ('Impresión JV33 vinil esmerilado 1.22', 'Impresión JV33', 'ml', 280.73, 1.22, NULL, false, 'Excel · Costo primo de maquila'),
  ('Impresión JV33 fotomural', 'Impresión JV33', 'ml', 330.63, NULL, NULL, true, 'Excel · Costo primo de maquila. Revisar: ancho útil no definido.'),
  ('Impresión JV33 vinil blanco', 'Impresión JV33', 'ml', 153.80, NULL, NULL, true, 'Excel · Costo primo de maquila. Revisar: precio de material en 0 y ancho útil no definido.'),
  ('Impresión JV33 lona comercial', 'Impresión JV33', 'ml', 153.80, NULL, NULL, true, 'Excel · Costo primo de maquila. Revisar: precio de material en 0 y ancho útil no definido.'),
  ('Impresión JV33 microperforado', 'Impresión JV33', 'ml', 153.80, NULL, NULL, true, 'Excel · Costo primo de maquila. Revisar: precio de material en 0 y ancho útil no definido.'),
  ('Impresión UV lona Umag', 'Impresión UV', 'ml', 1195.38, NULL, NULL, true, 'Excel · Costo primo de maquila. Revisar: tinta fija $1,000/ML vs $249 de la calculadora UV; ancho útil no definido.'),
  ('Impresión UV vinil transparente 1.52', 'Impresión UV', 'ml', 1228.66, 1.52, NULL, true, 'Excel · Costo primo de maquila. Revisar: tinta fija $1,000/ML vs $249 de la calculadora UV.'),
  ('Impresión UV vinil esmerilado 1.22', 'Impresión UV', 'ml', 1295.74, 1.22, NULL, true, 'Excel · Costo primo de maquila. Revisar: tinta fija $1,000/ML vs $249 de la calculadora UV.'),
  ('Impresión UV vinil blanco', 'Impresión UV', 'ml', 1168.81, NULL, NULL, true, 'Excel · Costo primo de maquila. Revisar: tinta fija $1,000/ML vs $249 de la calculadora UV; ancho útil no definido.'),
  ('Acrílico 6 mm corte láser sencillo', 'Corte láser', 'm2', 632.88, NULL, NULL, true, 'Excel · Costo de corte láser. Revisar: láser a $5.08/min vs $50.81/min de la tabla de máquina.'),
  ('Acrílico 6 mm corte láser complicado', 'Corte láser', 'm2', 886.74, NULL, NULL, true, 'Excel · Costo de corte láser. Revisar: láser a $5.08/min vs $50.81/min de la tabla de máquina.'),
  ('Acrílico 3 mm corte láser sencillo', 'Corte láser', 'm2', 322.12, NULL, NULL, true, 'Excel · Costo de corte láser. Revisar: láser a $5.08/min vs $50.81/min de la tabla de máquina.'),
  ('Acrílico 3 mm corte láser complicado', 'Corte láser', 'm2', 471.60, NULL, NULL, true, 'Excel · Costo de corte láser. Revisar: láser a $5.08/min vs $50.81/min de la tabla de máquina.'),
  ('MDF 5.5 mm corte láser', 'Corte láser', 'm2', 110.99, NULL, NULL, true, 'Excel · Costo de corte láser. Revisar: láser a $5.08/min vs $50.81/min de la tabla de máquina.'),
  ('Solo suaje', 'Vinil de corte', 'ml', 24.25, NULL, NULL, false, 'Excel · Costo primo de maquila'),
  ('Estireno cal. 20 blanco', 'Sustrato', NULL, NULL, NULL, NULL, true, 'No está en el Excel. Capturar costo y presentación de compra.'),
  ('Estireno cal. 40 blanco', 'Sustrato', NULL, NULL, NULL, NULL, true, 'No está en el Excel. Capturar costo y presentación de compra.'),
  ('Vinil fotoluminiscente', 'Vinil de corte', NULL, NULL, NULL, NULL, true, 'No está en el Excel. Capturar costo y presentación de compra.');
--> statement-breakpoint

-- Recetas y componentes ------------------------------------------------------------------------
WITH r AS (
  INSERT INTO "recetas" ("nombre", "familia", "descripcion_pdf", "pct_merma")
  VALUES ('Trovicel 3 mm + vinil de corte + transfer', 'senaletica', 'Trovicel de 3 mm con vinil de corte aplicado con papel transfer.', 0.15)
  RETURNING "id"
)
INSERT INTO "receta_componentes" ("receta_id", "insumo_id", "modo", "cantidad")
SELECT r."id", i."id", 'por_m2', 1 FROM r, "insumos" i
WHERE i."nombre" IN ('Trovicel 3 mm', 'Vinil de corte 1.22', 'Papel transfer');
--> statement-breakpoint

WITH r AS (
  INSERT INTO "recetas" ("nombre", "familia", "descripcion_pdf", "pct_merma")
  VALUES ('Trovicel 6 mm + vinil de corte + transfer', 'senaletica', 'Trovicel de 6 mm con vinil de corte aplicado con papel transfer.', 0.15)
  RETURNING "id"
)
INSERT INTO "receta_componentes" ("receta_id", "insumo_id", "modo", "cantidad")
SELECT r."id", i."id", 'por_m2', 1 FROM r, "insumos" i
WHERE i."nombre" IN ('Trovicel 6 mm', 'Vinil de corte 1.22', 'Papel transfer');
--> statement-breakpoint

WITH r AS (
  INSERT INTO "recetas" ("nombre", "familia", "descripcion_pdf", "pct_merma")
  VALUES ('Estireno cal. 20 + impresión', 'senaletica', 'Estireno calibre 20 rígido blanco, con impresión en vinil eco-solvente.', 0)
  RETURNING "id"
)
INSERT INTO "receta_componentes" ("receta_id", "insumo_id", "modo", "cantidad")
SELECT r."id", i."id", 'por_m2', 1 FROM r, "insumos" i
WHERE i."nombre" IN ('Estireno cal. 20 blanco', 'Impresión JV33 vinil blanco');
--> statement-breakpoint

WITH r AS (
  INSERT INTO "recetas" ("nombre", "familia", "descripcion_pdf", "pct_merma")
  VALUES ('Estireno cal. 40 + impresión', 'senaletica', 'Estireno calibre 40 rígido blanco, con impresión en vinil eco-solvente.', 0)
  RETURNING "id"
)
INSERT INTO "receta_componentes" ("receta_id", "insumo_id", "modo", "cantidad")
SELECT r."id", i."id", 'por_m2', 1 FROM r, "insumos" i
WHERE i."nombre" IN ('Estireno cal. 40 blanco', 'Impresión JV33 vinil blanco');
--> statement-breakpoint

WITH r AS (
  INSERT INTO "recetas" ("nombre", "familia", "descripcion_pdf", "pct_merma")
  VALUES ('Estireno cal. 40 + fotoluminiscente', 'senaletica', 'Estireno calibre 40 rígido blanco, con vinil fotoluminiscente.', 0)
  RETURNING "id"
)
INSERT INTO "receta_componentes" ("receta_id", "insumo_id", "modo", "cantidad")
SELECT r."id", i."id", 'por_m2', 1 FROM r, "insumos" i
WHERE i."nombre" IN ('Estireno cal. 40 blanco', 'Vinil fotoluminiscente');
--> statement-breakpoint

WITH r AS (
  INSERT INTO "recetas" ("nombre", "familia", "descripcion_pdf", "pct_merma")
  VALUES ('Acrílico 3 mm corte láser sencillo', 'acrilico', 'Acrílico de 3 mm con corte láser.', 0)
  RETURNING "id"
)
INSERT INTO "receta_componentes" ("receta_id", "insumo_id", "modo", "cantidad")
SELECT r."id", i."id", 'por_m2', 1 FROM r, "insumos" i
WHERE i."nombre" = 'Acrílico 3 mm corte láser sencillo';
--> statement-breakpoint

WITH r AS (
  INSERT INTO "recetas" ("nombre", "familia", "descripcion_pdf", "pct_merma")
  VALUES ('Corte de vinil (rotulación)', 'rotulacion', 'Rotulación con vinil de corte.', 0)
  RETURNING "id"
)
INSERT INTO "receta_componentes" ("receta_id", "insumo_id", "modo", "cantidad")
SELECT r."id", i."id", 'por_m2', 1 FROM r, "insumos" i
WHERE i."nombre" = 'Vinil de corte 1.22';
--> statement-breakpoint

-- Artículos de reventa (precio de referencia y link por capturar) ------------------------------
INSERT INTO "articulos_reventa" ("nombre") VALUES
  ('Detector de humo autónomo 9V, 85 dB'),
  ('Botiquín equipado portátil'),
  ('Lámpara de emergencia recargable 120V'),
  ('Detector de fugas gas natural y LP'),
  ('Extintor PQS');
