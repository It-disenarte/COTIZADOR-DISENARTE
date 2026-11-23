"use client";

import { Card, CardContent, Input, Label } from "@/components/ui";
import type { BorradorCotizacion } from "@/lib/cotizador/estado";
import { formatoMoneda } from "@/lib/formato";
import type { Snapshot } from "@/lib/motor";

const porcentaje = (fraccion: number) => `${Math.round(fraccion * 1000) / 10}%`;

/**
 * Cotización rápida: la única variable es el tiempo de desarrollo, en horas (diseño y producción juntos).
 * Lo demás —margen de error, indirectos y utilidad— lo pone el sistema con los parámetros de la casa.
 */
export function PasoTiempoRapida({
  borrador,
  cambiar,
  snapshot,
}: {
  borrador: BorradorCotizacion;
  cambiar: (cambios: (b: BorradorCotizacion) => BorradorCotizacion) => void;
  snapshot: Snapshot | null;
}) {
  const { entrada } = borrador;
  const p = snapshot?.parametros;
  const tarifaHora = Number(p?.tarifaHoraDesarrollo ?? 0);
  const horas = Number(entrada.rapida?.horasDesarrollo ?? 0);

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="space-y-4 pt-6">
          <div className="space-y-2">
            <Label htmlFor="horas-desarrollo">Tiempo de desarrollo (horas)</Label>
            <Input
              id="horas-desarrollo"
              inputMode="decimal"
              className="max-w-48"
              value={String(entrada.rapida?.horasDesarrollo ?? "")}
              onChange={(e) =>
                cambiar((b) => ({ ...b, entrada: { ...b.entrada, rapida: { horasDesarrollo: e.target.value } } }))
              }
              placeholder="8"
            />
            <p className="text-xs text-muted-foreground">
              Las horas que lleva todo el trabajo, diseño y producción juntos. Es lo único que se captura aquí: no
              hay instalación, viáticos ni gasolina.
              {tarifaHora > 0 && horas > 0 && (
                <>
                  {" "}
                  Cuesta {formatoMoneda((horas * tarifaHora).toFixed(2))} ({horas} h × {formatoMoneda(tarifaHora.toFixed(2))} por
                  hora); ese costo se reparte entre los conceptos y no sale desglosado al cliente.
                </>
              )}
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="entrega-rapida">Tiempo de entrega para el cliente</Label>
            <Input
              id="entrega-rapida"
              value={String(entrada.tiempoEstimado ?? "")}
              onChange={(e) => cambiar((b) => ({ ...b, entrada: { ...b.entrada, tiempoEstimado: e.target.value } }))}
              placeholder="2-3 días"
            />
            <p className="text-xs text-muted-foreground">
              Solo es el texto que sale en el PDF (“5-7 días”); no cambia el precio.
            </p>
          </div>
        </CardContent>
      </Card>

      {p && (
        <Card>
          <CardContent className="space-y-1 pt-6 text-sm">
            <p className="font-medium">Cómo se calcula la cotización rápida</p>
            <p className="text-muted-foreground">
              Costo directo (insumos + tiempo) × {(1 + Number(p.pctMargenError)).toFixed(2)} por margen de error (
              {porcentaje(Number(p.pctMargenError))}) × {(1 + Number(p.pctIndirectos ?? 0.05)).toFixed(2)} por costos
              indirectos ({porcentaje(Number(p.pctIndirectos ?? 0.05))}) ÷ {(1 - Number(p.margen)).toFixed(2)} por utilidad
              de {porcentaje(Number(p.margen))} sobre la venta, más IVA. Los porcentajes y la tarifa por hora se editan en
              Catálogo → Parámetros.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
