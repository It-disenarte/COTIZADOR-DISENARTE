CREATE TABLE "imagenes_cotizacion" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cotizacion_id" uuid NOT NULL,
	"nombre" text NOT NULL,
	"tipo" text NOT NULL,
	"tamano" integer NOT NULL,
	"datos" "bytea" NOT NULL,
	"subida_por" uuid,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "imagenes_cotizacion" ADD CONSTRAINT "imagenes_cotizacion_cotizacion_id_cotizaciones_id_fk" FOREIGN KEY ("cotizacion_id") REFERENCES "public"."cotizaciones"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "imagenes_cotizacion" ADD CONSTRAINT "imagenes_cotizacion_subida_por_usuarios_id_fk" FOREIGN KEY ("subida_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "imagenes_cotizacion_cotizacion_idx" ON "imagenes_cotizacion" USING btree ("cotizacion_id");