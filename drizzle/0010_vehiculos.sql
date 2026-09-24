-- Rendimiento por vehículo, para calcular la gasolina del viaje.
-- "rendimiento_km_l" se conserva como el valor de respaldo cuando no se elige vehículo.
INSERT INTO "parametros" ("clave", "valor", "unidad", "descripcion") VALUES
  ('rendimiento_hilux', 10, 'km/L', 'Rendimiento de la Toyota Hilux. Se usa al elegir ese vehículo en Operación.'),
  ('rendimiento_cx30', 14, 'km/L', 'Rendimiento de la Mazda CX-30. Valor de partida: corrígelo con el consumo real.')
ON CONFLICT ("clave") DO NOTHING;
