ALTER TYPE "public"."unidad_costo" ADD VALUE 'minuto';--> statement-breakpoint
ALTER TYPE "public"."unidad_costo" ADD VALUE 'ciento';--> statement-breakpoint
ALTER TYPE "public"."unidad_costo" ADD VALUE 'millar';--> statement-breakpoint
ALTER TYPE "public"."unidad_costo" ADD VALUE 'persona';--> statement-breakpoint
ALTER TABLE "clientes" ADD COLUMN "puesto" text;