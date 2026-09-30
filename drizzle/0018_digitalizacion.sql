CREATE TYPE "public"."cobro_digital" AS ENUM('paquete', 'unico', 'mensual');--> statement-breakpoint
CREATE TYPE "public"."tipo_cotizacion" AS ENUM('fisica', 'digital');--> statement-breakpoint
CREATE TABLE "servicios_digitales" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nombre" text NOT NULL,
	"categoria" text NOT NULL,
	"cobro" "cobro_digital" DEFAULT 'unico' NOT NULL,
	"precio" numeric(14, 4),
	"precio_mensual" numeric(14, 4),
	"activacion" numeric(14, 4),
	"meses_renta" integer DEFAULT 12 NOT NULL,
	"incluye" text,
	"tiempo_entrega" text,
	"archivado" boolean DEFAULT false NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cotizaciones" ADD COLUMN "tipo" "tipo_cotizacion" DEFAULT 'fisica' NOT NULL;