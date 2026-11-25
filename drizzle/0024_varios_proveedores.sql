-- Un insumo puede comprarse a varios proveedores (y un proveedor surte varios insumos): la relación pasa de la columna
-- insumos.proveedor_id a su propia tabla. Lo que ya estaba asignado se conserva.
CREATE TABLE "insumos_proveedores" (
	"insumo_id" uuid NOT NULL,
	"proveedor_id" uuid NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "insumos_proveedores_insumo_id_proveedor_id_pk" PRIMARY KEY("insumo_id","proveedor_id")
);
--> statement-breakpoint
ALTER TABLE "insumos_proveedores" ADD CONSTRAINT "insumos_proveedores_insumo_id_insumos_id_fk" FOREIGN KEY ("insumo_id") REFERENCES "public"."insumos"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "insumos_proveedores" ADD CONSTRAINT "insumos_proveedores_proveedor_id_proveedores_id_fk" FOREIGN KEY ("proveedor_id") REFERENCES "public"."proveedores"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
INSERT INTO "insumos_proveedores" ("insumo_id", "proveedor_id")
SELECT "id", "proveedor_id" FROM "insumos" WHERE "proveedor_id" IS NOT NULL;
--> statement-breakpoint
ALTER TABLE "insumos" DROP COLUMN "proveedor_id";
