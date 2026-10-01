"use client";

import { Download } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

/** Evento de Chrome, Edge y Android cuando la app se puede instalar (Safari no lo tiene). */
type EventoInstalacion = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

/**
 * "Instalar app" en el menú. Solo aparece donde el navegador permite instalarla y todavía no está
 * instalada; en iPhone se instala desde Compartir → "Agregar a inicio", porque Safari no ofrece el botón.
 */
export function BotonInstalar({ className, soloIcono = false }: { className?: string; /** Menú escondido: solo el ícono. */ soloIcono?: boolean }) {
  const [evento, setEvento] = useState<EventoInstalacion | null>(null);

  useEffect(() => {
    const alPoderInstalar = (e: Event) => {
      // Se guarda el aviso para lanzarlo desde el botón en vez de que el navegador lo muestre solo.
      e.preventDefault();
      setEvento(e as EventoInstalacion);
    };
    const alInstalar = () => setEvento(null);
    window.addEventListener("beforeinstallprompt", alPoderInstalar);
    window.addEventListener("appinstalled", alInstalar);
    return () => {
      window.removeEventListener("beforeinstallprompt", alPoderInstalar);
      window.removeEventListener("appinstalled", alInstalar);
    };
  }, []);

  if (!evento) return null;

  async function instalar() {
    if (!evento) return;
    await evento.prompt();
    await evento.userChoice;
    // El aviso solo se puede usar una vez; si se canceló, el navegador vuelve a avisar más tarde.
    setEvento(null);
  }

  return (
    <button
      type="button"
      onClick={instalar}
      title="Instala el cotizador para abrirlo como una app, en su propia ventana"
      className={className}
    >
      <Download className="size-3.5 shrink-0" />
      <span className={cn(soloIcono && "sr-only")}>Instalar app</span>
    </button>
  );
}
