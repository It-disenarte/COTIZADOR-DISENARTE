ALTER TYPE "public"."unidad_costo" ADD VALUE 'rollo' BEFORE 'pieza';--> statement-breakpoint
ALTER TABLE "insumos" ADD COLUMN "largo_rollo_m" numeric(12, 4);