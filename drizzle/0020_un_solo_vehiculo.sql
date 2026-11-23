-- Un solo vehículo para todos los viajes: 12 km por litro. Ya no hay Hilux ni CX-30; lo único que se
-- sigue editando de la gasolina es el precio del litro. Las cotizaciones anteriores conservan su snapshot.
UPDATE "parametros" SET "valor" = 12, "descripcion" = 'Rendimiento estándar del vehículo de la casa para calcular la gasolina de los viajes. Es fijo: no se edita.' WHERE "clave" = 'rendimiento_km_l';
--> statement-breakpoint
DELETE FROM "parametros" WHERE "clave" IN ('rendimiento_hilux', 'rendimiento_cx30');
