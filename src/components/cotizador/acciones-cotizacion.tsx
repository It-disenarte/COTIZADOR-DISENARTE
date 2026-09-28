"use client";

import { FileDown, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useAvisos } from "@/components/avisos";
import { PantallaCarga } from "@/components/pantalla-carga";
import { llamarApi } from "@/lib/utils";

const claseBoton =
  "inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs hover:bg-muted disabled:opacity-60";

/**
 * Borra la cotización para siempre. El primer clic solo pregunta; hay que confirmar en el mismo
 * lugar, porque no se puede deshacer.
 */
export function BotonEliminar({ id, folio, alEliminar }: { id: string; folio: string; alEliminar?: "lista" | "volver" }) {
  const router = useRouter();
  const [confirmando, setConfirmando] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const avisar = useAvisos();

  async function eliminar() {
    setOcupado(true);
    try {
      await llamarApi(`/api/cotizaciones/${id}`, "DELETE");
      avisar({ tipo: "ok", texto: `Se eliminó ${folio}.` });
      if (alEliminar === "volver") router.push("/cotizaciones");
      else router.refresh();
    } catch (e) {
      avisar({ tipo: "error", texto: e instanceof Error ? e.message : "No se pudo eliminar." });
      setOcupado(false);
      setConfirmando(false);
    }
  }

  return (
    <>
      {ocupado && <PantallaCarga mensaje={`Eliminando ${folio}…`} />}
      {confirmando ? (
        <span className="inline-flex items-center gap-1 rounded-md border border-destructive/40 bg-destructive/5 px-2 py-0.5 text-xs">
          ¿Eliminar para siempre?
          <button type="button" onClick={eliminar} className="rounded px-1.5 py-0.5 font-medium text-destructive hover:bg-destructive/10">
            Sí, eliminar
          </button>
          <button type="button" onClick={() => setConfirmando(false)} className="rounded px-1.5 py-0.5 hover:bg-muted">
            No
          </button>
        </span>
      ) : (
        <button
          type="button"
          onClick={() => setConfirmando(true)}
          className={`${claseBoton} hover:border-destructive/50 hover:text-destructive`}
          title={`Eliminar ${folio} definitivamente`}
        >
          <Trash2 className="size-3.5" /> Eliminar
        </button>
      )}
    </>
  );
}

/**
 * Descarga el PDF sin salir de la pantalla. Si no se puede (p. ej. falta autorizar el análisis),
 * muestra el motivo aquí mismo en lugar de abrir una página con el error del servidor.
 */
export function BotonPdf({ id }: { id: string }) {
  const [ocupado, setOcupado] = useState(false);
  const avisar = useAvisos();

  async function descargar() {
    setOcupado(true);
    try {
      const res = await fetch(`/api/cotizaciones/${id}/pdf`);
      if (!res.ok) {
        const datos = await res.json().catch(() => ({}));
        throw new Error(datos?.error ?? "No se pudo generar el PDF.");
      }
      const nombre = /filename="([^"]+)"/.exec(res.headers.get("content-disposition") ?? "")?.[1] ?? "propuesta.pdf";
      const url = URL.createObjectURL(await res.blob());
      const enlace = document.createElement("a");
      enlace.href = url;
      enlace.download = nombre;
      enlace.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } catch (e) {
      avisar({ tipo: "error", texto: e instanceof Error ? e.message : "No se pudo generar el PDF." });
    } finally {
      setOcupado(false);
    }
  }

  return (
    <>
      {ocupado && <PantallaCarga mensaje="Generando el PDF…" />}
      <button type="button" onClick={descargar} disabled={ocupado} className={claseBoton} title="Descargar la propuesta">
        <FileDown className="size-3.5" /> PDF
      </button>
    </>
  );
}
