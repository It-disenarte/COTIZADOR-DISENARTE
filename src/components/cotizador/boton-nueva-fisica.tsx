"use client";

import { FilePlus2, Zap } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Modal } from "@/components/modal";

/**
 * "Publicidad física": antes de abrir la cotización pregunta si se hace la rápida (hasta 3 conceptos y una sola
 * variable, el tiempo de desarrollo) o el asistente completo.
 */
export function BotonNuevaFisica() {
  const [abierto, setAbierto] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="inline-flex h-10 items-center gap-2 rounded-md bg-accent px-4 text-sm font-medium text-accent-foreground hover:bg-accent/90"
      >
        <FilePlus2 className="size-4" /> Publicidad física
      </button>
      {abierto && (
        <Modal
          titulo="¿Cómo quieres cotizar?"
          descripcion="Las dos llevan autorización, PDF y mensajes para el cliente."
          alCerrar={() => setAbierto(false)}
          className="max-w-xl"
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <Link
              href="/cotizaciones/nueva?modo=rapida"
              className="space-y-1 rounded-lg border p-4 hover:border-primary hover:bg-primary/5"
            >
              <p className="flex items-center gap-2 font-medium">
                <Zap className="size-4 text-accent" /> Cotización rápida
              </p>
              <p className="text-xs text-muted-foreground">
                Hasta 3 conceptos con sus insumos y una sola variable: el tiempo de desarrollo en horas.
              </p>
            </Link>
            <Link
              href="/cotizaciones/nueva"
              className="space-y-1 rounded-lg border p-4 hover:border-primary hover:bg-primary/5"
            >
              <p className="flex items-center gap-2 font-medium">
                <FilePlus2 className="size-4 text-accent" /> Asistente completo
              </p>
              <p className="text-xs text-muted-foreground">
                Todos los conceptos, opciones, fotos, operación (instalación, viáticos) y reventa o maquila.
              </p>
            </Link>
          </div>
        </Modal>
      )}
    </>
  );
}
