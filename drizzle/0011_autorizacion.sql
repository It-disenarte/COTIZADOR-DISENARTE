ALTER TABLE "cotizaciones" ADD COLUMN "autorizada_por" uuid;--> statement-breakpoint
ALTER TABLE "cotizaciones" ADD COLUMN "autorizada_en" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "cotizaciones" ADD CONSTRAINT "cotizaciones_autorizada_por_usuarios_id_fk" FOREIGN KEY ("autorizada_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;