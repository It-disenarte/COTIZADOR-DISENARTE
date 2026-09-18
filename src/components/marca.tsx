import Image from "next/image";
import isotipoColor from "@/assets/marca/isotipo-color.png";
import isotipoPositivo from "@/assets/marca/isotipo-positivo.png";
import logoColor from "@/assets/marca/logo-color.png";
import logoPositivo from "@/assets/marca/logo-positivo.png";
import { cn } from "@/lib/utils";

/**
 * Logo oficial, extraído tal cual del Manual de Marca (sin redibujar ni deformar).
 * - "color": versión principal, sobre fondos claros.
 * - "positivo": en blanco, sobre el morado corporativo o fotografías oscuras.
 * Se respeta el área de protección dejando aire alrededor (no pegar texto al logo).
 */
export function Marca({
  variante = "color",
  ancho = 140,
  className,
  conEtiqueta = false,
}: {
  variante?: "color" | "positivo";
  ancho?: number;
  className?: string;
  /** Agrega "Cotizador" debajo, separado del logo. */
  conEtiqueta?: boolean;
}) {
  const logo = variante === "positivo" ? logoPositivo : logoColor;
  return (
    <div className={cn("flex flex-col items-center gap-3", className)}>
      <Image src={logo} alt="Diseñarte México" width={ancho} priority />
      {conEtiqueta && (
        <span
          className={cn(
            "text-[0.7rem] font-medium uppercase tracking-[0.3em]",
            variante === "positivo" ? "text-white/80" : "text-muted-foreground",
          )}
        >
          Cotizador
        </span>
      )}
    </div>
  );
}

/** Solo el símbolo (la "D"), para espacios reducidos. */
export function Isotipo({ variante = "color", tamano = 32, className }: { variante?: "color" | "positivo"; tamano?: number; className?: string }) {
  return (
    <Image
      src={variante === "positivo" ? isotipoPositivo : isotipoColor}
      alt="Diseñarte México"
      width={tamano}
      height={tamano}
      className={className}
    />
  );
}

/** Los tres puntos morados que acompañan cada página del manual. */
export function TresPuntos({ className }: { className?: string }) {
  return (
    <span aria-hidden className={cn("inline-flex gap-1.5", className)}>
      <span className="size-2.5 rounded-full bg-current" />
      <span className="size-2.5 rounded-full bg-current" />
      <span className="size-2.5 rounded-full bg-current" />
    </span>
  );
}
