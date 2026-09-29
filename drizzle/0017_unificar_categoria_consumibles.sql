-- Las categorías se escribían a mano y acabaron en variantes del mismo grupo ("Consumible",
-- "Consumibles", "Costo primo · Consumible" de la importación). Desde ahora se eligen de una lista fija;
-- aquí se juntan en "Consumibles" las que ya existen. Las demás se corrigen desde el catálogo.
UPDATE "insumos" SET "categoria" = 'Consumibles' WHERE "categoria" ILIKE '%consumible%' AND "categoria" <> 'Consumibles';
