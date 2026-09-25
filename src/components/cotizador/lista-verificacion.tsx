"use client";

import { Check, CircleAlert, X } from "lucide-react";
import { Card, CardContent } from "@/components/ui";
import type { BorradorCotizacion } from "@/lib/cotizador/estado";
import type { ResultadoCotizacion } from "@/lib/motor";
import { cn } from "@/lib/utils";

/**
 * Lista de verificación previa al envío (PNO-COM-01, apartado 11). Se llena sola con lo que
 * ya está capturado: no sustituye la revisión de la persona, pero enseña qué falta.
 */
type Punto = { texto: string; ok: boolean; obligatorio: boolean; nota?: string };

export function ListaVerificacion({
  borrador,
  resultado,
  autorizada,
}: {
  borrador: BorradorCotizacion;
  resultado: ResultadoCotizacion;
  autorizada: boolean;
}) {
  const { entrada } = borrador;
  const conTexto = (valor: unknown) => typeof valor === "string" && valor.trim().length > 0;
  const utilidadMinima = Math.min(...resultado.opciones.flatMap((o) => o.variantes.map((v) => Number(v.margenReal))));
  const sinRevisar = resultado.alertas.some((a) => a.codigo === "INSUMO_POR_REVISAR");
  const reventaSinVerificar = entrada.reventa.some((r) => !r.verificado);

  const puntos: Punto[] = [
    {
      texto: "Datos del cliente completos, con puesto del contacto",
      ok: conTexto(borrador.cliente.nombreContacto) && conTexto(borrador.cliente.puesto),
      obligatorio: false,
    },
    {
      texto: "La unidad de venta de cada insumo está confirmada en el catálogo",
      ok: !sinRevisar,
      obligatorio: true,
      nota: "Hay insumos marcados como “por revisar”: confirma su precio y su unidad.",
    },
    {
      texto: "Margen de error del 10% aplicado",
      ok: entrada.ajustes.aplicaMargenError,
      obligatorio: true,
      nota: "Quitarlo requiere autorización expresa de la Dirección (PNO 5.3).",
    },
    {
      texto: "La utilidad comprobada llega al 30%",
      ok: Number.isFinite(utilidadMinima) && utilidadMinima >= 0.3,
      obligatorio: true,
      nota: "Revisa el cálculo: la comprobación del apartado 6.8 quedó por debajo de lo autorizado.",
    },
    {
      texto: "El precio de reventa está verificado",
      ok: !reventaSinVerificar,
      obligatorio: true,
      nota: "Hay artículos de reventa sin confirmar el precio con la fuente.",
    },
    {
      texto: "La propuesta delimita lo que NO incluye",
      ok: conTexto(entrada.propuesta?.noIncluye),
      obligatorio: true,
      nota: "El PNO lo exige en toda propuesta (7.3.3).",
    },
    {
      texto: "Los supuestos del precio están asentados",
      ok: conTexto(entrada.propuesta?.supuestos),
      obligatorio: false,
      nota: "Solo si adoptaste algún supuesto que el cliente no confirmó (7.1.10).",
    },
    { texto: "Vigencia de la propuesta capturada", ok: Number(entrada.propuesta?.vigenciaDias) > 0, obligatorio: false },
    { texto: "Tiempo de entrega capturado", ok: conTexto(entrada.tiempoEstimado), obligatorio: false },
    { texto: "Petición de acción definida", ok: conTexto(entrada.propuesta?.peticionAccion), obligatorio: false },
    {
      texto: "Análisis de costos autorizado por el responsable",
      ok: autorizada,
      obligatorio: true,
      nota: "Sin autorización no se puede generar ni enviar la propuesta (punto de control de la Fase 1).",
    },
  ];

  const faltantes = puntos.filter((p) => !p.ok && p.obligatorio).length;

  return (
    <Card className={cn(faltantes > 0 && "border-accent")}>
      <CardContent className="space-y-3 pt-6">
        <div>
          <h3 className="font-medium">Lista de verificación previa al envío</h3>
          <p className="text-sm text-muted-foreground">
            {faltantes === 0
              ? "Todo lo obligatorio del PNO-COM-01 está cubierto."
              : `Faltan ${faltantes} punto(s) obligatorios del PNO-COM-01.`}
          </p>
        </div>
        <ul className="space-y-1.5 text-sm">
          {puntos.map((p) => (
            <li key={p.texto} className="flex items-start gap-2">
              {p.ok ? (
                <Check className="mt-0.5 size-4 shrink-0 text-success" />
              ) : p.obligatorio ? (
                <X className="mt-0.5 size-4 shrink-0 text-destructive" />
              ) : (
                <CircleAlert className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              )}
              <span className={cn(p.ok && "text-muted-foreground")}>
                {p.texto}
                {!p.ok && p.nota && <span className="block text-xs text-muted-foreground">{p.nota}</span>}
              </span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
