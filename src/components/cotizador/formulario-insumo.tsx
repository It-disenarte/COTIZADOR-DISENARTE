"use client";

import { X } from "lucide-react";
import { useEffect, useState } from "react";
import { useAvisos } from "@/components/avisos";
import { PantallaCarga } from "@/components/pantalla-carga";
import { Button, Checkbox, Input, Label, Select } from "@/components/ui";
import { ETIQUETA_UNIDAD, UNIDADES_COSTO, type UnidadCosto } from "@/lib/catalogo/constantes";
import type { InsumoSnapshot } from "@/lib/motor";
import { llamarApi } from "@/lib/utils";

/** Lo que devuelve la API al crear o editar (la fila del catálogo). */
export type InsumoGuardado = { id: string; nombre: string; unidadCosto: UnidadCosto | null; anchoUtilM: string | null };

type Props = {
  /** Sin insumo = nuevo. */
  insumo: InsumoSnapshot | null;
  categorias: string[];
  /** Concepto elegido en la tabla, para ofrecer agregarle el insumo nuevo. */
  conceptoElegido: string | null;
  alCerrar: () => void;
  alGuardar: (insumo: InsumoGuardado, agregarAlConcepto: boolean) => void;
};

/**
 * Crear o corregir un insumo sin salir del asistente: si falta en el catálogo o su precio cambió.
 * Se guarda en el catálogo, así que sirve para todas las cotizaciones que se hagan desde ahora;
 * las ya autorizadas conservan el precio con el que se autorizaron.
 */
export function FormularioInsumo({ insumo, categorias, conceptoElegido, alCerrar, alGuardar }: Props) {
  const avisar = useAvisos();
  const nuevo = insumo === null;
  const [guardando, setGuardando] = useState(false);
  const [agregar, setAgregar] = useState(true);
  const [campos, setCampos] = useState({
    nombre: insumo?.nombre ?? "",
    nombreCliente: insumo?.nombreCliente ?? "",
    categoria: insumo?.categoria ?? "",
    unidadCosto: insumo?.unidadCosto ?? "",
    costo: insumo?.costo ?? "",
    anchoUtilM: insumo?.anchoUtilM ?? "",
    areaLaminaM2: insumo?.areaLaminaM2 ?? "",
  });
  const editar = (cambios: Partial<typeof campos>) => setCampos((c) => ({ ...c, ...cambios }));

  // Escape cierra, como cualquier ventana.
  useEffect(() => {
    const alTeclear = (e: KeyboardEvent) => e.key === "Escape" && alCerrar();
    window.addEventListener("keydown", alTeclear);
    return () => window.removeEventListener("keydown", alTeclear);
  }, [alCerrar]);

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    setGuardando(true);
    try {
      const cuerpo = {
        ...campos,
        // El ancho y el área solo aplican a rollos y láminas: en otra unidad no se guardan.
        anchoUtilM: campos.unidadCosto === "ml" ? campos.anchoUtilM : "",
        areaLaminaM2: campos.unidadCosto === "lamina" ? campos.areaLaminaM2 : "",
      };
      const { insumo: guardado } = nuevo
        ? await llamarApi<{ insumo: InsumoGuardado }>("/api/insumos", "POST", {
            ...cuerpo,
            requiereRevision: false,
            fuente: "Capturado desde el asistente de cotización.",
          })
        : await llamarApi<{ insumo: InsumoGuardado }>(`/api/insumos/${insumo.id}`, "PATCH", cuerpo);
      avisar({ tipo: "ok", texto: nuevo ? `Se agregó "${guardado.nombre}" al catálogo.` : `Se actualizó "${guardado.nombre}".` });
      alGuardar(guardado, nuevo && agregar && conceptoElegido !== null);
    } catch (error) {
      avisar({ tipo: "error", texto: error instanceof Error ? error.message : "No se pudo guardar el insumo." });
      setGuardando(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/30 p-4" onClick={alCerrar}>
      {guardando && <PantallaCarga mensaje="Guardando el insumo…" />}
      <form
        onSubmit={guardar}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="titulo-insumo"
        className="max-h-[90vh] w-full max-w-lg space-y-4 overflow-y-auto rounded-xl border bg-card p-5 shadow-xl"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="titulo-insumo" className="font-medium">
              {nuevo ? "Nuevo insumo" : `Editar ${insumo.nombre}`}
            </h2>
            <p className="text-xs text-muted-foreground">
              Se guarda en el catálogo: sirve para todas las cotizaciones desde ahora. Las ya autorizadas conservan su
              precio.
            </p>
          </div>
          <button type="button" onClick={alCerrar} aria-label="Cerrar" className="rounded p-1 hover:bg-muted">
            <X className="size-4" />
          </button>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="insumo-nombre">Nombre</Label>
          <Input id="insumo-nombre" value={campos.nombre} onChange={(e) => editar({ nombre: e.target.value })} required autoFocus />
          <p className="text-xs text-muted-foreground">Como lo identifican en el taller, p. ej. “Acrílico espejo plata 3 mm”.</p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="insumo-cliente">Nombre para el cliente</Label>
          <Input
            id="insumo-cliente"
            value={campos.nombreCliente}
            onChange={(e) => editar({ nombreCliente: e.target.value })}
            placeholder="Base de acrílico espejo plata"
          />
          <p className="text-xs text-muted-foreground">
            Opcional. Es la viñeta que ve el cliente en el PDF, ya como parte de la pieza. Vacío = el nombre.
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="insumo-categoria">Categoría</Label>
          <Input
            id="insumo-categoria"
            list="categorias-insumo"
            value={campos.categoria}
            onChange={(e) => editar({ categoria: e.target.value })}
            required
          />
          <datalist id="categorias-insumo">
            {categorias.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
          <p className="text-xs text-muted-foreground">Agrupa el insumo en el catálogo; elige una existente o escribe otra.</p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="insumo-unidad">Se compra por</Label>
            <Select id="insumo-unidad" value={campos.unidadCosto} onChange={(e) => editar({ unidadCosto: e.target.value })}>
              <option value="">Por definir</option>
              {UNIDADES_COSTO.map((u) => (
                <option key={u} value={u}>
                  {ETIQUETA_UNIDAD[u]}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="insumo-costo">Costo</Label>
            <Input
              id="insumo-costo"
              inputMode="decimal"
              value={campos.costo}
              onChange={(e) => editar({ costo: e.target.value })}
              placeholder="0.00"
            />
            <p className="text-xs text-muted-foreground">Sin IVA y sin margen, por la unidad elegida.</p>
          </div>
        </div>

        {campos.unidadCosto === "ml" && (
          <div className="space-y-1.5">
            <Label htmlFor="insumo-ancho">Ancho útil del rollo (m)</Label>
            <Input id="insumo-ancho" inputMode="decimal" value={campos.anchoUtilM} onChange={(e) => editar({ anchoUtilM: e.target.value })} />
            <p className="text-xs text-muted-foreground">
              Para calcularlo por medidas (m²), p. ej. 1.22. Déjalo vacío si es vinil de rotulación que se cobra por
              metros del escaneo.
            </p>
          </div>
        )}
        {campos.unidadCosto === "lamina" && (
          <div className="space-y-1.5">
            <Label htmlFor="insumo-area">Área de la lámina (m²)</Label>
            <Input id="insumo-area" inputMode="decimal" value={campos.areaLaminaM2} onChange={(e) => editar({ areaLaminaM2: e.target.value })} />
            <p className="text-xs text-muted-foreground">Para calcularlo por medidas, p. ej. 2.9768 para una lámina de 1.22 × 2.44 m.</p>
          </div>
        )}

        {nuevo && conceptoElegido !== null && (
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={agregar} onChange={(e) => setAgregar(e.target.checked)} />
            Agregarlo al concepto “{conceptoElegido || "sin nombre"}”
          </label>
        )}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={alCerrar}>
            Cancelar
          </Button>
          <Button type="submit" disabled={guardando}>
            {nuevo ? "Agregar al catálogo" : "Guardar cambios"}
          </Button>
        </div>
      </form>
    </div>
  );
}
