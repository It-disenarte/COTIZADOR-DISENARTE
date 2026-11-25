-- Una imagen por insumo, para reconocerlo en la ficha del catálogo del asistente. Va en su propia tabla (no en
-- "insumos") para que listar el catálogo no cargue los bytes de todas las imágenes. Se borra con el insumo.
CREATE TABLE "imagenes_insumo" (
	"insumo_id" uuid PRIMARY KEY NOT NULL,
	"tipo" text NOT NULL,
	"tamano" integer NOT NULL,
	"datos" "bytea" NOT NULL,
	"subida_por" uuid,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "imagenes_insumo" ADD CONSTRAINT "imagenes_insumo_insumo_id_insumos_id_fk" FOREIGN KEY ("insumo_id") REFERENCES "public"."insumos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "imagenes_insumo" ADD CONSTRAINT "imagenes_insumo_subida_por_usuarios_id_fk" FOREIGN KEY ("subida_por") REFERENCES "public"."usuarios"("id") ON DELETE no action ON UPDATE no action;
