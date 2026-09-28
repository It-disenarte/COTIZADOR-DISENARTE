"use client";

import { ImagePlus, Loader2, Trash2 } from "lucide-react";
import { useState } from "react";
import { Button, Card, CardContent, Checkbox, Input, Label, Textarea } from "@/components/ui";
import { type BorradorCotizacion, txt } from "@/lib/cotizador/estado";
import { subirImagenCotizacion } from "@/lib/cotizador/imagen";
import type { OpcionCotizacion } from "@/lib/motor";
import { cn } from "@/lib/utils";

type Props = {
  borrador: BorradorCotizacion;
  cambiar: (cambios: (b: BorradorCotizacion) => BorradorCotizacion) => void;
  asegurarGuardado: () => Promise<string | null>;
};

export function PasoOpciones({ borrador, cambiar, asegurarGuardado }: Props) {
  const opciones = borrador.entrada.opciones;

  const editarOpcion = (id: string, cambios: Partial<OpcionCotizacion>) =>
    cambiar((b) => ({
      ...b,
      entrada: { ...b.entrada, opciones: b.entrada.opciones.map((o) => (o.id === id ? { ...o, ...cambios } : o)) },
    }));

  const quitarOpcion = (id: string) =>
    cambiar((b) => ({ ...b, entrada: { ...b.entrada, opciones: b.entrada.opciones.filter((o) => o.id !== id) } }));

  return (
    <div className="space-y-6">
      <div>
        <h3 className="font-medium">Opciones de la propuesta</h3>
        <p className="text-sm text-muted-foreground">
          Cada opción es una página del PDF con su tabla de precios. Los insumos de cada concepto se ponen en el paso
          Levantamiento; aquí va cómo se presenta al cliente.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {opciones.map((opcion, i) => (
          <Card key={opcion.id}>
            <CardContent className="space-y-4 pt-6">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 space-y-2">
                  <Label htmlFor={`nombre-${opcion.id}`}>Nombre de la opción</Label>
                  <Input
                    id={`nombre-${opcion.id}`}
                    value={opcion.nombre}
                    onChange={(e) => editarOpcion(opcion.id, { nombre: e.target.value })}
                    placeholder={`Opción ${i + 1}`}
                  />
                  <p className="text-xs text-muted-foreground">
                    Es el título de su página en el PDF, por ejemplo “Trovicel 3 mm con vinil de corte”.
                  </p>
                </div>
                {opciones.length > 1 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    title="Quitar opción"
                    aria-label={`Quitar ${opcion.nombre || `la opción ${i + 1}`}`}
                    onClick={() => quitarOpcion(opcion.id)}
                  >
                    <Trash2 />
                  </Button>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor={`descripcion-${opcion.id}`}>Descripción del material</Label>
                <Textarea
                  id={`descripcion-${opcion.id}`}
                  value={txt(opcion.descripcion)}
                  onChange={(e) => editarOpcion(opcion.id, { descripcion: e.target.value })}
                  placeholder="Trovicel de 3 mm con vinil de corte aplicado con papel transfer."
                  className="min-h-20"
                />
                <p className="text-xs text-muted-foreground">
                  Opcional. Sale en el PDF debajo del resumen de alcance. Describe el material, nunca su costo.
                </p>
              </div>

              <FotoOpcion
                nombre={opcion.nombre || `Opción ${i + 1}`}
                cotizacionId={borrador.id ?? null}
                imagenId={opcion.imagenId ?? null}
                asegurarGuardado={asegurarGuardado}
                alCambiar={(imagenId) => editarOpcion(opcion.id, { imagenId })}
              />
            </CardContent>
          </Card>
        ))}
      </div>
      {opciones.length === 0 && (
        <p className="text-sm text-muted-foreground">Agrega una opción desde el paso Levantamiento.</p>
      )}

      <Card>
        <CardContent className="grid gap-4 pt-6 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="tiempo">Tiempo estimado</Label>
            <Input
              id="tiempo"
              value={txt(borrador.entrada.tiempoEstimado)}
              onChange={(e) => cambiar((b) => ({ ...b, entrada: { ...b.entrada, tiempoEstimado: e.target.value } }))}
              placeholder="5-7 días"
            />
            <p className="text-xs text-muted-foreground">
              Un solo texto para todo el proyecto (diseño, producción e instalación juntos). Tú lo escribes; no se
              calcula de los días que captures en Operación. Se repite igual en cada página del PDF.
            </p>
          </div>
          <div className="pt-8">
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={borrador.entrada.incluyeEnvio}
                onChange={(e) => cambiar((b) => ({ ...b, entrada: { ...b.entrada, incluyeEnvio: e.target.checked } }))}
              />
              Incluye envío
            </label>
            <p className="mt-1 text-xs text-muted-foreground">
              Márcalo si se manda el material aunque no haya instalación: así se calculan viáticos, gasolina y
              casetas del viaje de entrega en el paso de Operación.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function FotoOpcion({
  nombre,
  cotizacionId,
  imagenId,
  asegurarGuardado,
  alCambiar,
}: {
  nombre: string;
  cotizacionId: string | null;
  imagenId: string | null;
  asegurarGuardado: () => Promise<string | null>;
  alCambiar: (imagenId: string | null) => void;
}) {
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function elegir(archivo: File | undefined) {
    if (!archivo) return;
    setError(null);
    if (!archivo.type.startsWith("image/")) {
      setError("Elige una imagen (JPG, PNG o foto del celular).");
      return;
    }
    setSubiendo(true);
    try {
      // La imagen se liga a la cotización, así que necesita estar guardada.
      const id = cotizacionId ?? (await asegurarGuardado());
      if (!id) {
        setError("Guarda primero el borrador (título y contacto del cliente) para poder subir fotos.");
        return;
      }
      alCambiar(await subirImagenCotizacion(id, archivo));
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo subir la imagen.");
    } finally {
      setSubiendo(false);
    }
  }

  async function quitar() {
    if (cotizacionId && imagenId) {
      // Si falla el borrado en el servidor, igual se quita de la cotización: no sale en el PDF.
      await fetch(`/api/cotizaciones/${cotizacionId}/imagenes/${imagenId}`, { method: "DELETE" }).catch(() => null);
    }
    alCambiar(null);
  }

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">Foto para el PDF</p>
      {imagenId && cotizacionId ? (
        <div className="space-y-2">
          {/* eslint-disable-next-line @next/next/no-img-element -- imagen privada servida por la API, sin optimizar */}
          <img
            src={`/api/cotizaciones/${cotizacionId}/imagenes/${imagenId}`}
            alt={`Foto de ${nombre}`}
            className="max-h-48 w-full rounded-md border object-contain"
          />
          <div className="flex gap-2">
            <Label className="cursor-pointer text-sm text-accent underline-offset-4 hover:underline">
              <ImagePlus className="mr-1 inline size-4" />
              Cambiar
              <input
                type="file"
                accept="image/*"
                className="sr-only"
                disabled={subiendo}
                onChange={(e) => elegir(e.target.files?.[0])}
              />
            </Label>
            <Button type="button" variant="ghost" size="sm" onClick={quitar}>
              <Trash2 /> Quitar
            </Button>
          </div>
        </div>
      ) : (
        <label
          className={cn(
            "flex cursor-pointer flex-col items-center justify-center gap-1 rounded-md border border-dashed p-6 text-sm text-muted-foreground hover:bg-muted",
            subiendo && "pointer-events-none opacity-60",
          )}
        >
          {subiendo ? <Loader2 className="size-5 animate-spin" /> : <ImagePlus className="size-5" />}
          {subiendo ? "Subiendo…" : "Agregar foto"}
          <input
            type="file"
            accept="image/*"
            className="sr-only"
            disabled={subiendo}
            onChange={(e) => elegir(e.target.files?.[0])}
          />
        </label>
      )}
      <p className="text-xs text-muted-foreground">
        Opcional. Sale debajo de la tabla de precios de esta opción (por ejemplo, cómo se ve el material terminado).
        Se reduce sola antes de subirse; puedes usar una foto del celular.
      </p>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
