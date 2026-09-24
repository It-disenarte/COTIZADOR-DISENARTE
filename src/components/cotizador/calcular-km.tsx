"use client";

import { Loader2, MapPin, Route, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui";
import type { Lugar } from "@/lib/mapas/osm";
import type { ResultadoDistancia } from "@/lib/servicios/distancia";
import { llamarApi } from "@/lib/utils";

const duracion = (minutos: number) =>
  minutos >= 60 ? `${Math.floor(minutos / 60)} h ${minutos % 60} min` : `${minutos} min`;

/**
 * Calcula los km por carretera desde el taller hasta la dirección del cliente.
 * Muestra qué lugar encontró para que la persona confirme antes de usar el número.
 */
export function CalcularKm({
  direccion,
  lugar,
  alUsar,
}: {
  direccion: string;
  /** Punto elegido en las sugerencias; si existe, se usa tal cual. */
  lugar: Lugar | null;
  alUsar: (km: string) => void;
}) {
  const [calculando, setCalculando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<ResultadoDistancia | null>(null);

  async function calcular(destino?: { lat: number; lon: number; etiqueta: string }) {
    setCalculando(true);
    setError(null);
    try {
      const elegido = destino ?? (lugar ? { lat: lugar.lat, lon: lugar.lon, etiqueta: lugar.etiqueta } : null);
      const cuerpo = elegido ? { destino: elegido } : { direccion };
      const nuevo = await llamarApi<ResultadoDistancia>("/api/distancia", "POST", cuerpo);
      // Al elegir una alternativa se conservan las demás opciones de la primera búsqueda.
      setResultado((anterior) =>
        destino && anterior
          ? {
              ...nuevo,
              alternativas: [anterior.destino, ...anterior.alternativas].filter((a) => a.etiqueta !== destino.etiqueta),
            }
          : nuevo,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo calcular la distancia.");
    } finally {
      setCalculando(false);
    }
  }

  return (
    <div className="space-y-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => calcular()}
        disabled={calculando || (!lugar && direccion.trim().length < 5)}
        title={direccion.trim().length < 5 ? "Escribe primero la dirección de instalación" : undefined}
      >
        {calculando ? <Loader2 className="animate-spin" /> : <Route />} Calcular km desde Diseñarte
      </Button>
      {error && <p className="text-xs text-destructive">{error}</p>}

      {resultado && (
        <div className="space-y-2 rounded-md border border-primary/30 bg-primary/5 p-3 text-sm">
          <p className="flex items-start gap-1.5">
            <MapPin className="mt-0.5 size-4 shrink-0 text-primary" />
            <span>
              <span className="font-medium">{resultado.destino.etiqueta}</span>
              <br />
              <span className="font-semibold">{resultado.km} km</span>
              {resultado.porCarretera ? " por carretera, solo ida" : " (estimado), solo ida"}
              {resultado.minutos !== null && ` · unos ${duracion(resultado.minutos)} manejando`}
            </span>
          </p>
          {!resultado.porCarretera && (
            <p className="flex gap-1 text-xs text-accent">
              <TriangleAlert className="mt-0.5 size-3 shrink-0" />
              No se pudo trazar la ruta: es un cálculo aproximado a partir de la distancia en línea recta.
            </p>
          )}
          {!resultado.preciso && (
            <p className="flex gap-1 text-xs text-accent">
              <TriangleAlert className="mt-0.5 size-3 shrink-0" />
              Ubicación aproximada (a nivel colonia o ciudad). Revisa que sea el lugar correcto o agrega calle y número.
            </p>
          )}
          {resultado.origenAproximado && (
            <p className="text-xs text-muted-foreground">
              El punto de salida es aproximado: pide al administrador configurar las coordenadas del taller.
            </p>
          )}
          {resultado.alternativas.length > 0 && (
            <div className="text-xs">
              <p className="text-muted-foreground">¿No es ahí? Elige otra coincidencia:</p>
              <ul className="mt-1 space-y-0.5">
                {resultado.alternativas.map((a) => (
                  <li key={`${a.lat},${a.lon}`}>
                    <button
                      type="button"
                      className="text-left text-primary hover:underline disabled:opacity-60"
                      disabled={calculando}
                      onClick={() => calcular({ lat: a.lat, lon: a.lon, etiqueta: a.etiqueta })}
                    >
                      {a.etiqueta}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              onClick={() => {
                alUsar(resultado.km);
                setResultado(null);
              }}
            >
              Usar {resultado.km} km
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setResultado(null)}>
              Descartar
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
