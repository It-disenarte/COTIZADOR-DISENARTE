import { headers } from "next/headers";
import { AsistenteCotizacion } from "@/components/cotizador/asistente";
import { tienePermiso } from "@/lib/permisos";
import { requireSesion } from "@/lib/sesion";
import { datosDelAsistente } from "@/lib/servicios/cotizador-datos";

export default async function PaginaNuevaCotizacion() {
  const { usuario } = await requireSesion(await headers());
  const { recetas, clientes, vendedores } = await datosDelAsistente(usuario);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Nueva cotización</h1>
        <p className="text-sm text-muted-foreground">El borrador se guarda solo al cambiar de paso.</p>
      </header>
      <AsistenteCotizacion
        usuarioId={usuario.id}
        vendedores={vendedores}
        puedeElegirVendedor={tienePermiso(usuario, "cotizaciones.ver_todas")}
        recetas={recetas}
        clientes={clientes}
        puedeAutorizar={tienePermiso(usuario, "cotizaciones.autorizar")}
      />
    </div>
  );
}
