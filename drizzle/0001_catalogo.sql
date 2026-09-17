CREATE TYPE "public"."familia_receta" AS ENUM('senaletica', 'tablero', 'rotulacion', 'vinil_muro', 'acrilico', 'impresion_menor');--> statement-breakpoint
CREATE TYPE "public"."modo_componente" AS ENUM('por_m2', 'por_pieza', 'fijo');--> statement-breakpoint
CREATE TYPE "public"."unidad_costo" AS ENUM('m2', 'ml', 'pieza', 'lamina');--> statement-breakpoint
CREATE TYPE "public"."zona" AS ENUM('local', 'foraneo');--> statement-breakpoint
CREATE TABLE "articulos_reventa" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nombre" text NOT NULL,
	"precio_referencia" numeric(14, 4),
	"link_referencia" text,
	"verificado_en" date,
	"archivado" boolean DEFAULT false NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "clientes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nombre_contacto" text NOT NULL,
	"empresa" text,
	"correo" text,
	"telefono" text,
	"direccion" text,
	"km_desde_sjr" numeric(12, 4),
	"zona" "zona" DEFAULT 'local' NOT NULL,
	"notas" text,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "insumos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nombre" text NOT NULL,
	"categoria" text NOT NULL,
	"unidad_costo" "unidad_costo",
	"costo" numeric(14, 4),
	"ancho_util_m" numeric(12, 4),
	"area_lamina_m2" numeric(12, 4),
	"fuente" text,
	"requiere_revision" boolean DEFAULT false NOT NULL,
	"archivado" boolean DEFAULT false NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "parametros" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clave" text NOT NULL,
	"valor" numeric(14, 4),
	"descripcion" text NOT NULL,
	"unidad" text NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "parametros_clave_unique" UNIQUE("clave")
);
--> statement-breakpoint
CREATE TABLE "receta_componentes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"receta_id" uuid NOT NULL,
	"insumo_id" uuid NOT NULL,
	"modo" "modo_componente" NOT NULL,
	"cantidad" numeric(12, 4) DEFAULT '1' NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recetas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nombre" text NOT NULL,
	"familia" "familia_receta" NOT NULL,
	"descripcion_pdf" text,
	"pct_merma" numeric(6, 4) DEFAULT '0' NOT NULL,
	"archivado" boolean DEFAULT false NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "receta_componentes" ADD CONSTRAINT "receta_componentes_receta_id_recetas_id_fk" FOREIGN KEY ("receta_id") REFERENCES "public"."recetas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receta_componentes" ADD CONSTRAINT "receta_componentes_insumo_id_insumos_id_fk" FOREIGN KEY ("insumo_id") REFERENCES "public"."insumos"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "clientes_nombre_idx" ON "clientes" USING btree ("nombre_contacto");--> statement-breakpoint
CREATE INDEX "clientes_empresa_idx" ON "clientes" USING btree ("empresa");--> statement-breakpoint
CREATE INDEX "insumos_nombre_idx" ON "insumos" USING btree ("nombre");--> statement-breakpoint
CREATE INDEX "receta_componentes_receta_idx" ON "receta_componentes" USING btree ("receta_id");--> statement-breakpoint
CREATE INDEX "bitacora_creado_idx" ON "bitacora" USING btree ("creado_en");