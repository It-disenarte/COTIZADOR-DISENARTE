"use client";

import { ClipboardPaste, Copy, GripVertical, Plus, Search, Trash2, X } from "lucide-react";
import { useMemo, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { Button, Card, CardContent, Input, Textarea } from "@/components/ui";
import type { ModoComponente } from "@/lib/catalogo/constantes";
import {
  type BorradorCotizacion,
  filaNueva,
  agregarLevantamientoLeido,
  filasDesdeTsv,
  num,
  opcionNueva,
  txt,
} from "@/lib/cotizador/estado";
import { formatoMoneda } from "@/lib/formato";
import {
  type ComponenteConcepto,
  type ConsumoInsumo,
  consumoDeInsumo,
  costoDeConcepto,
  ErrorMotor,
  type FilaConId,
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
  /** Lugar en la columna derecha del asistente (debajo del precio en vivo) donde va el catálogo. */
  ranuraCatalogo?: HTMLElement | null;
};

// Desde "lg" existe la columna derecha del asistente; debajo de eso, todo va en una sola columna.
const CONSULTA_PANTALLA_GRANDE = "(min-width: 1024px)";

function usePantallaGrande(): boolean {
  return useSyncExternalStore(
    (avisar) => {
      const consulta = window.matchMedia(CONSULTA_PANTALLA_GRANDE);
      consulta.addEventListener("change", avisar);
      return () => consulta.removeEventListener("change", avisar);
    },
    () => window.matchMedia(CONSULTA_PANTALLA_GRANDE).matches,
    () => false,
  );
}

const sinClave = <T,>(objeto: Record<string, T>, clave: string): Record<string, T> =>
  Object.fromEntries(Object.entries(objeto).filter(([k]) => k !== clave));

/** Lo que se arrastra del catálogo: el id de un insumo. */
type Arrastre = { tipo: "insumo"; id: string };
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

export function PasoLevantamiento({ borrador, cambiar, snapshot, ranuraCatalogo }: Props) {
  const pantallaGrande = usePantallaGrande();
  const { filas } = borrador.entrada.levantamiento;
  const opciones = borrador.entrada.opciones;
  const [indiceOpcion, setIndiceOpcion] = useState(0);
  const activa = Math.min(indiceOpcion, Math.max(opciones.length - 1, 0));
  const opcion = opciones[activa];
  const [filaElegida, setFilaElegida] = useState<string | null>(filas[0]?.id ?? null);
  const [pegado, setPegado] = useState<string | null>(null);
  const [filaEncima, setFilaEncima] = useState<string | null>(null);
  const [opcionPorQuitar, setOpcionPorQuitar] = useState<string | null>(null);

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
    const insumo = snapshot?.insumos[arrastre.id];
    if (!insumo) return;
    // Por defecto la cantidad es automática (según las medidas); se puede cambiar a "total a mano".
    editarMateriales(filaId, (lista) => [...lista, { insumoId: insumo.id, modo: modoInicial(insumo), cantidad: "1" }]);
    setFilaElegida(filaId);
  }

  /** Copia los insumos de un concepto a los conceptos que todavía no tienen. */
  function usarEnVacios(filaId: string) {
    const origen = opcion?.materiales[filaId] ?? [];
    editarOpcionActiva((o) => {
      const materiales = { ...o.materiales };
      const descripciones = { ...(o.descripciones ?? {}) };
      const descripcion = o.descripciones?.[filaId];
      for (const f of filas) {
        if (f.id === filaId || materiales[f.id]?.length) continue;
        materiales[f.id] = origen.map((c) => ({ ...c }));
        if (descripcion && !descripciones[f.id]) descripciones[f.id] = descripcion;
      }
      return { ...o, materiales, descripciones };
    });
  }

  function quitarFila(id: string) {
    editarEntrada((e) => ({
      ...e,
      levantamiento: { ...e.levantamiento, filas: e.levantamiento.filas.filter((f) => f.id !== id) },
      // Sus insumos y su precio manual se van con él, en todas las opciones.
      opciones: e.opciones.map((o) => ({
        ...o,
        materiales: sinClave(o.materiales, id),
        preciosManuales: sinClave(o.preciosManuales ?? {}, id),
        descripciones: sinClave(o.descripciones ?? {}, id),
      })),
    }));
  }

  function quitarOpcion(id: string) {
    const indice = opciones.findIndex((o) => o.id === id);
    editarEntrada((e) => ({ ...e, opciones: e.opciones.filter((o) => o.id !== id) }));
    setOpcionPorQuitar(null);
    if (indice !== -1 && indice <= activa) setIndiceOpcion(Math.max(activa - 1, 0));
  }

  function agregarOpcion() {
    // La opción nueva parte de la actual: solo se cambia lo que sea distinto.
    const base = opcion;
    const nueva = opcionNueva(opciones.length + 1);
    if (base) {
      nueva.materiales = JSON.parse(JSON.stringify(base.materiales));
      nueva.descripciones = { ...(base.descripciones ?? {}) };
    }
    editarEntrada((e) => ({ ...e, opciones: [...e.opciones, nueva] }));
    setIndiceOpcion(opciones.length);
  }

  const panel = (
    <PanelCatalogo
      snapshot={snapshot}
      enColumna={pantallaGrande && !!ranuraCatalogo}
      filaElegida={filas.find((f) => f.id === filaElegida)?.concepto ?? null}
      alAgregar={(arrastre) => {
        const destino = filaElegida && filas.some((f) => f.id === filaElegida) ? filaElegida : filas[0]?.id;
        if (destino) agregarDelCatalogo(arrastre, destino);
      }}
    />
  );

  const totalPiezas = filas.reduce<number>((t, f) => t + f.cantidades.reduce<number>((s, c) => s + num(c), 0), 0);
  const totalM2 = filas.reduce(
    (t, f) => t + f.cantidades.reduce<number>((s, c) => s + num(c), 0) * num(f.anchoM) * num(f.altoM),
    0,
  );

  return (
    <div className="space-y-4">
      <div className="min-w-0 space-y-4">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            {opciones.map((o, i) =>
              opcionPorQuitar === o.id ? (
                <span
                  key={o.id}
                  className="inline-flex items-center gap-1 rounded-full border border-destructive/40 bg-destructive/5 py-1 pl-3 pr-1 text-sm"
                >
                  ¿Quitar “{o.nombre || `Opción ${i + 1}`}” y sus insumos?
                  <button
                    type="button"
                    onClick={() => quitarOpcion(o.id)}
                    className="rounded-full px-2 py-0.5 font-medium text-destructive hover:bg-destructive/10"
                  >
                    Sí, quitar
                  </button>
                  <button type="button" onClick={() => setOpcionPorQuitar(null)} className="rounded-full px-2 py-0.5 hover:bg-muted">
                    No
                  </button>
                </span>
              ) : (
                <span
                  key={o.id}
                  className={cn(
                    "inline-flex items-center rounded-full border text-sm transition-colors",
                    i === activa ? "border-primary bg-primary/10 font-medium text-primary" : "bg-card hover:bg-muted",
                  )}
                >
                  <button type="button" onClick={() => setIndiceOpcion(i)} className={cn("py-1.5 pl-4", opciones.length > 1 ? "pr-1" : "pr-4")}>
                    {o.nombre || `Opción ${i + 1}`}
                  </button>
                  {opciones.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setOpcionPorQuitar(o.id)}
                      title="Quitar esta opción"
                      aria-label={`Quitar ${o.nombre || `la opción ${i + 1}`}`}
                      className="mr-1 rounded-full p-1 hover:bg-destructive/10 hover:text-destructive"
                    >
                      <X className="size-3.5" />
                    </button>
                  )}
                </span>
              ),
            )}
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
            nombre y su foto se capturan en el paso siguiente. Si agregaste una de más, quítala con la ×.
          </p>
        </div>

        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-2 py-2 font-medium">Concepto</th>
                  <th className="px-2 py-2 font-medium">Ancho (m)</th>
                  <th className="px-2 py-2 font-medium">Alto (m)</th>
                  <th className="px-2 py-2 font-medium">Cantidad</th>
                  <th className="px-2 py-2 font-medium">Insumos {opciones.length > 1 && `· ${opcion?.nombre ?? ""}`}</th>
                  <th className="px-2 py-2 text-right font-medium">Costo</th>
                  <th className="px-2 py-2" />
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
                      <td className="px-2 py-2">
                        <Input
                          className="h-9 min-w-36"
                          value={fila.concepto}
                          onChange={(e) => editarFila(fila.id, { concepto: e.target.value })}
                          aria-label={`Concepto de la fila ${i + 1}`}
                        />
                      </td>
                      <td className="px-2 py-2">
                        <Input
                          className="h-9 w-[4.5rem]"
                          inputMode="decimal"
                          value={txt(fila.anchoM)}
                          onChange={(e) => editarFila(fila.id, { anchoM: e.target.value })}
                          aria-label={`Ancho de la fila ${i + 1}`}
                        />
                      </td>
                      <td className="px-2 py-2">
                        <Input
                          className="h-9 w-[4.5rem]"
                          inputMode="decimal"
                          value={txt(fila.altoM)}
                          onChange={(e) => editarFila(fila.id, { altoM: e.target.value })}
                          aria-label={`Alto de la fila ${i + 1}`}
                        />
                      </td>
                      <td className="px-2 py-2">
                        <Input
                          className="h-9 w-[4.5rem]"
                          inputMode="numeric"
                          value={txt(fila.cantidades[0])}
                          onChange={(e) => editarFila(fila.id, { cantidades: [e.target.value] })}
                          aria-label={`Cantidad de la fila ${i + 1}`}
                        />
                      </td>
                      <td className="px-2 py-2">
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
                            "flex min-h-11 min-w-56 flex-wrap items-start gap-1.5 rounded-md border-[1.5px] border-dashed border-input p-1.5 transition-colors",
                            filaEncima === fila.id && "border-accent bg-accent/10",
                          )}
                        >
                          {componentes.length === 0 && (
                            <span className="px-1 py-1 text-xs text-muted-foreground">
                              Arrastra aquí los insumos de este concepto
                            </span>
                          )}
                          {componentes.map((c, k) => (
                            <ChipInsumo
                              key={`${c.insumoId}-${k}`}
                              componente={c}
                              fila={fila}
                              snapshot={snapshot}
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
                        {componentes.length > 0 && snapshot && (
                          <DescripcionConcepto
                            valor={txt(opcion?.descripciones?.[fila.id])}
                            automatica={componentes.flatMap((c) => {
                              const insumo = snapshot.insumos[c.insumoId];
                              return insumo ? [insumo.nombreCliente?.trim() || insumo.nombre] : [];
                            })}
                            alCambiar={(valor) =>
                              editarOpcionActiva((o) => ({ ...o, descripciones: { ...(o.descripciones ?? {}), [fila.id]: valor } }))
                            }
                          />
                        )}
                      </td>
                      <td className="whitespace-nowrap px-2 py-2 text-right">
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
                  <td className="px-2 py-2" colSpan={5}>
                    Total
                  </td>
                  <td className="whitespace-nowrap px-2 py-2 text-right">
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
                const fila = filaNueva();
                editarLevantamiento({ filas: [...filas, fila] });
                setFilaElegida(fila.id);
              }}
            >
              <Plus /> Agregar concepto
            </Button>
            <Button type="button" variant="outline" onClick={() => setPegado(pegado === null ? "" : null)}>
              <ClipboardPaste /> Pegar de Excel
            </Button>
            <ImportarLevantamiento
              alAplicar={(leido, modo) =>
                // Si el documento reparte por áreas, cada área entra como concepto propio.
                editarLevantamiento(agregarLevantamientoLeido(borrador.entrada.levantamiento, leido, modo))
              }
            />
          </div>
          <p className="px-3 pb-3 text-xs text-muted-foreground">
            Si algo va en varias áreas o ubicaciones, captura un concepto por cada una. La cantidad de cada insumo se
            calcula sola con las medidas; si necesitas otra (desperdicio, ambas caras), presiona “Escribir otra
            cantidad”. Si el material se cobra por pieza, deja ancho y alto en 0. Para rotulación, escribe en el
            insumo los metros por pieza que salen del escaneo.
          </p>
        </Card>

        {opcion && snapshot && <ResumenInsumos opcion={opcion} filas={filas} snapshot={snapshot} />}

        {pegado !== null && (
          <Card>
            <CardContent className="space-y-2 pt-6">
              <Textarea
                value={pegado}
                onChange={(e) => setPegado(e.target.value)}
                placeholder={"Concepto\tAncho\tAlto\tCantidad"}
                className="min-h-28 font-mono text-xs"
              />
              <p className="text-xs text-muted-foreground">
                Reemplaza la tabla. Los insumos se vuelven a asignar después, porque los conceptos son nuevos.
              </p>
              <Button
                type="button"
                size="sm"
                onClick={() => {
                  const nuevas = filasDesdeTsv(pegado);
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

      {/* En pantalla grande el catálogo va en la columna derecha, para que la tabla use todo el ancho;
          en celular o tablet se queda aquí, junto a la tabla, para no tener que bajar a buscarlo. */}
      {pantallaGrande && ranuraCatalogo ? createPortal(panel, ranuraCatalogo) : panel}
    </div>
  );
}

/** Unidad de la cantidad escrita a mano: como se compra el insumo (tarjetas: por pieza). */
const UNIDAD_TOTAL: Record<string, string> = {
  m2: "m²",
  ml: "ml",
  lamina: "láminas",
  pieza: "piezas",
  minuto: "min",
  ciento: "piezas",
  millar: "piezas",
  persona: "personas",
};

const numeroCorto = (valor: number) => valor.toLocaleString("es-MX", { maximumFractionDigits: 2 });

/**
 * Un insumo dentro de un concepto, dicho en palabras: cuánto se usa y cuánto cuesta.
 * - Por medidas (lo normal en materiales por m²): no hay nada que llenar; se ve de dónde sale.
 * - Rotulación: pide los metros por pieza que salen del escaneo.
 * - Por pieza: pide cuántos lleva cada pieza.
 * - "Escribir otra cantidad" pasa a una cantidad total escrita a mano (queda marcada como tal,
 *   para que quien autoriza vea que no salió de las medidas); se puede volver al cálculo.
 */
function ChipInsumo({
  componente,
  fila,
  snapshot,
  nombre,
  alCambiar,
  alQuitar,
}: {
  componente: ComponenteConcepto;
  fila: FilaConId;
  snapshot: Snapshot | null;
  nombre: string;
  alCambiar: (cambios: Partial<ComponenteConcepto>) => void;
  alQuitar: () => void;
}) {
  const insumo = snapshot?.insumos[componente.insumoId];
  let consumo: ConsumoInsumo | null = null;
  let error: string | null = null;
  if (snapshot) {
    try {
      consumo = consumoDeInsumo(componente, fila, snapshot);
    } catch (e) {
      error = e instanceof ErrorMotor ? e.message : "Revisa la cantidad.";
    }
  }

  const piezas = fila.cantidades.reduce<number>((s, c) => s + num(c), 0);
  const ancho = num(fila.anchoM);
  const alto = num(fila.altoM);
  const veces = num(componente.cantidad);
  const textoPiezas = `${numeroCorto(piezas)} pieza${piezas === 1 ? "" : "s"}`;
  const unidadManual = consumo?.unidad ?? UNIDAD_TOTAL[insumo?.unidadCosto ?? ""] ?? "unidades";

  const escribirAMano = () =>
    alCambiar({ modo: "fijo", cantidad: consumo ? String(Number(consumo.cantidad.toFixed(2))) : "" });
  const volverACalcular = () => alCambiar({ modo: insumo ? modoInicial(insumo) : "por_m2", cantidad: "1" });

  const campo = (etiqueta: string) => (
    <input
      inputMode="decimal"
      value={txt(componente.cantidad)}
      onChange={(e) => alCambiar({ cantidad: e.target.value })}
      aria-label={etiqueta}
      className="h-6 w-16 rounded border border-input bg-card px-1 text-foreground"
    />
  );

  return (
    <div className="grid gap-1 rounded-md bg-primary/10 py-1.5 pl-2 pr-1 text-xs text-primary">
      <div className="flex items-center justify-between gap-1">
        <span className="font-medium">{nombre}</span>
        <button type="button" onClick={alQuitar} aria-label={`Quitar ${nombre}`} className="rounded p-0.5 hover:bg-primary/15">
          <X className="size-3.5" />
        </button>
      </div>

      {componente.modo === "por_m2" && (
        <div className="text-foreground">
          {consumo && (
            <p>
              Se usan <strong>{numeroCorto(consumo.cantidad.toNumber())} {consumo.unidad}</strong>
            </p>
          )}
          {ancho > 0 && alto > 0 ? (
            <p className="text-muted-foreground">
              calculado: {numeroCorto(ancho)} × {numeroCorto(alto)} m × {textoPiezas}
              {veces !== 1 && ` × ${numeroCorto(veces)}`}
              {consumo && consumo.unidad !== "m²" && ` = ${numeroCorto(ancho * alto * piezas * veces)} m²`}
            </p>
          ) : (
            <p className="text-muted-foreground">El concepto no tiene medidas: escribe la cantidad a mano.</p>
          )}
        </div>
      )}

      {componente.modo === "por_ml" && (
        <div className="space-y-0.5 text-foreground">
          <label className="flex flex-wrap items-center gap-1">
            Metros por pieza (del escaneo): {campo(`Metros por pieza de ${nombre}`)}
          </label>
          {consumo && (
            <p>
              Se usan <strong>{numeroCorto(consumo.cantidad.toNumber())} m</strong>{" "}
              <span className="text-muted-foreground">({textoPiezas})</span>
            </p>
          )}
        </div>
      )}

      {componente.modo === "por_pieza" && (
        <div className="space-y-0.5 text-foreground">
          <label className="flex flex-wrap items-center gap-1">
            ¿Cuántos lleva cada pieza? {campo(`Cuántos ${nombre} lleva cada pieza`)}
          </label>
          {consumo && (
            <p>
              Se usan <strong>{numeroCorto(consumo.cantidad.toNumber())} {consumo.unidad}</strong>{" "}
              <span className="text-muted-foreground">({textoPiezas})</span>
            </p>
          )}
        </div>
      )}

      {componente.modo === "fijo" && (
        <label className="flex flex-wrap items-center gap-1 text-foreground">
          Se usan {campo(`Cantidad total de ${nombre}`)} {unidadManual}
          <span className="text-muted-foreground">(escrito a mano)</span>
        </label>
      )}

      {consumo && (
        <p className="text-foreground">
          Costo: <strong>{formatoMoneda(consumo.costo.toFixed(2))}</strong>
        </p>
      )}
      {error && <p className="max-w-60 text-destructive">{error}</p>}

      <button
        type="button"
        onClick={componente.modo === "fijo" ? volverACalcular : escribirAMano}
        className="justify-self-start text-[11px] underline underline-offset-2 hover:text-foreground"
      >
        {componente.modo === "fijo" ? "Volver a calcularlo" : "Escribir otra cantidad"}
      </button>
    </div>
  );
}

/**
 * Lo que dice el PDF debajo del concepto ("Descripción:" con viñetas). Vacío = el nombre para el
 * cliente de cada insumo, que se muestra de ejemplo; si se escribe algo, sale eso.
 */
function DescripcionConcepto({
  valor,
  automatica,
  alCambiar,
}: {
  valor: string;
  automatica: string[];
  alCambiar: (valor: string) => void;
}) {
  const [abierta, setAbierta] = useState(valor.trim() !== "");
  const vinetas = [...new Set(automatica)];

  if (!abierta) {
    return (
      <div className="mt-1 text-xs text-muted-foreground">
        <p>En el PDF: {vinetas.join(" · ")}</p>
        <button type="button" onClick={() => setAbierta(true)} className="underline underline-offset-2 hover:text-foreground">
          Escribir la descripción para el cliente
        </button>
      </div>
    );
  }
  return (
    <div className="mt-1 space-y-1">
      <Textarea
        value={valor}
        onChange={(e) => alCambiar(e.target.value)}
        placeholder={vinetas.join("\n")}
        aria-label="Descripción para el PDF"
        className="min-h-20 text-xs"
      />
      <p className="text-xs text-muted-foreground">
        Una viñeta por renglón; así sale en el PDF, sin cantidades ni costos. Vacía = los nombres de los insumos
        (los de ejemplo).{" "}
        {valor.trim() === "" && (
          <button type="button" onClick={() => setAbierta(false)} className="underline underline-offset-2 hover:text-foreground">
            Cerrar
          </button>
        )}
      </p>
    </div>
  );
}

/**
 * Suma de cada insumo en todos los conceptos de la opción: cuánto se usa en total y cuánto
 * cuesta. Es interno (sirve también como lista de compra); en el PDF nunca salen costos.
 */
function ResumenInsumos({ opcion, filas, snapshot }: { opcion: OpcionCotizacion; filas: FilaConId[]; snapshot: Snapshot }) {
  const totales = new Map<string, { cantidad: number; unidad: string; costo: number }>();
  for (const fila of filas) {
    for (const componente of opcion.materiales[fila.id] ?? []) {
      try {
        const consumo = consumoDeInsumo(componente, fila, snapshot);
        const actual = totales.get(consumo.insumoId) ?? { cantidad: 0, unidad: consumo.unidad, costo: 0 };
        totales.set(consumo.insumoId, {
          cantidad: actual.cantidad + consumo.cantidad.toNumber(),
          unidad: actual.unidad,
          costo: actual.costo + consumo.costo.toNumber(),
        });
      } catch {
        // El insumo con datos incompletos ya muestra su aviso en la tabla.
      }
    }
  }
  if (totales.size === 0) return null;

  const renglones = [...totales.entries()]
    .map(([id, t]) => ({ id, nombre: snapshot.insumos[id]?.nombre ?? "Insumo", ...t }))
    .sort((a, b) => b.costo - a.costo);
  const total = renglones.reduce((s, r) => s + r.costo, 0);

  return (
    <Card className="overflow-hidden">
      <div className="px-4 pt-4">
        <h3 className="text-sm font-medium">Insumos de {opcion.nombre || "la opción"}</h3>
        <p className="text-xs text-muted-foreground">
          La suma de cada insumo en todos los conceptos, en la unidad en que se compra. Sirve también como lista de
          compra. Es solo para uso interno: el PDF nunca muestra costos.
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="mt-3 w-full text-sm">
          <thead className="bg-muted/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-2 font-medium">Insumo</th>
              <th className="px-4 py-2 text-right font-medium">Total</th>
              <th className="px-4 py-2 text-right font-medium">Costo</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {renglones.map((r) => (
              <tr key={r.id}>
                <td className="px-4 py-2">{r.nombre}</td>
                <td className="whitespace-nowrap px-4 py-2 text-right">
                  {numeroCorto(r.cantidad)} {r.unidad}
                  {r.unidad === "láminas" && r.cantidad % 1 > 0 && (
                    <span className="block text-xs text-muted-foreground">se compran {Math.ceil(r.cantidad)}</span>
                  )}
                </td>
                <td className="whitespace-nowrap px-4 py-2 text-right">{formatoMoneda(r.costo.toFixed(2))}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-muted/40 font-medium">
            <tr>
              <td className="px-4 py-2" colSpan={2}>
                Total de materiales
              </td>
              <td className="whitespace-nowrap px-4 py-2 text-right">{formatoMoneda(total.toFixed(2))}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="px-4 py-2 text-xs text-muted-foreground">
        Sin consumibles ni operación: esos se suman en el precio (paso Resumen).
      </p>
    </Card>
  );
}

function PanelCatalogo({
  snapshot,
  enColumna,
  filaElegida,
  alAgregar,
}: {
  snapshot: Snapshot | null;
  /** En la columna derecha la lista se ajusta al alto de la pantalla, porque esa columna se queda fija. */
  enColumna: boolean;
  filaElegida: string | null;
  alAgregar: (arrastre: Arrastre) => void;
}) {
  const [busqueda, setBusqueda] = useState("");

  const grupos = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    const coincide = (texto: string) => texto.toLowerCase().includes(q);
    const grupos = new Map<string, InsumoSnapshot[]>();
    for (const insumo of Object.values(snapshot?.insumos ?? {})) {
      if (insumo.archivado || !coincide(insumo.nombre)) continue;
      const categoria = insumo.categoria || "Otros";
      grupos.set(categoria, [...(grupos.get(categoria) ?? []), insumo]);
    }
    for (const lista of grupos.values()) lista.sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
    return [...grupos.entries()].sort(([a], [b]) => a.localeCompare(b, "es"));
  }, [snapshot, busqueda]);

  const item = (arrastre: Arrastre, nombre: string, detalle: string) => (
    <div
      key={`${arrastre.tipo}-${arrastre.id}`}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData(TIPO_ARRASTRE, JSON.stringify(arrastre));
        e.dataTransfer.effectAllowed = "copy";
      }}
      className="flex cursor-grab items-center gap-2 rounded-md border bg-card px-2 py-1.5 text-xs hover:border-primary"
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
    <div className="space-y-3">
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
              placeholder="Buscar insumo"
              aria-label="Buscar en el catálogo"
              className="h-9 pl-8"
            />
          </div>
          {!snapshot && <p className="text-xs text-muted-foreground">Cargando catálogo…</p>}
          <div className={cn("space-y-1.5 overflow-y-auto pr-1", enColumna ? "max-h-[calc(100vh-26rem)] min-h-40" : "max-h-[32rem]")}>
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
            {snapshot && grupos.length === 0 && (
              <p className="text-xs text-muted-foreground">Nada coincide con “{busqueda}”.</p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
