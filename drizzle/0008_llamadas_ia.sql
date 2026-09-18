CREATE TABLE "llamadas_ia" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"usuario_id" uuid NOT NULL,
	"tarea" text NOT NULL,
	"modelo" text NOT NULL,
	"exito" boolean NOT NULL,
	"entrada" jsonb NOT NULL,
	"salida" jsonb,
	"duracion_ms" integer NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "llamadas_ia" ADD CONSTRAINT "llamadas_ia_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "llamadas_ia_usuario_fecha_idx" ON "llamadas_ia" USING btree ("usuario_id","creado_en");