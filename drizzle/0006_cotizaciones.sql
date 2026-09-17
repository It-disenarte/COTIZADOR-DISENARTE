CREATE TYPE "public"."estado_cotizacion" AS ENUM('borrador', 'enviada', 'ganada', 'perdida');--> statement-breakpoint
CREATE TABLE "cotizacion_versiones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cotizacion_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"creada_por" uuid,
	"entrada" jsonb NOT NULL,
	"precios" jsonb NOT NULL,
	"resultado" jsonb NOT NULL,
	"trazabilidad" jsonb,
	"pdf_path" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cotizaciones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"folio" text NOT NULL,
	"cliente_id" uuid,
	"vendedor_id" uuid NOT NULL,
	"titulo" text NOT NULL,
	"solicitante" text,
	"estado" "estado_cotizacion" DEFAULT 'borrador' NOT NULL,
	"version_actual" integer DEFAULT 1 NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cotizaciones_folio_unique" UNIQUE("folio")
);
--> statement-breakpoint
ALTER TABLE "cotizacion_versiones" ADD CONSTRAINT "cotizacion_versiones_cotizacion_id_cotizaciones_id_fk" FOREIGN KEY ("cotizacion_id") REFERENCES "public"."cotizaciones"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cotizacion_versiones" ADD CONSTRAINT "cotizacion_versiones_creada_por_usuarios_id_fk" FOREIGN KEY ("creada_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cotizaciones" ADD CONSTRAINT "cotizaciones_cliente_id_clientes_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."clientes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cotizaciones" ADD CONSTRAINT "cotizaciones_vendedor_id_usuarios_id_fk" FOREIGN KEY ("vendedor_id") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cotizacion_versiones_cotizacion_idx" ON "cotizacion_versiones" USING btree ("cotizacion_id");--> statement-breakpoint
CREATE UNIQUE INDEX "cotizacion_versiones_unica" ON "cotizacion_versiones" USING btree ("cotizacion_id","version");--> statement-breakpoint
CREATE INDEX "cotizaciones_vendedor_idx" ON "cotizaciones" USING btree ("vendedor_id");--> statement-breakpoint
CREATE INDEX "cotizaciones_estado_idx" ON "cotizaciones" USING btree ("estado");