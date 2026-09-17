import { headers } from "next/headers";
import Link from "next/link";
import { ListaRecetas } from "@/components/catalogo/lista-recetas";
import { TablaInsumos } from "@/components/catalogo/tabla-insumos";
import { TablaParametros } from "@/components/catalogo/tabla-parametros";
import { TablaReventa } from "@/components/catalogo/tabla-reventa";
import { Badge } from "@/components/ui";
import { tienePermiso } from "@/lib/permisos";
import { requireSesion } from "@/lib/sesion";
import { listarInsumos } from "@/lib/servicios/insumos";
import { listarParametros } from "@/lib/servicios/parametros";
import { listarRecetas } from "@/lib/servicios/recetas";
import { listarReventa } from "@/lib/servicios/reventa";
import { cn } from "@/lib/utils";

const PESTANAS = [
  { clave: "insumos", etiqueta: "Insumos" },
  { clave: "recetas", etiqueta: "Recetas" },
  { clave: "reventa", etiqueta: "Reventa" },
  { clave: "parametros", etiqueta: "Parámetros" },
] as const;

type Pestana = (typeof PESTANAS)[number]["clave"];

export default async function PaginaCatalogo({ searchParams }: PageProps<"/catalogo">) {
  const { usuario } = await requireSesion(await headers());
  const { tab } = await searchParams;
  const activa: Pestana = PESTANAS.some((p) => p.clave === tab) ? (tab as Pestana) : "insumos";
  const puedeEditar = tienePermiso(usuario, "catalogo.editar");

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">Catálogo</h1>
        <p className="text-sm text-muted-foreground">
          {puedeEditar
            ? "Costos sin IVA y sin margen: el motor aplica el margen al final."
            : "Solo lectura: para cambios pide apoyo a un administrador."}
        </p>
      </header>

      <nav className="flex gap-1 overflow-x-auto rounded-lg bg-muted p-1">
        {PESTANAS.map((p) => (
          <Link
            key={p.clave}
            href={`/catalogo?tab=${p.clave}`}
            className={cn(
              "shrink-0 rounded-md px-4 py-2 text-sm font-medium",
              activa === p.clave ? "bg-card shadow-sm" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {p.etiqueta}
          </Link>
        ))}
        {!puedeEditar && (
          <Badge className="ml-auto self-center">Solo lectura</Badge>
        )}
      </nav>

      {activa === "insumos" && <TablaInsumos insumos={await listarInsumos(usuario)} puedeEditar={puedeEditar} />}
      {activa === "recetas" && <ListaRecetas recetas={await listarRecetas(usuario)} puedeEditar={puedeEditar} />}
      {activa === "reventa" && <TablaReventa articulos={await listarReventa(usuario)} puedeEditar={puedeEditar} />}
      {activa === "parametros" && <TablaParametros parametros={await listarParametros(usuario)} puedeEditar={puedeEditar} />}
    </div>
  );
}
