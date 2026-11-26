"use client";

import { Plus, Trash2, X } from "lucide-react";
import { useState } from "react";
import { createPortal } from "react-dom";
import { Button, Card, CardContent, Input, Label, Textarea } from "@/components/ui";
import { type BorradorCotizacion, num, productoMaquilaNuevo, txt } from "@/lib/cotizador/estado";
import { idFila } from "@/lib/cotizador/revision";
import { formatoMoneda } from "@/lib/formato";
import { type ComponenteConcepto, costoDeConcepto, ErrorMotor, filaDeProducto, type InsumoSnapshot, type OpcionCotizacion, type Snapshot } from "@/lib/motor";
import type { ProductoMaquila } from "@/lib/motor/tipos";
import { cn } from "@/lib/utils";
import { FormularioInsumo, type InsumoGuardado } from "./formulario-insumo";
import { type Arrastre, ChipInsumo, modoInicial, PanelCatalogo, TIPO_ARRASTRE, usePantallaGrande } from "./paso-levantamiento";

type Props = {
  borrador: BorradorCotizacion;
  cambiar: (transformar: (b: BorradorCotizacion) => BorradorCotizacion) => void;
  snapshot: Snapshot | null;
  /** Opción que se está editando: cada una tiene sus propios productos de maquila. */
  indiceOpcion: number;
  setIndiceOpcion: (indice: number) => void;
  ranuraCatalogo?: HTMLElement | null;
  puedeEditarCatalogo?: boolean;
  recargarCatalogo?: () => Promise<void>;
};

/**
 * Maquila: productos que se arman con lo que nos hacen fuera (la base de un reconocimiento, su cristal…) más lo
 * que le ponemos nosotros (insumos del catálogo y horas). Al cliente solo le sale el nombre del producto.
 * Es distinto de la reventa, que se compra y se vende tal cual.
 */
export function PasoMaquila({
  borrador,
  cambiar,
  snapshot,
  indiceOpcion,
  setIndiceOpcion,
  ranuraCatalogo,
  puedeEditarCatalogo = false,
  recargarCatalogo,
}: Props) {
  const pantallaGrande = usePantallaGrande();
  const opciones = borrador.entrada.opciones;
  const activa = Math.min(indiceOpcion, Math.max(opciones.length - 1, 0));
  const opcion = opciones[activa];
  const productos = opcion?.maquilas ?? [];
  const [elegido, setElegido] = useState<string | null>(null);
  const [encima, setEncima] = useState<string | null>(null);
  const [formulario, setFormulario] = useState<{ insumo: InsumoSnapshot | null } | null>(null);
  const destino = productos.find((m) => m.id === elegido) ?? productos[0];

  const editarOpcion = (transformar: (o: OpcionCotizacion) => OpcionCotizacion) =>
    cambiar((b) => ({
      ...b,
      entrada: { ...b.entrada, opciones: b.entrada.opciones.map((o, i) => (i === activa ? transformar(o) : o)) },
    }));

  const editarProducto = (id: string, cambios: Partial<ProductoMaquila>) =>
    editarOpcion((o) => ({ ...o, maquilas: (o.maquilas ?? []).map((m) => (m.id === id ? { ...m, ...cambios } : m)) }));

  const editarInsumos = (id: string, transformar: (lista: ComponenteConcepto[]) => ComponenteConcepto[]) =>
    editarOpcion((o) => ({ ...o, materiales: { ...o.materiales, [id]: transformar(o.materiales[id] ?? []) } }));

  function agregarProducto() {
    const nuevo = productoMaquilaNuevo();
    editarOpcion((o) => ({ ...o, maquilas: [...(o.maquilas ?? []), nuevo] }));
    setElegido(nuevo.id);
  }

  function quitarProducto(id: string) {
    const sin = <T,>(mapa: Record<string, T>) => Object.fromEntries(Object.entries(mapa).filter(([k]) => k !== id));
    editarOpcion((o) => ({
      ...o,
      maquilas: (o.maquilas ?? []).filter((m) => m.id !== id),
      materiales: sin(o.materiales),
      preciosManuales: sin(o.preciosManuales ?? {}),
      descripciones: sin(o.descripciones ?? {}),
    }));
  }

  function agregarDelCatalogo(arrastre: Arrastre, id: string, recienCreado?: InsumoGuardado) {
    const insumo = recienCreado ?? snapshot?.insumos[arrastre.id];
    if (!insumo) return;
    editarInsumos(id, (lista) => [...lista, { insumoId: insumo.id, modo: modoInicial(insumo), cantidad: "1" }]);
    setElegido(id);
  }

  async function alGuardarInsumo(insumo: InsumoGuardado, agregarAlProducto: boolean) {
    setFormulario(null);
    await recargarCatalogo?.();
    if (agregarAlProducto && destino) agregarDelCatalogo({ tipo: "insumo", id: insumo.id }, destino.id, insumo);
  }

  const panel = (
    <PanelCatalogo
      snapshot={snapshot}
      puedeEditar={puedeEditarCatalogo}
      alNuevo={() => setFormulario({ insumo: null })}
      alEditar={(insumo) => setFormulario({ insumo })}
      enColumna={pantallaGrande && !!ranuraCatalogo}
      filaElegida={destino ? destino.nombre || "producto sin nombre" : null}
      alAgregar={(arrastre) => destino && agregarDelCatalogo(arrastre, destino.id)}
    />
  );

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h3 className="font-medium">Productos de maquila</h3>
        <p className="text-sm text-muted-foreground">
          Lo que nos hace un proveedor o una persona y nosotros completamos: por ejemplo un reconocimiento con la base
          del carpintero, el cristal del vidriero y nuestra placa sublimada. El cliente solo ve el nombre del producto,
          la cantidad y el precio, en la misma tabla que los conceptos. Lo que se compra y se vende tal cual va en el
          paso “Reventa”.
        </p>
        <p className="text-sm text-muted-foreground">
          La maquila lleva el mismo recargo que la reventa; nuestros insumos y horas, la fórmula del PNO. Si no lleva
          maquila, deja este paso vacío.
        </p>
      </div>

      {opciones.length > 1 && (
        <div className="flex flex-wrap items-center gap-2">
          {opciones.map((o, i) => (
            <button
              key={o.id}
              type="button"
              onClick={() => setIndiceOpcion(i)}
              aria-pressed={i === activa}
              className={cn(
                "rounded-full border px-4 py-1.5 text-sm",
                i === activa ? "border-primary bg-primary/10 font-medium text-primary" : "bg-card hover:bg-muted",
              )}
            >
              {o.nombre || `Opción ${i + 1}`}
            </button>
          ))}
          <span className="text-xs text-muted-foreground">Cada opción tiene sus propios productos.</span>
        </div>
      )}

      {productos.map((producto, i) => {
        const insumos = opcion?.materiales[producto.id] ?? [];
        const fila = filaDeProducto(producto);
        const piezas = num(producto.cantidad);
        const costoMaquila = producto.partes.reduce((s, m) => s + num(m.costo), 0) * piezas;
        let costoInsumos: string | null = null;
        let errorCosto: string | null = null;
        if (snapshot && insumos.length) {
          try {
            costoInsumos = costoDeConcepto(insumos, fila, snapshot).toFixed(2);
          } catch (error) {
            errorCosto = error instanceof ErrorMotor ? error.message : "Revisa las cantidades.";
          }
        }
        const editarParte = (k: number, cambios: Partial<ProductoMaquila["partes"][number]>) =>
          editarProducto(producto.id, { partes: producto.partes.map((m, n) => (n === k ? { ...m, ...cambios } : m)) });
        const campo = (nombre: string) => `${nombre}-${producto.id}`;

        return (
          <Card
            key={producto.id}
            onClick={() => setElegido(producto.id)}
            className={cn(destino?.id === producto.id && productos.length > 1 && "border-primary/60")}
          >
            <CardContent className="space-y-4 pt-6">
              <div className="flex flex-wrap items-start gap-3">
                <div className="min-w-56 flex-1 space-y-2">
                  <Label htmlFor={idFila(producto.id, "concepto")}>Nombre del producto</Label>
                  <Input
                    id={idFila(producto.id, "concepto")}
                    value={producto.nombre}
                    onChange={(e) => editarProducto(producto.id, { nombre: e.target.value })}
                    placeholder="Reconocimiento de madera y cristal"
                  />
                  <p className="text-xs text-muted-foreground">Es lo que ve el cliente en el PDF.</p>
                </div>
                <div className="w-28 space-y-2">
                  <Label htmlFor={idFila(producto.id, "cantidad")}>Cantidad</Label>
                  <Input
                    id={idFila(producto.id, "cantidad")}
                    inputMode="numeric"
                    value={txt(producto.cantidad)}
                    onChange={(e) => editarProducto(producto.id, { cantidad: e.target.value })}
                  />
                </div>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  title="Quitar producto"
                  aria-label={`Quitar ${producto.nombre || `el producto ${i + 1}`}`}
                  onClick={() => quitarProducto(producto.id)}
                >
                  <Trash2 />
                </Button>
              </div>

              <div id={idFila(producto.id, "maquila")} tabIndex={-1} className="space-y-2 rounded-lg border p-3">
                <p className="text-sm font-medium">Lo que nos maquilan</p>
                <p className="text-xs text-muted-foreground">Un renglón por cada trabajo, con lo que nos cuesta UNA pieza, sin IVA.</p>
                {producto.partes.map((parte, k) => (
                  <div key={k} className="flex flex-wrap items-center gap-2">
                    <Input
                      className="h-9 min-w-44 flex-1"
                      value={parte.concepto}
                      onChange={(e) => editarParte(k, { concepto: e.target.value })}
                      placeholder="Base de madera"
                      aria-label={`Trabajo ${k + 1}`}
                    />
                    <Input
                      className="h-9 w-40"
                      value={txt(parte.proveedor)}
                      onChange={(e) => editarParte(k, { proveedor: e.target.value })}
                      placeholder="Quién (opcional)"
                      aria-label={`Quién hace el trabajo ${k + 1}`}
                    />
                    <Input
                      className="h-9 w-32"
                      inputMode="decimal"
                      value={txt(parte.costo)}
                      onChange={(e) => editarParte(k, { costo: e.target.value })}
                      placeholder="Costo c/u"
                      aria-label={`Costo por pieza del trabajo ${k + 1}`}
                    />
                    <button
                      type="button"
                      onClick={() => editarProducto(producto.id, { partes: producto.partes.filter((_, n) => n !== k) })}
                      title="Quitar trabajo"
                      aria-label={`Quitar el trabajo ${k + 1}`}
                      className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-destructive"
                    >
                      <X className="size-4" />
                    </button>
                  </div>
                ))}
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => editarProducto(producto.id, { partes: [...producto.partes, { concepto: "", proveedor: "", costo: "" }] })}
                >
                  <Plus /> Otra maquila
                </Button>
              </div>

              <div className="space-y-2">
                <p className="text-sm font-medium">Lo que le ponemos nosotros</p>
                <div
                  id={idFila(producto.id, "insumos")}
                  onDragOver={(e) => {
                    if (!e.dataTransfer.types.includes(TIPO_ARRASTRE)) return;
                    e.preventDefault();
                    setEncima(producto.id);
                  }}
                  onDragLeave={() => setEncima(null)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setEncima(null);
                    const dato = e.dataTransfer.getData(TIPO_ARRASTRE);
                    if (dato) agregarDelCatalogo(JSON.parse(dato) as Arrastre, producto.id);
                  }}
                  className={cn(
                    "flex min-h-11 flex-wrap items-start gap-1.5 rounded-md border-[1.5px] border-dashed border-input p-1.5",
                    encima === producto.id && "border-accent bg-accent/10",
                  )}
                >
                  {insumos.length === 0 && (
                    <span className="px-1 py-1 text-xs text-muted-foreground">Arrastra aquí los insumos del catálogo (si lleva)</span>
                  )}
                  {insumos.map((c, k) => (
                    <ChipInsumo
                      key={`${c.insumoId}-${k}`}
                      componente={c}
                      fila={fila}
                      snapshot={snapshot}
                      nombre={snapshot?.insumos[c.insumoId]?.nombre ?? "Insumo"}
                      alCambiar={(cambios) => editarInsumos(producto.id, (l) => l.map((x, n) => (n === k ? { ...x, ...cambios } : x)))}
                      alQuitar={() => editarInsumos(producto.id, (l) => l.filter((_, n) => n !== k))}
                    />
                  ))}
                </div>
                <div className="flex flex-wrap gap-3">
                  <div className="w-28 space-y-1">
                    <Label htmlFor={idFila(producto.id, "ancho")}>Ancho (m)</Label>
                    <Input
                      id={idFila(producto.id, "ancho")}
                      inputMode="decimal"
                      value={txt(producto.anchoM)}
                      vacioEsCero
                      onChange={(e) => editarProducto(producto.id, { anchoM: e.target.value })}
                    />
                  </div>
                  <div className="w-28 space-y-1">
                    <Label htmlFor={idFila(producto.id, "alto")}>Alto (m)</Label>
                    <Input
                      id={idFila(producto.id, "alto")}
                      inputMode="decimal"
                      value={txt(producto.altoM)}
                      vacioEsCero
                      onChange={(e) => editarProducto(producto.id, { altoM: e.target.value })}
                    />
                  </div>
                  <div className="w-36 space-y-1">
                    <Label htmlFor={campo("horas")}>Horas de trabajo</Label>
                    <Input
                      id={campo("horas")}
                      inputMode="decimal"
                      value={txt(producto.horas)}
                      vacioEsCero
                      onChange={(e) => editarProducto(producto.id, { horas: e.target.value })}
                    />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  Ancho y alto son los de lo que ponemos nosotros (p. ej. la placa) y solo sirven para los insumos por m².
                  Las horas son las de todas las piezas juntas (sublimar, cortar, armar).
                </p>
              </div>

              <div className="space-y-1">
                <Label htmlFor={campo("descripcion")}>Descripción para el PDF (opcional)</Label>
                <Textarea
                  id={campo("descripcion")}
                  value={txt(opcion?.descripciones?.[producto.id])}
                  onChange={(e) =>
                    editarOpcion((o) => ({ ...o, descripciones: { ...(o.descripciones ?? {}), [producto.id]: e.target.value } }))
                  }
                />
                <p className="text-xs text-muted-foreground">
                  Una viñeta por renglón. Vacía = el cliente solo ve el nombre; no menciones costos ni quién lo maquila.
                </p>
              </div>

              <p className="border-t pt-2 text-xs text-muted-foreground">
                Costo (interno): maquila {formatoMoneda(costoMaquila.toFixed(2))}
                {costoInsumos !== null && ` · insumos ${formatoMoneda(costoInsumos)}`}
                {num(producto.horas) > 0 &&
                  ` · mano de obra ${formatoMoneda(
                    (num(producto.horas) * num(snapshot?.parametros.tarifaHoraDesarrollo ?? num(snapshot?.parametros.tarifaDisenoDia) / 8)).toFixed(2),
                  )}`}
                . El precio al cliente se ve en el precio en vivo y en el Resumen.
                {errorCosto && <span className="block text-destructive">{errorCosto}</span>}
              </p>
            </CardContent>
          </Card>
        );
      })}

      <Button type="button" variant="outline" onClick={agregarProducto}>
        <Plus /> Agregar producto de maquila
      </Button>

      {productos.length > 0 && (pantallaGrande && ranuraCatalogo ? createPortal(panel, ranuraCatalogo) : panel)}
      {formulario && (
        <FormularioInsumo
          insumo={formulario.insumo}
          conceptoElegido={destino?.nombre ?? null}
          alCerrar={() => setFormulario(null)}
          alCambiarImagen={recargarCatalogo}
          alGuardar={alGuardarInsumo}
        />
      )}
    </div>
  );
}
