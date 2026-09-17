import { headers } from "next/headers";
import { TablaClientes } from "@/components/catalogo/tabla-clientes";
import { tienePermiso } from "@/lib/permisos";
import { requireSesion } from "@/lib/sesion";
import { listarClientes } from "@/lib/servicios/clientes";

export default async function PaginaClientes() {
  const { usuario } = await requireSesion(await headers());
  const clientes = await listarClientes(usuario);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">Clientes</h1>
        <p className="text-sm text-muted-foreground">
          Los kilómetros desde San Juan del Río y la zona se usan después para calcular traslados y viáticos.
        </p>
      </header>
      <TablaClientes clientes={clientes} puedeEditar={tienePermiso(usuario, "clientes.gestionar")} />
    </div>
  );
}
