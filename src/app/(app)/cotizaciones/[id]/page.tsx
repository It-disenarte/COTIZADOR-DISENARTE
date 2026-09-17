import { headers } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AsistenteCotizacion } from "@/components/cotizador/asistente";
import { Badge } from "@/components/ui";
import { ETIQUETA_ESTADO } from "@/lib/catalogo/constantes";
import { clienteVacio, type BorradorCotizacion } from "@/lib/cotizador/estado";
import type { EntradaCotizacion } from "@/lib/motor";
import { tienePermiso } from "@/lib/permisos";
import { requireSesion } from "@/lib/sesion";
import { obtenerCotizacion } from "@/lib/servicios/cotizaciones";
import { datosDelAsistente } from "@/lib/servicios/cotizador-datos";

export default async function PaginaCotizacion({ params }: PageProps<"/cotizaciones/[id]">) {
  const { usuario } = await requireSesion(await headers());
  const { id } = await params;

  const cotizacion = await obtenerCotizacion(usuario, id).catch(() => notFound());
  const { recetas, clientes, vendedores } = await datosDelAsistente(usuario);

  const inicial: BorradorCotizacion = {
    id: cotizacion.id,
    folio: cotizacion.folio,
    titulo: cotizacion.titulo,
    solicitante: cotizacion.solicitante ?? "",
    vendedorId: cotizacion.vendedorId,
    cliente: cotizacion.cliente
      ? {
          id: cotizacion.cliente.id,
          nombreContacto: cotizacion.cliente.nombreContacto,
          empresa: cotizacion.cliente.empresa ?? "",
          correo: cotizacion.cliente.correo ?? "",
          telefono: cotizacion.cliente.telefono ?? "",
          direccion: cotizacion.cliente.direccion ?? "",
          kmDesdeSjr: cotizacion.cliente.kmDesdeSjr ?? "",
          zona: cotizacion.cliente.zona,
          notas: cotizacion.cliente.notas ?? "",
        }
      : clienteVacio(),
    entrada: cotizacion.entrada as EntradaCotizacion,
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="space-y-1">
        <Link href="/cotizaciones" className="text-sm text-muted-foreground hover:underline">
          ← Mis cotizaciones
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold">{cotizacion.titulo}</h1>
          <Badge variant={cotizacion.estado === "ganada" ? "success" : cotizacion.estado === "perdida" ? "destructive" : "default"}>
            {ETIQUETA_ESTADO[cotizacion.estado]}
          </Badge>
        </div>
        <p className="font-mono text-xs text-muted-foreground">
          {cotizacion.folio} · versión {cotizacion.version}
        </p>
      </header>

      <AsistenteCotizacion
        usuarioId={usuario.id}
        vendedores={vendedores}
        puedeElegirVendedor={tienePermiso(usuario, "cotizaciones.ver_todas")}
        recetas={recetas}
        clientes={clientes}
        inicial={inicial}
      />
    </div>
  );
}
