"use client";

import { ClipboardPaste, Copy, GripVertical, Plus, Search, Trash2, X } from "lucide-react";
import { useMemo, useState } from "react";
import { Button, Card, CardContent, Input, Textarea } from "@/components/ui";
import { ETIQUETA_MODO_CORTA, MODOS_COMPONENTE, type ModoComponente } from "@/lib/catalogo/constantes";
import {
  type BorradorCotizacion,
  filaNueva,
  filasDesdeTsv,
  fusionarLevantamiento,
  num,
  opcionNueva,
  txt,
} from "@/lib/cotizador/estado";
import { formatoMoneda } from "@/lib/formato";
import {
  type ComponenteConcepto,
  componentesDeReceta,
  costoDeConcepto,
  ErrorMotor,
  type InsumoSnapshot,
  type OpcionCotizacion,
  type Snapshot,
} from "@/lib/motor";
import { cn } from "@/lib/utils";
import { ImportarLevantamiento } from "./ia";

type Props = {
  borrador: BorradorCotizacion;
  cambiar: (cambios: (b: BorradorCotizacion) => BorradorCotizacion) => void;
  snapshot: Snapshot | null;
};

const sinClave = <T,>(objeto: Record<string, T>, clave: string): Record<string, T> =>
  Object.fromEntries(Object.entries(objeto).filter(([k]) => k !== clave));

/** Lo que se arrastra del catálogo: un insumo suelto o una plantilla (receta) completa. */
type Arrastre = { tipo: "insumo" | "plantilla"; id: string };
const TIPO_ARRASTRE = "application/x-disenarte-catalogo";

const UNIDAD_CORTA: Record<string, string> = {
  m2: "m²",
  ml: "metro lineal",
  pieza: "pieza",
  lamina: "lámina",
  minuto: "minuto",
  ciento: "ciento",
  millar: "millar",
  persona: "persona",
};

/**
 * Cómo se consume un insumo recién agregado, según cómo se compra. Un rollo sin ancho útil
 * (vinil de rotulación) va por metros lineales por pieza: los metros salen del escaneo.
 */
function modoInicial(insumo: InsumoSnapshot): ModoComponente {
  if (insumo.unidadCosto === "ml") return insumo.anchoUtilM ? "por_m2" : "por_ml";
  if (insumo.unidadCosto === "m2" || insumo.unidadCosto === "lamina") return "por_m2";
  return "por_pieza";
}

export function PasoLevantamiento({ borrador, cambiar, snapshot }: Props) {
  const { areas, filas } = borrador.entrada.levantamiento;
  const opciones = borrador.entrada.opciones;
  const [indiceOpcion, setIndiceOpcion] = useState(0);
  const activa = Math.min(indiceOpcion, Math.max(opciones.length - 1, 0));
  const opcion = opciones[activa];
  const [filaElegida, setFilaElegida] = useState<string | null>(filas[0]?.id ?? null);
  const [pegado, setPegado] = useState<string | null>(null);
  const [filaEncima, setFilaEncima] = useState<string | null>(null);

  const editarEntrada = (transformar: (e: BorradorCotizacion["entrada"]) => BorradorCotizacion["entrada"]) =>
    cambiar((b) => ({ ...b, entrada: transformar(b.entrada) }));

  const editarLevantamiento = (cambios: Partial<BorradorCotizacion["entrada"]["levantamiento"]>) =>
    editarEntrada((e) => ({ ...e, levantamiento: { ...e.levantamiento, ...cambios } }));

  const editarFila = (id: string, cambios: Partial<(typeof filas)[number]>) =>
    editarLevantamiento({ filas: filas.map((f) => (f.id === id ? { ...f, ...cambios } : f)) });

  const editarOpcionActiva = (transformar: (o: OpcionCotizacion) => OpcionCotizacion) =>
    editarEntrada((e) => ({ ...e, opciones: e.opciones.map((o, i) => (i === activa ? transformar(o) : o)) }));

  const editarMateriales = (filaId: string, transformar: (lista: ComponenteConcepto[]) => ComponenteConcepto[]) =>
    editarOpcionActiva((o) => ({ ...o, materiales: { ...o.materiales, [filaId]: transformar(o.materiales[filaId] ?? []) } }));

  function agregarDelCatalogo(arrastre: Arrastre, filaId: string) {
    if (!snapshot) return;
    let nuevos: ComponenteConcepto[] = [];
    if (arrastre.tipo === "insumo") {
      const insumo = snapshot.insumos[arrastre.id];
      if (insumo) nuevos = [{ insumoId: insumo.id, modo: modoInicial(insumo), cantidad: "1" }];
    } else {
      const receta = snapshot.recetas[arrastre.id];
      if (receta) nuevos = componentesDeReceta(receta);
    }
    if (nuevos.length) editarMateriales(filaId, (lista) => [...lista, ...nuevos]);
    setFilaElegida(filaId);
  }

  /** Copia los insumos de un concepto a los conceptos que todavía no tienen. */
  function usarEnVacios(filaId: string) {
    const origen = opcion?.materiales[filaId] ?? [];
    editarOpcionActiva((o) => {
      const materiales = { ...o.materiales };
      for (const f of filas) {
        if (f.id !== filaId && !(materiales[f.id]?.length)) materiales[f.id] = origen.map((c) => ({ ...c }));
      }
      return { ...o, materiales };
    });
  }

  function quitarFila(id: string) {
    editarEntrada((e) => ({
      ...e,
      levantamiento: { ...e.levantamiento, filas: e.levantamiento.filas.filter((f) => f.id !== id) },
      // Sus insumos y su precio manual se van con él, en todas las opciones.
      opciones: e.opciones.map((o) => ({ ...o, materiales: sinClave(o.materiales, id), preciosManuales: sinClave(o.preciosManuales ?? {}, id) })),
    }));
  }

  function cambiarAreas(nuevas: string[], quitar?: number) {
    editarLevantamiento({
      areas: nuevas,
      filas: filas.map((f) => ({
        ...f,
        cantidades:
          quitar === undefined
            ? Array.from({ length: nuevas.length }, (_, i) => f.cantidades[i] ?? "")
            : f.cantidades.filter((_, i) => i !== quitar),
      })),
    });
  }

  function agregarOpcion() {
    // La opción nueva parte de la actual: solo se cambia lo que sea distinto.
    const base = opcion;
    const nueva = opcionNueva(opciones.length + 1);
    if (base) nueva.materiales = JSON.parse(JSON.stringify(base.materiales));
    editarEntrada((e) => ({ ...e, opciones: [...e.opciones, nueva] }));
    setIndiceOpcion(opciones.length);
  }

  const totalPiezas = filas.reduce<number>((t, f) => t + f.cantidades.reduce<number>((s, c) => s + num(c), 0), 0);
  const totalM2 = filas.reduce(
    (t, f) => t + f.cantidades.reduce<number>((s, c) => s + num(c), 0) * num(f.anchoM) * num(f.altoM),
    0,
  );

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_18rem]">
      <div className="min-w-0 space-y-4">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            {opciones.map((o, i) => (
              <button
                key={o.id}
                type="button"
                onClick={() => setIndiceOpcion(i)}
                className={cn(
                  "rounded-full border px-4 py-1.5 text-sm transition-colors",
                  i === activa ? "border-primary bg-primary/10 font-medium text-primary" : "bg-card hover:bg-muted",
                )}
              >
                {o.nombre || `Opción ${i + 1}`}
              </button>
            ))}
            <button
              type="button"
              onClick={agregarOpcion}
              className="rounded-full border border-dashed px-4 py-1.5 text-sm text-muted-foreground hover:bg-muted"
            >
              + Agregar opción
            </button>
          </div>
          <p className="text-xs text-muted-foreground">
            Casi siempre basta con una opción. Si el cliente quiere comparar materiales, agrega otra: se copian los
            insumos de la opción actual y cambias solo lo que sea distinto. Cada opción es una página del PDF; su
            nombre y su foto se capturan en el paso siguiente.
          </p>
        </div>

        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">Concepto</th>
                  <th className="px-3 py-2 font-medium">Ancho (m)</th>
                  <th className="px-3 py-2 font-medium">Alto (m)</th>
                  {areas.map((area, j) => (
                    <th key={j} className="px-2 py-1 font-medium">
                      <div className="flex items-center gap-0.5">
                        <input
                          value={area}
                          onChange={(e) => cambiarAreas(areas.map((a, k) => (k === j ? e.target.value : a)))}
                          placeholder={`Área ${j + 1}`}
                          aria-label={`Nombre del área ${j + 1}`}
                          className="h-8 w-24 rounded-md border border-transparent bg-transparent px-1.5 text-xs uppercase tracking-wide hover:border-input focus:border-input focus:bg-card focus:outline-none"
                        />
                        {areas.length > 1 && (
                          <button
                            type="button"
                            title="Quitar área"
                            aria-label={`Quitar el área ${area || j + 1}`}
                            onClick={() => cambiarAreas(areas.filter((_, k) => k !== j), j)}
                            className="rounded p-0.5 hover:bg-muted hover:text-foreground"
                          >
                            <X className="size-3.5" />
                          </button>
                        )}
                      </div>
                    </th>
                  ))}
                  <th className="px-3 py-2 font-medium">Insumos {opciones.length > 1 && `· ${opcion?.nombre ?? ""}`}</th>
                  <th className="px-3 py-2 text-right font-medium">Costo</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y">
                {filas.map((fila, i) => {
                  const piezas = fila.cantidades.reduce<number>((s, c) => s + num(c), 0);
                  const m2 = piezas * num(fila.anchoM) * num(fila.altoM);
                  const componentes = opcion?.materiales[fila.id] ?? [];
                  let costo: string | null = null;
                  let errorCosto: string | null = null;
                  if (snapshot && componentes.length) {
                    try {
                      costo = costoDeConcepto(componentes, fila, snapshot).toFixed(2);
                    } catch (error) {
                      errorCosto = error instanceof ErrorMotor ? error.message : "Revisa las cantidades.";
                    }
                  }
                  return (
                    <tr
                      key={fila.id}
                      onClick={() => setFilaElegida(fila.id)}
                      className={cn("align-top", filaElegida === fila.id && "bg-primary/5")}
                    >
                      <td className="px-3 py-2">
                        <Input
                          className="h-9 min-w-40"
                          value={fila.concepto}
                          onChange={(e) => editarFila(fila.id, { concepto: e.target.value })}
                          aria-label={`Concepto de la fila ${i + 1}`}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <Input
                          className="h-9 w-20"
                          inputMode="decimal"
                          value={txt(fila.anchoM)}
                          onChange={(e) => editarFila(fila.id, { anchoM: e.target.value })}
                          aria-label={`Ancho de la fila ${i + 1}`}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <Input
                          className="h-9 w-20"
                          inputMode="decimal"
                          value={txt(fila.altoM)}
                          onChange={(e) => editarFila(fila.id, { altoM: e.target.value })}
                          aria-label={`Alto de la fila ${i + 1}`}
                        />
                      </td>
                      {areas.map((area, j) => (
                        <td key={j} className="px-2 py-2">
                          <Input
                            className="h-9 w-20"
                            inputMode="numeric"
                            value={txt(fila.cantidades[j])}
                            onChange={(e) =>
                              editarFila(fila.id, { cantidades: fila.cantidades.map((c, k) => (k === j ? e.target.value : c)) })
                            }
                            aria-label={`Cantidad de ${area || `área ${j + 1}`} en la fila ${i + 1}`}
                          />
                        </td>
                      ))}
                      <td className="px-3 py-2">
                        <div
                          onDragOver={(e) => {
                            if (!e.dataTransfer.types.includes(TIPO_ARRASTRE)) return;
                            e.preventDefault();
                            setFilaEncima(fila.id);
                          }}
                          onDragLeave={() => setFilaEncima(null)}
                          onDrop={(e) => {
                            e.preventDefault();
                            setFilaEncima(null);
                            const dato = e.dataTransfer.getData(TIPO_ARRASTRE);
                            if (dato) agregarDelCatalogo(JSON.parse(dato) as Arrastre, fila.id);
                          }}
                          className={cn(
                            "flex min-h-11 min-w-64 flex-wrap items-start gap-1.5 rounded-md border-[1.5px] border-dashed border-input p-1.5 transition-colors",
                            filaEncima === fila.id && "border-accent bg-accent/10",
                          )}
                        >
                          {componentes.length === 0 && (
                            <span className="px-1 py-1 text-xs text-muted-foreground">
                              Arrastra aquí insumos o una plantilla
                            </span>
                          )}
                          {componentes.map((c, k) => (
                            <ChipInsumo
                              key={`${c.insumoId}-${k}`}
                              componente={c}
                              nombre={snapshot?.insumos[c.insumoId]?.nombre ?? "Insumo"}
                              alCambiar={(cambios) =>
                                editarMateriales(fila.id, (lista) => lista.map((x, n) => (n === k ? { ...x, ...cambios } : x)))
                              }
                              alQuitar={() => editarMateriales(fila.id, (lista) => lista.filter((_, n) => n !== k))}
                            />
                          ))}
                        </div>
                        {componentes.length > 0 && filas.length > 1 && (
                          <button
                            type="button"
                            onClick={() => usarEnVacios(fila.id)}
                            className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                          >
                            <Copy className="size-3" /> Usar en los conceptos sin insumos
                          </button>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-right">
                        {costo !== null && <p>{formatoMoneda(costo)}</p>}
                        {errorCosto && <p className="max-w-48 whitespace-normal text-xs text-destructive">{errorCosto}</p>}
                        <p className="text-xs text-muted-foreground">
                          {piezas} pzas · {m2.toFixed(2)} m²
                        </p>
                      </td>
                      <td className="px-2 py-2">
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          title="Quitar concepto"
                          onClick={(e) => {
                            e.stopPropagation();
                            quitarFila(fila.id);
                          }}
                        >
                          <Trash2 />
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="bg-muted/40 text-sm font-medium">
                <tr>
                  <td className="px-3 py-2" colSpan={4 + areas.length}>
                    Total
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-right">
                    {totalPiezas} pzas · {totalM2.toFixed(2)} m²
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
          <div className="flex flex-wrap items-center gap-2 border-t p-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                const fila = filaNueva(areas.length);
                editarLevantamiento({ filas: [...filas, fila] });
                setFilaElegida(fila.id);
              }}
            >
              <Plus /> Agregar concepto
            </Button>
            <Button type="button" variant="outline" onClick={() => cambiarAreas([...areas, `Área ${areas.length + 1}`])}>
              <Plus /> Agregar área
            </Button>
            <Button type="button" variant="outline" onClick={() => setPegado(pegado === null ? "" : null)}>
              <ClipboardPaste /> Pegar de Excel
            </Button>
            <ImportarLevantamiento
              alAplicar={(leido, modo) => {
                const nuevo = { areas: leido.areas, filas: leido.filas };
                editarLevantamiento(
                  modo === "reemplazar"
                    ? fusionarLevantamiento({ areas: leido.areas, filas: [] }, nuevo)
                    : fusionarLevantamiento(borrador.entrada.levantamiento, nuevo),
                );
              }}
            />
          </div>
          <p className="px-3 pb-3 text-xs text-muted-foreground">
            Cada área es una columna de cantidades; toca su nombre para cambiarlo. Si el material se cobra por pieza,
            deja ancho y alto en 0. Para rotulación, pon los metros lineales del escaneo en el insumo (“ml por
            pieza”).
          </p>
        </Card>

        {pegado !== null && (
          <Card>
            <CardContent className="space-y-2 pt-6">
              <Textarea
                value={pegado}
                onChange={(e) => setPegado(e.target.value)}
                placeholder={"Concepto\tAncho\tAlto\tCantidad área 1\tCantidad área 2"}
                className="min-h-28 font-mono text-xs"
              />
              <p className="text-xs text-muted-foreground">
                Reemplaza la tabla. Los insumos se vuelven a asignar después, porque los conceptos son nuevos.
              </p>
              <Button
                type="button"
                size="sm"
                onClick={() => {
                  const nuevas = filasDesdeTsv(pegado, areas.length);
                  if (nuevas.length) editarLevantamiento({ filas: nuevas });
                  setPegado(null);
                }}
              >
                Reemplazar tabla con lo pegado
              </Button>
            </CardContent>
          </Card>
        )}
      </div>

      <PanelCatalogo
        snapshot={snapshot}
        filaElegida={filas.find((f) => f.id === filaElegida)?.concepto ?? null}
        alAgregar={(arrastre) => {
          const destino = filaElegida && filas.some((f) => f.id === filaElegida) ? filaElegida : filas[0]?.id;
          if (destino) agregarDelCatalogo(arrastre, destino);
        }}
      />
    </div>
  );
}

function ChipInsumo({
  componente,
  nombre,
  alCambiar,
  alQuitar,
}: {
  componente: ComponenteConcepto;
  nombre: string;
  alCambiar: (cambios: Partial<ComponenteConcepto>) => void;
  alQuitar: () => void;
}) {
  return (
    <div className="grid gap-1 rounded-md bg-primary/10 py-1 pl-2 pr-1 text-xs text-primary">
      <div className="flex items-center justify-between gap-1">
        <span className="font-medium">{nombre}</span>
        <button
          type="button"
          onClick={alQuitar}
          aria-label={`Quitar ${nombre}`}
          className="rounded p-0.5 hover:bg-primary/15"
        >
          <X className="size-3.5" />
        </button>
      </div>
      <div className="flex items-center gap-1">
        <input
          inputMode="decimal"
          value={txt(componente.cantidad)}
          onChange={(e) => alCambiar({ cantidad: e.target.value })}
          aria-label={`Cantidad de ${nombre}`}
          title="Cuánto se usa: 1 = una capa del área, o los metros lineales / piezas por pieza"
          className="h-6 w-14 rounded border border-input bg-card px-1 text-foreground"
        />
        <select
          value={componente.modo}
          onChange={(e) => alCambiar({ modo: e.target.value as ModoComponente })}
          aria-label={`Cómo se consume ${nombre}`}
          className="h-6 rounded border border-input bg-card px-1 text-foreground"
        >
          {MODOS_COMPONENTE.map((m) => (
            <option key={m} value={m}>
              {ETIQUETA_MODO_CORTA[m]}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

function PanelCatalogo({
  snapshot,
  filaElegida,
  alAgregar,
}: {
  snapshot: Snapshot | null;
  filaElegida: string | null;
  alAgregar: (arrastre: Arrastre) => void;
}) {
  const [busqueda, setBusqueda] = useState("");

  const { plantillas, grupos } = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    const coincide = (texto: string) => texto.toLowerCase().includes(q);
    const plantillas = Object.values(snapshot?.recetas ?? {}).filter(
      (r) => !r.archivado && r.componentes.length > 0 && coincide(r.nombre),
    );
    const grupos = new Map<string, InsumoSnapshot[]>();
    for (const insumo of Object.values(snapshot?.insumos ?? {})) {
      if (insumo.archivado || !coincide(insumo.nombre)) continue;
      const categoria = insumo.categoria || "Otros";
      grupos.set(categoria, [...(grupos.get(categoria) ?? []), insumo]);
    }
    for (const lista of grupos.values()) lista.sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
    return { plantillas, grupos: [...grupos.entries()].sort(([a], [b]) => a.localeCompare(b, "es")) };
  }, [snapshot, busqueda]);

  const item = (arrastre: Arrastre, nombre: string, detalle: string, plantilla = false) => (
    <div
      key={`${arrastre.tipo}-${arrastre.id}`}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData(TIPO_ARRASTRE, JSON.stringify(arrastre));
        e.dataTransfer.effectAllowed = "copy";
      }}
      className={cn(
        "flex cursor-grab items-center gap-2 rounded-md border bg-card px-2 py-1.5 text-xs hover:border-primary",
        plantilla && "border-l-[3px] border-l-turquesa",
      )}
    >
      <GripVertical className="size-3.5 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <p className="font-medium">{nombre}</p>
        <p className="text-muted-foreground">{detalle}</p>
      </div>
      <button
        type="button"
        onClick={() => alAgregar(arrastre)}
        title="Agregar al concepto elegido"
        aria-label={`Agregar ${nombre} al concepto elegido`}
        className="rounded p-1 hover:bg-muted"
      >
        <Plus className="size-4" />
      </button>
    </div>
  );

  return (
    <aside className="space-y-3 xl:sticky xl:top-6 xl:self-start">
      <Card>
        <CardContent className="space-y-3 pt-5">
          <div>
            <h3 className="text-sm font-medium">Catálogo</h3>
            <p className="text-xs text-muted-foreground">
              Arrastra a la columna Insumos, o elige un concepto y presiona +.
              {filaElegida !== null && (
                <>
                  {" "}
                  Concepto elegido: <span className="font-medium text-foreground">{filaElegida || "sin nombre"}</span>.
                </>
              )}
            </p>
          </div>
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
            <Input
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar insumo o plantilla"
              aria-label="Buscar en el catálogo"
              className="h-9 pl-8"
            />
          </div>
          {!snapshot && <p className="text-xs text-muted-foreground">Cargando catálogo…</p>}
          <div className="max-h-[32rem] space-y-1.5 overflow-y-auto pr-1">
            {plantillas.length > 0 && (
              <>
                <p className="pt-1 text-[11px] uppercase tracking-wide text-muted-foreground">Plantillas</p>
                {plantillas.map((r) =>
                  item({ tipo: "plantilla", id: r.id }, r.nombre, `${r.componentes.length} insumos`, true),
                )}
              </>
            )}
            {grupos.map(([categoria, lista]) => (
              <div key={categoria} className="space-y-1.5">
                <p className="pt-2 text-[11px] uppercase tracking-wide text-muted-foreground">{categoria}</p>
                {lista.map((insumo) =>
                  item(
                    { tipo: "insumo", id: insumo.id },
                    insumo.nombre,
                    insumo.costo == null
                      ? "Sin costo capturado"
                      : `${formatoMoneda(insumo.costo)} por ${UNIDAD_CORTA[insumo.unidadCosto ?? ""] ?? "unidad"}`,
                  ),
                )}
              </div>
            ))}
            {snapshot && plantillas.length === 0 && grupos.length === 0 && (
              <p className="text-xs text-muted-foreground">Nada coincide con “{busqueda}”.</p>
            )}
          </div>
        </CardContent>
      </Card>
    </aside>
  );
}
