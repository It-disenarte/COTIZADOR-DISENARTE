import { FilePlus2, Zap } from "lucide-react";
import Link from "next/link";

/**
 * Primera pantalla de "Nueva cotización" (publicidad física): pregunta si se hace la rápida o el asistente
 * completo. Es una pantalla de esa sección y no una ventana encima de otra, para que no tape lo que se esté
 * haciendo.
 */
export function ElegirModoCotizacion() {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Link
        href="/cotizaciones/nueva?modo=rapida"
        className="space-y-2 rounded-xl border bg-card p-6 hover:border-primary hover:bg-primary/5"
      >
        <p className="flex items-center gap-2 text-lg font-medium">
          <Zap className="size-5 text-accent" /> Cotización rápida
        </p>
        <p className="text-sm text-muted-foreground">
          Hasta 3 conceptos con sus insumos y una sola variable: el tiempo de desarrollo en horas. Solo dos secciones.
        </p>
      </Link>
      <Link
        href="/cotizaciones/nueva?modo=completa"
        className="space-y-2 rounded-xl border bg-card p-6 hover:border-primary hover:bg-primary/5"
      >
        <p className="flex items-center gap-2 text-lg font-medium">
          <FilePlus2 className="size-5 text-accent" /> Asistente completo
        </p>
        <p className="text-sm text-muted-foreground">
          Todos los conceptos, opciones, fotos, operación (instalación, viáticos) y reventa o maquila.
        </p>
      </Link>
    </div>
  );
}
