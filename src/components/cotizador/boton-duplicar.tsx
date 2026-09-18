"use client";

import { Copy, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { llamarApi } from "@/lib/utils";

/** Copia la cotización como borrador nuevo y abre la copia para editarla. */
export function BotonDuplicar({ id, folio }: { id: string; folio: string }) {
  const router = useRouter();
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function duplicar() {
    setOcupado(true);
    setError(null);
    try {
      const copia = await llamarApi<{ id: string }>(`/api/cotizaciones/${id}/duplicar`, "POST", {});
      router.push(`/cotizaciones/${copia.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo duplicar.");
      setOcupado(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={duplicar}
        disabled={ocupado}
        className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs hover:bg-muted disabled:opacity-60"
        title={`Crear un borrador nuevo a partir de ${folio}`}
      >
        {ocupado ? <Loader2 className="size-3.5 animate-spin" /> : <Copy className="size-3.5" />} Duplicar
      </button>
      {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
    </>
  );
}
