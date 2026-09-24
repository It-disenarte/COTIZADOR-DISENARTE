"use client";

import { Loader2, MapPin } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Input, Label } from "@/components/ui";
import type { Lugar } from "@/lib/mapas/osm";
import { cn, llamarApi } from "@/lib/utils";

/** Se espera a que deje de teclear antes de consultar, para no hacer una consulta por letra. */
const ESPERA_MS = 450;
const MINIMO_LETRAS = 4;

/**
 * Dirección con sugerencias de OpenStreetMap. Al elegir una, se guarda su ubicación
 * exacta para calcular los km sin volver a buscar.
 */
export function CampoDireccion({
  valor,
  alCambiar,
  alElegirLugar,
}: {
  valor: string;
  alCambiar: (direccion: string) => void;
  alElegirLugar: (lugar: Lugar | null) => void;
}) {
  const [sugerencias, setSugerencias] = useState<Lugar[]>([]);
  const [abierto, setAbierto] = useState(false);
  const [buscando, setBuscando] = useState(false);
  const [resaltada, setResaltada] = useState(-1);
  // Lo último que se eligió: si el texto cambia, deja de valer.
  const elegido = useRef<string | null>(null);
  const contenedor = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (valor.trim().length < MINIMO_LETRAS || elegido.current === valor) {
      setSugerencias([]);
      return;
    }
    let vigente = true;
    const temporizador = setTimeout(async () => {
      setBuscando(true);
      try {
        const { sugerencias: lista } = await llamarApi<{ sugerencias: Lugar[] }>(
          `/api/distancia/sugerencias?q=${encodeURIComponent(valor)}`,
          "GET",
        );
        if (!vigente) return;
        setSugerencias(lista);
        setResaltada(-1);
        if (lista.length > 0) setAbierto(true);
      } catch {
        if (vigente) setSugerencias([]);
      } finally {
        if (vigente) setBuscando(false);
      }
    }, ESPERA_MS);

    return () => {
      vigente = false;
      clearTimeout(temporizador);
    };
  }, [valor]);

  // Cerrar al hacer clic fuera.
  useEffect(() => {
    const alClic = (e: MouseEvent) => {
      if (!contenedor.current?.contains(e.target as Node)) setAbierto(false);
    };
    document.addEventListener("mousedown", alClic);
    return () => document.removeEventListener("mousedown", alClic);
  }, []);

  function elegir(lugar: Lugar) {
    elegido.current = lugar.etiqueta;
    alCambiar(lugar.etiqueta);
    alElegirLugar(lugar);
    setAbierto(false);
    setSugerencias([]);
  }

  function alTeclear(e: React.KeyboardEvent) {
    if (!abierto || sugerencias.length === 0) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      setResaltada((i) => (e.key === "ArrowDown" ? (i + 1) % sugerencias.length : (i <= 0 ? sugerencias.length : i) - 1));
    } else if (e.key === "Enter" && resaltada >= 0) {
      e.preventDefault();
      elegir(sugerencias[resaltada]);
    } else if (e.key === "Escape") {
      setAbierto(false);
    }
  }

  return (
    <div ref={contenedor} className="relative space-y-2">
      <Label htmlFor="direccion">Dirección de instalación</Label>
      <div className="relative">
        <Input
          id="direccion"
          value={valor}
          autoComplete="off"
          role="combobox"
          aria-expanded={abierto}
          aria-autocomplete="list"
          onChange={(e) => {
            alCambiar(e.target.value);
            // Si edita el texto, el punto elegido ya no corresponde.
            if (elegido.current !== e.target.value) alElegirLugar(null);
          }}
          onFocus={() => sugerencias.length > 0 && setAbierto(true)}
          onKeyDown={alTeclear}
          placeholder="Av. Universidad 123, Col. Centro, Querétaro"
        />
        {buscando && <Loader2 className="absolute top-3 right-3 size-4 animate-spin text-muted-foreground" />}
      </div>

      {abierto && sugerencias.length > 0 && (
        <ul className="absolute z-20 mt-1 w-full overflow-hidden rounded-md border bg-card shadow-lg">
          {sugerencias.map((s, i) => (
            <li key={`${s.lat},${s.lon},${s.etiqueta}`}>
              <button
                type="button"
                className={cn(
                  "flex w-full items-start gap-2 px-3 py-2 text-left text-sm hover:bg-muted",
                  i === resaltada && "bg-muted",
                )}
                onMouseEnter={() => setResaltada(i)}
                onClick={() => elegir(s)}
              >
                <MapPin className="mt-0.5 size-4 shrink-0 text-primary" />
                <span>
                  {s.etiqueta}
                  {!s.exacto && <span className="text-muted-foreground"> · aproximado</span>}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <p className="text-xs text-muted-foreground">
        Donde se va a instalar o entregar. Escribe y elige una opción de la lista: así los kilómetros salen del
        punto exacto. Si no aparece, escríbela completa (calle, número, colonia, ciudad y estado).
      </p>
    </div>
  );
}
