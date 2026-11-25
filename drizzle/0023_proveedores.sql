-- Proveedores a los que se les compra, con su contacto, ubicación, si son confiables y un comentario.
-- Cada insumo puede tener un proveedor (el que se le asignó arrastrándolo); si el proveedor se borra, el insumo queda sin proveedor.
CREATE TABLE "proveedores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nombre" text NOT NULL,
	"contacto" text,
	"ubicacion" text,
	"confiable" boolean DEFAULT true NOT NULL,
	"comentario" text,
	"archivado" boolean DEFAULT false NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "insumos" ADD COLUMN "proveedor_id" uuid;
--> statement-breakpoint
ALTER TABLE "insumos" ADD CONSTRAINT "insumos_proveedor_id_proveedores_id_fk" FOREIGN KEY ("proveedor_id") REFERENCES "public"."proveedores"("id") ON DELETE set null ON UPDATE no action;
