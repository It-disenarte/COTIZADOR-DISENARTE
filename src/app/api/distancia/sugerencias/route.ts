import { NextResponse } from "next/server";
import { manejador } from "@/lib/api";
import { origenDisenarte, sugerirDirecciones } from "@/lib/mapas/osm";
import { requirePermiso } from "@/lib/permisos";
import { requireSesion } from "@/lib/sesion";

export const maxDuration = 20;

/**
 * Sugerencias de dirección mientras se escribe. Si el servicio no contesta devuelve una
 * lista vacía: teclear nunca debe mostrar errores.
 */
export const GET = manejador(async (req: Request) => {
  const { usuario } = await requireSesion(req.headers);
  requirePermiso(usuario, "cotizaciones.propias");

  const texto = (new URL(req.url).searchParams.get("q") ?? "").slice(0, 200);
  // Siempre hay punto de referencia: así las sugerencias salen primero de la zona del taller.
  const { punto, fuente } = await origenDisenarte();
  const { lugares, disponible } = await sugerirDirecciones(texto, punto);
  return NextResponse.json({ sugerencias: lugares, disponible, origen: fuente });
});
