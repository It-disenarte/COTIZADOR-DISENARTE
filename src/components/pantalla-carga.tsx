import { Loader2 } from "lucide-react";

/**
 * Cubre la pantalla mientras algo se guarda o se procesa en el servidor, para que el cambio no
 * se vea brusco y nadie haga clic dos veces. No usa hooks: sirve igual en servidor y en cliente.
 */
export function PantallaCarga({ mensaje = "Cargando…" }: { mensaje?: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="aparecer-carga fixed inset-0 z-50 flex items-center justify-center bg-background/70 backdrop-blur-[2px]"
    >
      <div className="flex items-center gap-3 rounded-xl border bg-card px-5 py-4 text-sm font-medium shadow-lg">
        <Loader2 className="size-5 animate-spin text-primary" />
        {mensaje}
      </div>
    </div>
  );
}
