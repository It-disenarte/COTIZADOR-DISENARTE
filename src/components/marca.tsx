import Image from "next/image";
import iconoColor from "@/assets/marca/icono-app.png";
import iconoPositivo from "@/assets/marca/icono-app-positivo.png";
import { cn } from "@/lib/utils";

/**
 * Identidad de la app: el ícono del cotizador (el mismo de la pestaña del navegador) con su nombre,
 * igual que en las demás apps de Diseñarte.
 * - "color": ícono morado, sobre fondos claros.
 * - "positivo": ícono blanco, sobre el morado corporativo.
 */
export function Marca({
  variante = "color",
  tamano = 48,
  className,
}: {
  variante?: "color" | "positivo";
  /** Lado del ícono en px; el nombre crece con él. */
  tamano?: number;
  className?: string;
}) {
  const positivo = variante === "positivo";
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <Isotipo variante={variante} tamano={tamano} />
      <div className="leading-tight">
        <p className={cn("font-semibold", tamano >= 64 ? "text-2xl" : "text-lg", positivo ? "text-white" : "text-morado")}>
          Cotizador
        </p>
        <p
          className={cn(
            "text-[0.65rem] font-medium uppercase tracking-[0.25em]",
            positivo ? "text-white/75" : "text-muted-foreground",
          )}
        >
          Diseñarte México
        </p>
      </div>
    </div>
  );
}

/** Solo el ícono, para espacios reducidos. */
export function Isotipo({ variante = "color", tamano = 32, className }: { variante?: "color" | "positivo"; tamano?: number; className?: string }) {
  return (
    <Image
      src={variante === "positivo" ? iconoPositivo : iconoColor}
      alt="Cotizador Diseñarte"
      width={tamano}
      height={tamano}
      className={cn("shrink-0", className)}
      priority
    />
  );
}
