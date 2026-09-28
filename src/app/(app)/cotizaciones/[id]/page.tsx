import { headers } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AsistenteCotizacion } from "@/components/cotizador/asistente";
import { BotonEliminar } from "@/components/cotizador/acciones-cotizacion";
import { BotonDuplicar } from "@/components/cotizador/boton-duplicar";
import { Badge } from "@/components/ui";
import { ETIQUETA_ESTADO } from "@/lib/catalogo/constantes";
import { clienteVacio, type BorradorCotizacion, separarAreasEnConceptos } from "@/lib/cotizador/estado";
import { type EntradaCotizacion, normalizarEntrada } from "@/lib/motor";
import { tienePermiso } from "@/lib/permisos";
import { requireSesion } from "@/lib/sesion";
import { obtenerCotizacion } from "@/lib/servicios/cotizaciones";
import { datosDelAsistente } from "@/lib/servicios/cotizador-datos";
import { obtenerSnapshot } from "@/lib/servicios/snapshot";

export default async function PaginaCotizacion({ params }: PageProps<"/cotizaciones/[id]">) {
  const { usuario } = await requireSesion(await headers());
  const { id } = await params;

  const cotizacion = await obtenerCotizacion(usuario, id).catch(() => notFound());
  const [{ clientes, vendedores }, snapshot] = await Promise.all([datosDelAsistente(usuario), obtenerSnapshot(usuario)]);

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
          puesto: cotizacion.cliente.puesto ?? "",
          empresa: cotizacion.cliente.empresa ?? "",
          correo: cotizacion.cliente.correo ?? "",
          telefono: cotizacion.cliente.telefono ?? "",
          direccion: cotizacion.cliente.direccion ?? "",
          kmDesdeSjr: cotizacion.cliente.kmDesdeSjr ?? "",
          zona: cotizacion.cliente.zona,
          notas: cotizacion.cliente.notas ?? "",
        }
      : clienteVacio(),
    // Las cotizaciones anteriores se abren ya en la forma actual: insumos en cada concepto (antes era
    // una receta por opción) y un concepto por área (antes eran columnas de cantidad por área).
    entrada: separarAreasEnConceptos(normalizarEntrada(cotizacion.entrada as EntradaCotizacion, snapshot)),
  };

  return (
    <div className="mx-auto max-w-[96rem] space-y-6">
      <header className="space-y-1">
        <Link href="/cotizaciones" className="text-sm text-muted-foreground hover:underline">
          ← Mis cotizaciones
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold">{cotizacion.titulo}</h1>
          <Badge variant={cotizacion.estado === "ganada" ? "success" : cotizacion.estado === "perdida" ? "destructive" : "default"}>
            {ETIQUETA_ESTADO[cotizacion.estado]}
          </Badge>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <BotonDuplicar id={cotizacion.id} folio={cotizacion.folio} />
            <BotonEliminar id={cotizacion.id} folio={cotizacion.folio} alEliminar="volver" />
          </div>
        </div>
        <p className="font-mono text-xs text-muted-foreground">{cotizacion.folio}</p>
      </header>

      <AsistenteCotizacion
        usuarioId={usuario.id}
        vendedores={vendedores}
        puedeElegirVendedor={tienePermiso(usuario, "cotizaciones.ver_todas")}
        clientes={clientes}
        inicial={inicial}
        puedeAutorizar={tienePermiso(usuario, "cotizaciones.autorizar")}
        puedeEditarCatalogo={tienePermiso(usuario, "catalogo.editar")}
        autorizada={cotizacion.autorizadaEn ? cotizacion.autorizadaEn.toISOString() : null}
      />
    </div>
  );
}
