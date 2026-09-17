import { headers } from "next/headers";
import { Badge, Card, CardDescription, CardHeader, CardTitle } from "@/components/ui";
import { ETIQUETA_ROL, PERMISOS, type Permiso, tienePermiso } from "@/lib/permisos";
import { requireSesion } from "@/lib/sesion";

const DESCRIPCION_PERMISO: Record<Permiso, string> = {
  "cotizaciones.propias": "Crear, editar y descargar tus cotizaciones",
  "cotizaciones.ver_todas": "Ver cotizaciones de todas las cuentas",
  "catalogo.ver": "Consultar insumos, recetas y parámetros",
  "catalogo.editar": "Editar insumos, recetas y parámetros",
  "clientes.gestionar": "Dar de alta clientes desde la cotización",
  "usuarios.gestionar": "Crear, editar y desactivar cuentas",
};

export default async function PaginaInicio() {
  const { usuario } = await requireSesion(await headers());

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <header>
        <p className="text-sm text-muted-foreground">{ETIQUETA_ROL[usuario.rol]}</p>
        <h1 className="text-2xl font-semibold">Hola, {usuario.nombre}</h1>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Tus permisos</CardTitle>
          <CardDescription>Lo que tu rol permite hacer en el cotizador.</CardDescription>
          <ul className="mt-3 divide-y">
            {(Object.keys(PERMISOS) as Permiso[]).map((permiso) => {
              const si = tienePermiso(usuario, permiso);
              return (
                <li key={permiso} className="flex items-center justify-between gap-4 py-2.5 text-sm">
                  <span className={si ? "" : "text-muted-foreground"}>{DESCRIPCION_PERMISO[permiso]}</span>
                  <Badge variant={si ? "success" : "default"}>{si ? "Sí" : "No"}</Badge>
                </li>
              );
            })}
          </ul>
        </CardHeader>
      </Card>

      <p className="text-sm text-muted-foreground">
        Versión de prueba · Fases 1 y 2 (cuentas, roles y catálogo). El cotizador y el PDF llegan en las siguientes
        fases.
      </p>
    </div>
  );
}
