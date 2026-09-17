import { headers } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { EditorReceta, type InsumoOpcion } from "@/components/catalogo/editor-receta";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui";
import { tienePermiso } from "@/lib/permisos";
import { requireSesion } from "@/lib/sesion";
import { listarInsumos } from "@/lib/servicios/insumos";
import { obtenerReceta } from "@/lib/servicios/recetas";

/** Editor de receta. "nueva" crea una; cualquier otro valor es el id de una existente. */
export default async function PaginaReceta({ params }: PageProps<"/catalogo/recetas/[id]">) {
  const { usuario } = await requireSesion(await headers());
  const { id } = await params;

  if (!tienePermiso(usuario, "catalogo.editar")) {
    return (
      <Card className="mx-auto max-w-md">
        <CardHeader>
          <CardTitle>Sin acceso</CardTitle>
          <CardDescription>Tu rol puede consultar el catálogo, pero no editarlo.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const esNueva = id === "nueva";
  const receta = esNueva ? null : await obtenerReceta(usuario, id).catch(() => notFound());
  const insumos: InsumoOpcion[] = (await listarInsumos(usuario)).map((i) => ({
    id: i.id,
    nombre: i.nombre,
    categoria: i.categoria,
    costo: i.costo,
    unidadCosto: i.unidadCosto,
    requiereRevision: i.requiereRevision,
    archivado: i.archivado,
  }));

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header className="space-y-1">
        <Link href="/catalogo?tab=recetas" className="text-sm text-muted-foreground hover:underline">
          ← Recetas
        </Link>
        <h1 className="text-2xl font-semibold">{esNueva ? "Nueva receta" : receta?.nombre}</h1>
      </header>
      <EditorReceta receta={receta} insumos={insumos} />
    </div>
  );
}
