"use client";

import { ImagePlus, Loader2, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useAvisos } from "@/components/avisos";
import { Button } from "@/components/ui";
import { subirImagenInsumo } from "@/lib/cotizador/imagen";
import { cn, llamarApi } from "@/lib/utils";

/** Dirección de la imagen de un insumo. La versión cambia al reemplazarla, así el navegador nunca enseña una vieja. */
export const urlImagenInsumo = (insumoId: string, version: string) => `/api/insumos/${insumoId}/imagen?v=${version}`;

/** La imagen del insumo en chico, para su ficha. Sin imagen no dibuja nada. */
export function MiniaturaInsumo({ insumoId, version, className }: { insumoId: string; version?: string | null; className?: string }) {
  if (!version) return null;
  return (
    // Es una ruta protegida por la sesión de la app: next/image no aplica aquí.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={urlImagenInsumo(insumoId, version)}
      alt=""
      loading="lazy"
      className={cn("size-14 shrink-0 rounded-md border bg-muted object-cover", className)}
    />
  );
}

/**
 * Pone, cambia o quita la imagen de un insumo, en el formulario del catálogo y en el del asistente.
 * - Insumo que ya existe: la imagen se sube o se quita al momento.
 * - Insumo nuevo (sin `insumoId`): solo se elige; quien guarda el insumo la sube después, con `alElegirPendiente`.
 */
export function EditorImagenInsumo({
  insumoId,
  version,
  alCambiar,
  alElegirPendiente,
}: {
  insumoId?: string | null;
  version?: string | null;
  /** Se subió o se quitó la imagen de un insumo que ya existía. */
  alCambiar?: (version: string | null) => void;
  /** Insumo nuevo: la imagen que se eligió y se subirá al guardarlo (null = ninguna). */
  alElegirPendiente?: (archivo: File | null) => void;
}) {
  const avisar = useAvisos();
  const entrada = useRef<HTMLInputElement>(null);
  const [versionActual, setVersionActual] = useState(version ?? null);
  const [pendiente, setPendiente] = useState<File | null>(null);
  const [trabajando, setTrabajando] = useState(false);

  // Vista previa del archivo elegido para un insumo nuevo: la dirección se crea al elegirlo y se libera al cambiarla.
  const [vistaPrevia, setVistaPrevia] = useState<string | null>(null);
  useEffect(() => {
    return () => {
      if (vistaPrevia) URL.revokeObjectURL(vistaPrevia);
    };
  }, [vistaPrevia]);

  async function elegir(archivo: File | undefined) {
    if (!archivo) return;
    if (!insumoId) {
      setPendiente(archivo);
      setVistaPrevia(URL.createObjectURL(archivo));
      alElegirPendiente?.(archivo);
      return;
    }
    setTrabajando(true);
    try {
      const nueva = await subirImagenInsumo(insumoId, archivo);
      setVersionActual(nueva);
      alCambiar?.(nueva);
    } catch (e) {
      avisar({ tipo: "error", texto: e instanceof Error ? e.message : "No se pudo subir la imagen." });
    } finally {
      setTrabajando(false);
    }
  }

  async function quitar() {
    if (!insumoId) {
      setPendiente(null);
      setVistaPrevia(null);
      alElegirPendiente?.(null);
      return;
    }
    setTrabajando(true);
    try {
      await llamarApi(`/api/insumos/${insumoId}/imagen`, "DELETE");
      setVersionActual(null);
      alCambiar?.(null);
    } catch (e) {
      avisar({ tipo: "error", texto: e instanceof Error ? e.message : "No se pudo quitar la imagen." });
    } finally {
      setTrabajando(false);
    }
  }

  const hay = insumoId ? !!versionActual : !!pendiente;

  return (
    <div className="space-y-1.5">
      <p className="text-sm font-medium">Imagen</p>
      <div className="flex items-center gap-3">
        {hay && insumoId && <MiniaturaInsumo insumoId={insumoId} version={versionActual} className="size-20" />}
        {hay && !insumoId && vistaPrevia && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={vistaPrevia} alt="" className="size-20 shrink-0 rounded-md border bg-muted object-cover" />
        )}
        <div className="flex flex-wrap gap-2">
          <input
            ref={entrada}
            type="file"
            accept="image/png,image/jpeg"
            className="hidden"
            onChange={(e) => {
              void elegir(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
          <Button type="button" variant="outline" size="sm" disabled={trabajando} onClick={() => entrada.current?.click()}>
            {trabajando ? <Loader2 className="animate-spin" /> : <ImagePlus />} {hay ? "Cambiar imagen" : "Agregar imagen"}
          </Button>
          {hay && (
            <Button type="button" variant="ghost" size="sm" disabled={trabajando} onClick={quitar}>
              <Trash2 /> Quitar
            </Button>
          )}
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Opcional. JPG o PNG; se reduce sola. Sale en la ficha del insumo en el catálogo del asistente, para
        reconocerlo rápido. No sale en el PDF.
        {!insumoId && " Se sube al guardar el insumo."}
      </p>
    </div>
  );
}
