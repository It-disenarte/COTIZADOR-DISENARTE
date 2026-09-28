"use client";

import { CircleCheck, CircleX, TriangleAlert, X } from "lucide-react";
import { createContext, useCallback, useContext, useRef, useState } from "react";
import { cn } from "@/lib/utils";

type Tipo = "ok" | "error" | "advertencia";
type Aviso = { id: number; tipo: Tipo; texto: string };
type Mostrar = (aviso: { tipo: Tipo; texto: string }) => void;

// Los errores se quedan más tiempo: hay que alcanzar a leer qué hacer.
const DURACION: Record<Tipo, number> = { ok: 4500, advertencia: 8000, error: 10000 };

const Contexto = createContext<Mostrar>(() => {});

/**
 * Avisos flotantes en una esquina de la pantalla. Así un error o una advertencia se ve donde
 * esté el vendedor, sin tener que subir hasta arriba de la página a buscarlo.
 */
export function ProveedorAvisos({ children }: { children: React.ReactNode }) {
  const [avisos, setAvisos] = useState<Aviso[]>([]);
  const siguiente = useRef(0);

  const quitar = useCallback((id: number) => setAvisos((lista) => lista.filter((a) => a.id !== id)), []);

  const mostrar = useCallback<Mostrar>(
    ({ tipo, texto }) => {
      const id = ++siguiente.current;
      // El mismo aviso repetido no se apila; con cuatro a la vista basta.
      setAvisos((lista) => [...lista.filter((a) => a.texto !== texto).slice(-3), { id, tipo, texto }]);
      setTimeout(() => quitar(id), DURACION[tipo]);
    },
    [quitar],
  );

  return (
    <Contexto.Provider value={mostrar}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-4 bottom-4 z-[60] flex flex-col items-end gap-2 sm:left-auto sm:w-96"
      >
        {avisos.map((aviso) => (
          <div
            key={aviso.id}
            role={aviso.tipo === "error" ? "alert" : "status"}
            className={cn(
              "aparecer-aviso pointer-events-auto flex w-full items-start gap-3 rounded-lg border bg-card p-3 text-sm shadow-lg",
              aviso.tipo === "error" && "border-destructive/50",
              aviso.tipo === "advertencia" && "border-accent/50",
              aviso.tipo === "ok" && "border-success/50",
            )}
          >
            {aviso.tipo === "error" && <CircleX className="mt-0.5 size-4 shrink-0 text-destructive" />}
            {aviso.tipo === "advertencia" && <TriangleAlert className="mt-0.5 size-4 shrink-0 text-accent" />}
            {aviso.tipo === "ok" && <CircleCheck className="mt-0.5 size-4 shrink-0 text-success" />}
            <p className="flex-1">{aviso.texto}</p>
            <button
              type="button"
              onClick={() => quitar(aviso.id)}
              aria-label="Cerrar aviso"
              className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <X className="size-4" />
            </button>
          </div>
        ))}
      </div>
    </Contexto.Provider>
  );
}

/** Muestra un aviso flotante: `avisar({ tipo: "error", texto: "…" })`. */
export const useAvisos = () => useContext(Contexto);
