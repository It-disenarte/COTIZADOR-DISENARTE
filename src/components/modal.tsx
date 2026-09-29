"use client";

import { X } from "lucide-react";
import { useEffect } from "react";
import { cn } from "@/lib/utils";

/**
 * Ventana encima de la página para formularios cortos (crear o editar), así no hay que subir a
 * buscarlos. Se cierra con Escape, con la × o haciendo clic fuera.
 */
export function Modal({
  titulo,
  descripcion,
  alCerrar,
  children,
  className,
}: {
  titulo: string;
  descripcion?: string;
  alCerrar: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  useEffect(() => {
    const alTeclear = (e: KeyboardEvent) => e.key === "Escape" && alCerrar();
    window.addEventListener("keydown", alTeclear);
    // La página de fondo no se desplaza mientras la ventana está abierta.
    const desbordeAnterior = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", alTeclear);
      document.body.style.overflow = desbordeAnterior;
    };
  }, [alCerrar]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/30 p-4" onClick={alCerrar}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="titulo-modal"
        onClick={(e) => e.stopPropagation()}
        className={cn("max-h-[90vh] w-full max-w-2xl space-y-4 overflow-y-auto rounded-xl border bg-card p-5 shadow-xl", className)}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="titulo-modal" className="font-medium">
              {titulo}
            </h2>
            {descripcion && <p className="text-xs text-muted-foreground">{descripcion}</p>}
          </div>
          <button type="button" onClick={alCerrar} aria-label="Cerrar" className="rounded p-1 hover:bg-muted">
            <X className="size-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
