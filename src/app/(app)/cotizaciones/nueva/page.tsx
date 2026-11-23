import { headers } from "next/headers";
import { AsistenteCotizacion } from "@/components/cotizador/asistente";
import { AsistenteDigital } from "@/components/cotizador/asistente-digital";
import { borradorRapido } from "@/lib/cotizador/estado";
import { tienePermiso } from "@/lib/permisos";
import { requireSesion } from "@/lib/sesion";
import { datosDelAsistente } from "@/lib/servicios/cotizador-datos";

/**
 * /cotizaciones/nueva = publicidad física completa; ?modo=rapida = cotización rápida (máximo 3 conceptos);
 * ?tipo=digital = Digitalización.
 */
export default async function PaginaNuevaCotizacion({ searchParams }: PageProps<"/cotizaciones/nueva">) {
  const { usuario } = await requireSesion(await headers());
  const { tipo, modo } = await searchParams;
  const digital = tipo === "digital";
  const rapida = !digital && modo === "rapida";
  const { clientes, vendedores } = await datosDelAsistente(usuario);
  const propiedades = {
    usuarioId: usuario.id,
    vendedores,
    puedeElegirVendedor: tienePermiso(usuario, "cotizaciones.ver_todas"),
    clientes,
    puedeAutorizar: tienePermiso(usuario, "cotizaciones.autorizar"),
    puedeEditarCatalogo: tienePermiso(usuario, "catalogo.editar"),
  };

  return (
    <div className="mx-auto max-w-384 space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">{digital ? "Nueva cotización de digitalización" : rapida ? "Nueva cotización rápida" : "Nueva cotización"}</h1>
        <p className="text-sm text-muted-foreground">
          {digital
            ? "Página web, identidad de marca, redes sociales y Google. El borrador se guarda solo."
            : rapida
              ? "Hasta 3 conceptos con sus insumos y el tiempo de desarrollo en horas. El borrador se guarda solo."
              : "Publicidad física: señalética, impresión, rotulación y corte láser. El borrador se guarda solo."}
        </p>
      </header>
      {digital ? <AsistenteDigital {...propiedades} /> : <AsistenteCotizacion {...propiedades} inicial={rapida ? borradorRapido(usuario.id) : undefined} />}
    </div>
  );
}
