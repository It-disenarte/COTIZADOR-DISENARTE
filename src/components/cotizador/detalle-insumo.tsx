"use client";

import { Modal } from "@/components/modal";
import { Badge } from "@/components/ui";
import { urlImagenInsumo } from "@/components/catalogo/imagen-insumo";
import { ETIQUETA_UNIDAD, type UnidadCosto } from "@/lib/catalogo/constantes";
import { formatoMoneda, formatoNumero } from "@/lib/formato";
import type { InsumoSnapshot } from "@/lib/motor";

/**
 * Ficha completa de un insumo, en grande: la ventana del ojito de la ficha del catálogo. Muestra todo lo que el
 * catálogo sabe de él (imagen, nombres, costo, medidas y la nota). Es solo para consultar; el costo no sale al cliente.
 */
export function DetalleInsumo({ insumo, alCerrar }: { insumo: InsumoSnapshot; alCerrar: () => void }) {
  const unidad = insumo.unidadCosto ? ETIQUETA_UNIDAD[insumo.unidadCosto as UnidadCosto] : null;
  const nota = insumo.fuente?.trim();

  // Solo las medidas que aplican a cómo se compra este insumo.
  const medidas: [string, string][] = [];
  if (insumo.anchoUtilM) medidas.push(["Ancho útil", `${formatoNumero(insumo.anchoUtilM)} m`]);
  if (insumo.largoRolloM) medidas.push(["Largo del rollo", `${formatoNumero(insumo.largoRolloM)} m`]);
  if (insumo.areaLaminaM2) medidas.push(["Área de la lámina", `${formatoNumero(insumo.areaLaminaM2)} m²`]);

  return (
    <Modal titulo={insumo.nombre} descripcion={insumo.categoria || "Sin categoría"} alCerrar={alCerrar} className="max-w-xl">
      {insumo.imagenVersion && (
        <div className="flex justify-center rounded-lg border bg-muted p-2">
          {/* Ruta protegida por la sesión de la app: next/image no aplica aquí. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={urlImagenInsumo(insumo.id, insumo.imagenVersion)} alt={insumo.nombre} className="max-h-80 w-auto max-w-full rounded-md object-contain" />
        </div>
      )}

      <dl className="grid gap-x-4 gap-y-3 text-sm sm:grid-cols-2">
        <Dato titulo="Costo">
          {insumo.costo == null ? (
            <span className="text-accent">Sin costo capturado</span>
          ) : (
            <span className="text-lg font-semibold">{formatoMoneda(insumo.costo)}</span>
          )}
          <span className="block text-xs text-muted-foreground">sin IVA y sin margen</span>
        </Dato>
        <Dato titulo="Se compra por">{unidad ?? <span className="text-accent">Unidad por definir</span>}</Dato>
        {medidas.map(([titulo, valor]) => (
          <Dato key={titulo} titulo={titulo}>
            {valor}
          </Dato>
        ))}
        <Dato titulo="Nombre para el cliente">
          {insumo.nombreCliente?.trim() || <span className="text-muted-foreground">Igual al nombre (sin uno propio)</span>}
        </Dato>
        <Dato titulo="Proveedor">
          {insumo.proveedor || <span className="text-muted-foreground">Sin proveedor asignado</span>}
        </Dato>
        {insumo.requiereRevision && (
          <Dato titulo="Estado">
            <Badge variant="accent">Por revisar</Badge>
            <span className="mt-1 block text-xs text-muted-foreground">Confirma su costo antes de usarlo en una cotización.</span>
          </Dato>
        )}
        {nota && (
          <div className="sm:col-span-2">
            <Dato titulo="Fuente / nota">
              <span className="whitespace-pre-line">{nota}</span>
            </Dato>
          </div>
        )}
      </dl>
    </Modal>
  );
}

function Dato({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">{titulo}</dt>
      <dd className="mt-0.5">{children}</dd>
    </div>
  );
}
