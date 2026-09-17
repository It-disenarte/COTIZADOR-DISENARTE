import { cn } from "@/lib/utils";

export function Marca({ className }: { className?: string }) {
  return (
    <div className={cn("leading-none", className)}>
      <span className="text-lg font-bold tracking-tight">
        Diseñarte<span className="text-accent">.</span>
      </span>
      <span className="block text-[0.65rem] font-medium uppercase tracking-[0.2em] text-muted-foreground">
        Cotizador
      </span>
    </div>
  );
}
