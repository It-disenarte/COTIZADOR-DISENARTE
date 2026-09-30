"use client";

import { BookmarkPlus, Plus, Search, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { useAvisos } from "@/components/avisos";
import { PantallaCarga } from "@/components/pantalla-carga";
import { Button, Card, CardContent, Checkbox, Input, Label, Select, Textarea } from "@/components/ui";
import {
  CATEGORIAS_DIGITALES,
  COBROS_DIGITALES,
  ETIQUETA_COBRO_DIGITAL,
  ETIQUETA_MODALIDAD_WEB,
  MODALIDADES_WEB,
  type CobroDigital,
  type ModalidadWeb,
} from "@/lib/catalogo/constantes";
import { nuevoId, txt } from "@/lib/cotizador/estado";
import { type BorradorDigital, lineaDesdeServicio, lineaNueva, type ServicioCatalogo } from "@/lib/cotizador/estado-digital";
import { formatoMoneda } from "@/lib/formato";
import type { EntradaDigital, LineaDigital, PromocionDigital, ResultadoDigital } from "@/lib/motor";
import { llamarApi } from "@/lib/utils";
import { MensajesCliente } from "./mensajes-cliente";

type Props = {
  borrador: BorradorDigital;
  cambiar: (cambios: (b: BorradorDigital) => BorradorDigital) => void;
};

const editarEntrada = (cambiar: Props["cambiar"], transformar: (e: EntradaDigital) => EntradaDigital) =>
  cambiar((b) => ({ ...b, entrada: transformar(b.entrada) }));

/** Campo con su etiqueta y su ayuda debajo, como pide el dueño en cada casilla que pueda confundir. */
function Campo({
  id,
  etiqueta,
  ayuda,
  children,
}: {
  id: string;
  etiqueta: string;
  ayuda?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{etiqueta}</Label>
      {children}
      {ayuda && <p className="text-xs text-muted-foreground">{ayuda}</p>}
    </div>
  );
}

// Servicios ----------------------------------------------------------------------------------

export function PasoServicios({
  borrador,
  cambiar,
  servicios,
  puedeEditarCatalogo,
  recargarServicios,
}: Props & {
  servicios: ServicioCatalogo[] | null;
  puedeEditarCatalogo: boolean;
  recargarServicios: () => Promise<void>;
}) {
  const { lineas, modalidadWeb } = borrador.entrada;
  const hayPaquete = lineas.some((l) => l.cobro === "paquete");

  const editarLineas = (transformar: (l: LineaDigital[]) => LineaDigital[]) =>
    editarEntrada(cambiar, (e) => ({ ...e, lineas: transformar(e.lineas) }));
  const editarLinea = (id: string, cambios: Partial<LineaDigital>) =>
    editarLineas((ls) => ls.map((l) => (l.id === id ? { ...l, ...cambios } : l)));

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_18rem]">
      <div className="min-w-0 space-y-4">
        {hayPaquete && (
          <Card>
            <CardContent className="pt-6">
              <Campo
                id="modalidad-web"
                etiqueta="Cómo se ofrece la página web"
                ayuda="Renta: activación + mensualidad, con IVA incluido. Dueño: un solo precio más IVA, en anticipo y finiquito. Con las dos, el PDF muestra una página por cada forma para que el cliente elija."
              >
                <Select
                  id="modalidad-web"
                  value={modalidadWeb}
                  onChange={(e) => editarEntrada(cambiar, (en) => ({ ...en, modalidadWeb: e.target.value as ModalidadWeb }))}
                >
                  {MODALIDADES_WEB.map((m) => (
                    <option key={m} value={m}>
                      {ETIQUETA_MODALIDAD_WEB[m]}
                    </option>
                  ))}
                </Select>
              </Campo>
            </CardContent>
          </Card>
        )}

        {lineas.length === 0 && (
          <Card>
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              Agrega los servicios desde el catálogo de la derecha, o escribe uno a mano (por ejemplo, un módulo a la
              medida).
            </CardContent>
          </Card>
        )}

        {lineas.map((linea, i) => (
          <TarjetaLinea
            key={linea.id}
            linea={linea}
            numero={i + 1}
            puedeEditarCatalogo={puedeEditarCatalogo}
            alCambiar={(cambios) => editarLinea(linea.id, cambios)}
            alQuitar={() => editarLineas((ls) => ls.filter((l) => l.id !== linea.id))}
            alGuardarEnCatalogo={async (servicioId) => {
              editarLinea(linea.id, { servicioId });
              await recargarServicios();
            }}
          />
        ))}

        <Button type="button" variant="outline" onClick={() => editarLineas((ls) => [...ls, lineaNueva()])}>
          <Plus /> Servicio escrito a mano
        </Button>
        <p className="text-xs text-muted-foreground">
          Para una página a la medida, agrega un renglón por módulo, página o sección con su precio. Si lo vas a volver
          a usar, guárdalo en el catálogo desde su tarjeta.
        </p>
      </div>

      <CatalogoDigital
        servicios={servicios}
        alAgregar={(s) => editarLineas((ls) => [...ls, lineaDesdeServicio(s)])}
      />
    </div>
  );
}

function TarjetaLinea({
  linea,
  numero,
  puedeEditarCatalogo,
  alCambiar,
  alQuitar,
  alGuardarEnCatalogo,
}: {
  linea: LineaDigital;
  numero: number;
  puedeEditarCatalogo: boolean;
  alCambiar: (cambios: Partial<LineaDigital>) => void;
  alQuitar: () => void;
  alGuardarEnCatalogo: (servicioId: string) => Promise<void>;
}) {
  const avisar = useAvisos();
  const [categoria, setCategoria] = useState<string>("Web a la medida");
  const [guardando, setGuardando] = useState(false);
  const id = (campo: string) => `${campo}-${linea.id}`;
  const paquete = linea.cobro === "paquete";

  async function guardarEnCatalogo() {
    if (!linea.nombre.trim()) {
      avisar({ tipo: "error", texto: "Escribe el nombre del servicio antes de guardarlo en el catálogo." });
      return;
    }
    setGuardando(true);
    try {
      const { servicio } = await llamarApi<{ servicio: { id: string } }>("/api/servicios-digitales", "POST", {
        nombre: linea.nombre,
        categoria,
        cobro: linea.cobro,
        precio: txt(linea.precio),
        precioMensual: txt(linea.precioMensual),
        activacion: txt(linea.activacion),
        mesesRenta: txt(linea.mesesRenta) || "12",
        incluye: txt(linea.descripcion),
        tiempoEntrega: txt(linea.tiempoEntrega),
      });
      await alGuardarEnCatalogo(servicio.id);
      avisar({ tipo: "ok", texto: `"${linea.nombre}" quedó en el catálogo para futuros proyectos.` });
    } catch (e) {
      avisar({ tipo: "error", texto: e instanceof Error ? e.message : "No se pudo guardar en el catálogo." });
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Card>
      <CardContent className="space-y-4 pt-5">
        {guardando && <PantallaCarga mensaje="Guardando en el catálogo…" />}
        <div className="flex items-start justify-between gap-2">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Servicio {numero}</p>
          <Button type="button" variant="ghost" size="icon" title="Quitar servicio" onClick={alQuitar}>
            <Trash2 />
          </Button>
        </div>

        <div className="grid gap-4 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_6rem]">
          <Campo id={id("nombre")} etiqueta="Servicio" ayuda="Así sale en la propuesta.">
            <Input id={id("nombre")} value={linea.nombre} onChange={(e) => alCambiar({ nombre: e.target.value })} placeholder="Página a la medida" />
          </Campo>
          <Campo id={id("cobro")} etiqueta="Cómo se cobra">
            <Select id={id("cobro")} value={linea.cobro} onChange={(e) => alCambiar({ cobro: e.target.value as CobroDigital })}>
              {COBROS_DIGITALES.map((c) => (
                <option key={c} value={c}>
                  {ETIQUETA_COBRO_DIGITAL[c]}
                </option>
              ))}
            </Select>
          </Campo>
          <Campo id={id("cantidad")} etiqueta="Cantidad">
            <Input id={id("cantidad")} inputMode="decimal" value={txt(linea.cantidad)} onChange={(e) => alCambiar({ cantidad: e.target.value })} />
          </Campo>
        </div>

        {paquete ? (
          <div className="grid gap-4 md:grid-cols-4">
            <Campo id={id("precio")} etiqueta="Dueño: precio" ayuda="Sin IVA; se cobra en anticipo y finiquito.">
              <Input id={id("precio")} inputMode="decimal" value={txt(linea.precio)} onChange={(e) => alCambiar({ precio: e.target.value })} />
            </Campo>
            <Campo id={id("mensual")} etiqueta="Renta: mensualidad" ayuda="Con IVA incluido.">
              <Input id={id("mensual")} inputMode="decimal" value={txt(linea.precioMensual)} onChange={(e) => alCambiar({ precioMensual: e.target.value })} />
            </Campo>
            <Campo id={id("activacion")} etiqueta="Renta: activación" ayuda="Con IVA incluido.">
              <Input id={id("activacion")} inputMode="decimal" value={txt(linea.activacion)} onChange={(e) => alCambiar({ activacion: e.target.value })} />
            </Campo>
            <Campo id={id("meses")} etiqueta="Renta: meses">
              <Input id={id("meses")} inputMode="numeric" value={txt(linea.mesesRenta)} onChange={(e) => alCambiar({ mesesRenta: e.target.value })} />
            </Campo>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            <Campo
              id={id("precio")}
              etiqueta={linea.cobro === "mensual" ? "Precio al mes" : "Precio"}
              ayuda={txt(linea.precio) === "" ? "Precio por capturar: escríbelo para poder autorizar." : "Sin IVA: se suma aparte."}
            >
              <Input id={id("precio")} inputMode="decimal" value={txt(linea.precio)} onChange={(e) => alCambiar({ precio: e.target.value })} />
            </Campo>
            <Campo id={id("tiempo")} etiqueta="Tiempo de entrega" ayuda="Sale en la columna “Tiempo estimado” del PDF.">
              <Input id={id("tiempo")} value={txt(linea.tiempoEntrega)} onChange={(e) => alCambiar({ tiempoEntrega: e.target.value })} placeholder="5 días hábiles" />
            </Campo>
          </div>
        )}

        <Campo id={id("incluye")} etiqueta="Qué incluye" ayuda="Una viñeta por renglón. Sale en el PDF debajo del servicio; nunca salen costos.">
          <Textarea id={id("incluye")} value={txt(linea.descripcion)} onChange={(e) => alCambiar({ descripcion: e.target.value })} className="min-h-20 text-sm" />
        </Campo>

        {linea.servicioId === null && puedeEditarCatalogo && (
          <div className="flex flex-wrap items-end gap-2 rounded-md border border-dashed p-3">
            <Campo id={id("categoria")} etiqueta="Categoría en el catálogo">
              <Select id={id("categoria")} value={categoria} onChange={(e) => setCategoria(e.target.value)} className="h-9 w-56">
                {CATEGORIAS_DIGITALES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
            </Campo>
            <Button type="button" variant="outline" size="sm" onClick={guardarEnCatalogo} disabled={guardando}>
              <BookmarkPlus /> Guardar en el catálogo
            </Button>
            <p className="w-full text-xs text-muted-foreground">Queda disponible con este precio para futuros proyectos.</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function resumenPrecio(s: ServicioCatalogo): string {
  if (s.cobro === "paquete") {
    return s.precioMensual ? `${formatoMoneda(s.precioMensual)}/mes o ${formatoMoneda(s.precio)} dueño` : "Precio por capturar";
  }
  if (s.precio == null) return "Precio por capturar";
  return `${formatoMoneda(s.precio)}${s.cobro === "mensual" ? " al mes" : ""} + IVA`;
}

function CatalogoDigital({ servicios, alAgregar }: { servicios: ServicioCatalogo[] | null; alAgregar: (s: ServicioCatalogo) => void }) {
  const [busqueda, setBusqueda] = useState("");
  const grupos = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    const mapa = new Map<string, ServicioCatalogo[]>();
    for (const s of servicios ?? []) {
      if (s.archivado || !s.nombre.toLowerCase().includes(q)) continue;
      mapa.set(s.categoria, [...(mapa.get(s.categoria) ?? []), s]);
    }
    const orden = (c: string) => {
      const i = (CATEGORIAS_DIGITALES as readonly string[]).indexOf(c);
      return i === -1 ? 99 : i;
    };
    return [...mapa.entries()].sort(([a], [b]) => orden(a) - orden(b));
  }, [servicios, busqueda]);

  return (
    <aside className="space-y-3 xl:sticky xl:top-6 xl:self-start">
      <Card>
        <CardContent className="space-y-3 pt-5">
          <div>
            <h3 className="text-sm font-medium">Catálogo de servicios</h3>
            <p className="text-xs text-muted-foreground">Presiona + para agregarlo a la cotización con su precio de lista.</p>
          </div>
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
            <Input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar servicio" aria-label="Buscar servicio" className="h-9 pl-8" />
          </div>
          {!servicios && <p className="text-xs text-muted-foreground">Cargando catálogo…</p>}
          <div className="max-h-128 space-y-1.5 overflow-y-auto pr-1">
            {grupos.map(([categoria, lista]) => (
              <div key={categoria} className="space-y-1.5">
                <p className="pt-2 text-[11px] uppercase tracking-wide text-muted-foreground">{categoria}</p>
                {lista.map((s) => (
                  <div key={s.id} className="flex items-center gap-2 rounded-md border bg-card px-2 py-1.5 text-xs">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">{s.nombre}</p>
                      <p className={s.precio == null && !s.precioMensual ? "text-accent" : "text-muted-foreground"}>{resumenPrecio(s)}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => alAgregar(s)}
                      title="Agregar a la cotización"
                      aria-label={`Agregar ${s.nombre}`}
                      className="rounded p-1 hover:bg-muted"
                    >
                      <Plus className="size-4" />
                    </button>
                  </div>
                ))}
              </div>
            ))}
            {servicios && grupos.length === 0 && <p className="text-xs text-muted-foreground">Nada coincide con “{busqueda}”.</p>}
          </div>
        </CardContent>
      </Card>
    </aside>
  );
}

// Pago y promociones -------------------------------------------------------------------------

export function PasoPago({ borrador, cambiar }: Props) {
  const { entrada } = borrador;
  const editarPromocion = (id: string, cambios: Partial<PromocionDigital>) =>
    editarEntrada(cambiar, (e) => ({ ...e, promociones: e.promociones.map((p) => (p.id === id ? { ...p, ...cambios } : p)) }));

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="grid gap-4 pt-6 sm:grid-cols-3">
          <Campo
            id="anticipo"
            etiqueta="Anticipo (%)"
            ayuda="70 = 70% al iniciar y 30% al entregar. Aplica a los pagos únicos y a la modalidad dueño; la renta no lleva anticipo."
          >
            <Input
              id="anticipo"
              inputMode="decimal"
              value={txt(entrada.anticipoPct)}
              onChange={(e) => editarEntrada(cambiar, (en) => ({ ...en, anticipoPct: e.target.value }))}
            />
          </Campo>
          <Campo id="tiempo-general" etiqueta="Tiempo estimado general" ayuda="Se usa para los servicios que no traen su propio tiempo de entrega.">
            <Input
              id="tiempo-general"
              value={txt(entrada.tiempoEstimado)}
              onChange={(e) => editarEntrada(cambiar, (en) => ({ ...en, tiempoEstimado: e.target.value }))}
              placeholder="3 a 4 semanas"
            />
          </Campo>
          <Campo id="vigencia-digital" etiqueta="Vigencia (días)" ayuda="Días naturales que se sostiene el precio. Sale en el PDF.">
            <Input
              id="vigencia-digital"
              inputMode="numeric"
              value={txt(entrada.propuesta?.vigenciaDias)}
              onChange={(e) =>
                editarEntrada(cambiar, (en) => ({ ...en, propuesta: { ...en.propuesta, vigenciaDias: e.target.value } }))
              }
              placeholder="15"
            />
          </Campo>
        </CardContent>
      </Card>

      <div className="space-y-3">
        <div>
          <h3 className="font-medium">Promociones de contado</h3>
          <p className="text-sm text-muted-foreground">
            Se aplican a los pagos únicos (no a la renta). Activa las que quieras ofrecer y ajusta su descuento, lo que
            se regala y la fecha límite. Cada una sale en el PDF con su precio de contado.
          </p>
        </div>
        {entrada.promociones.map((p) => (
          <Card key={p.id} className={p.activa ? "border-primary/40" : ""}>
            <CardContent className="space-y-4 pt-5">
              <div className="flex items-center justify-between gap-2">
                <label className="flex items-center gap-2 text-sm font-medium">
                  <Checkbox checked={p.activa} onChange={(e) => editarPromocion(p.id, { activa: e.target.checked })} />
                  Ofrecer esta promoción
                </label>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  title="Quitar promoción"
                  onClick={() => editarEntrada(cambiar, (e) => ({ ...e, promociones: e.promociones.filter((x) => x.id !== p.id) }))}
                >
                  <Trash2 />
                </Button>
              </div>
              <div className="grid gap-4 md:grid-cols-[minmax(0,2fr)_7rem_minmax(0,2fr)_10rem]">
                <Campo id={`promo-nombre-${p.id}`} etiqueta="Nombre">
                  <Input id={`promo-nombre-${p.id}`} value={p.nombre} onChange={(e) => editarPromocion(p.id, { nombre: e.target.value })} />
                </Campo>
                <Campo id={`promo-pct-${p.id}`} etiqueta="Descuento (%)">
                  <Input id={`promo-pct-${p.id}`} inputMode="decimal" value={txt(p.descuentoPct)} onChange={(e) => editarPromocion(p.id, { descuentoPct: e.target.value })} />
                </Campo>
                <Campo id={`promo-regalo-${p.id}`} etiqueta="Se regala (opcional)">
                  <Input id={`promo-regalo-${p.id}`} value={txt(p.regalo)} onChange={(e) => editarPromocion(p.id, { regalo: e.target.value })} placeholder="Capacitación del proyecto" />
                </Campo>
                <Campo id={`promo-fecha-${p.id}`} etiqueta="Válida hasta">
                  <Input id={`promo-fecha-${p.id}`} type="date" value={txt(p.validaHasta)} onChange={(e) => editarPromocion(p.id, { validaHasta: e.target.value })} />
                </Campo>
              </div>
            </CardContent>
          </Card>
        ))}
        <Button
          type="button"
          variant="outline"
          onClick={() =>
            editarEntrada(cambiar, (e) => ({
              ...e,
              promociones: [...e.promociones, { id: nuevoId(), nombre: "Nueva promoción", descuentoPct: "", regalo: "", validaHasta: "", activa: true }],
            }))
          }
        >
          <Plus /> Agregar promoción
        </Button>
      </div>
    </div>
  );
}

// Resumen ------------------------------------------------------------------------------------

export function PasoResumenDigital({
  borrador,
  cambiar,
  resultado,
  autorizada,
}: Props & { resultado: ResultadoDigital | null; autorizada: boolean }) {
  const { entrada } = borrador;
  const editarPropuesta = (cambios: Partial<NonNullable<EntradaDigital["propuesta"]>>) =>
    editarEntrada(cambiar, (e) => ({ ...e, propuesta: { ...e.propuesta, ...cambios } }));
  const editarAlcance = (cambios: { concepto?: string; resumen?: string }) =>
    editarEntrada(cambiar, (e) => ({ ...e, alcance: { concepto: e.alcance?.concepto ?? "", resumen: e.alcance?.resumen ?? "", ...cambios } }));

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="space-y-4 pt-6">
          <h3 className="font-medium">Resumen de alcance</h3>
          <Campo id="concepto-digital" etiqueta="Concepto" ayuda="Frase corta de lo que se cotiza. Sale arriba de la tabla de precios.">
            <Input
              id="concepto-digital"
              value={txt(entrada.alcance?.concepto)}
              onChange={(e) => editarAlcance({ concepto: e.target.value })}
              placeholder="Página web corporativa con identidad de marca"
            />
          </Campo>
          <Campo id="resumen-digital" etiqueta="Resumen" ayuda="Unas líneas con lo que recibe el cliente. Si subiste el brief, la IA puede redactarlo.">
            <Textarea id="resumen-digital" value={txt(entrada.alcance?.resumen)} onChange={(e) => editarAlcance({ resumen: e.target.value })} className="min-h-24" />
          </Campo>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-4 pt-6">
          <h3 className="font-medium">Condiciones de la propuesta</h3>
          <Campo id="no-incluye-digital" etiqueta="Lo que no incluye" ayuda="Una viñeta por renglón. Previene reclamaciones: escribe lo que el cliente podría dar por hecho.">
            <Textarea id="no-incluye-digital" value={txt(entrada.propuesta?.noIncluye)} onChange={(e) => editarPropuesta({ noIncluye: e.target.value })} className="min-h-32" />
          </Campo>
          <Campo id="supuestos-digital" etiqueta="Supuestos" ayuda="Lo que se asume porque el cliente no lo confirmó (logo en alta calidad, permisos de fotos, textos pendientes).">
            <Textarea id="supuestos-digital" value={txt(entrada.propuesta?.supuestos)} onChange={(e) => editarPropuesta({ supuestos: e.target.value })} />
          </Campo>
        </CardContent>
      </Card>

      {resultado?.escenarios.map((e) => (
        <Card key={e.clave}>
          <CardContent className="space-y-3 pt-6 text-sm">
            <h3 className="font-medium">{e.etiqueta}</h3>
            {e.renta && (
              <div className="space-y-1">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Renta (IVA incluido)</p>
                {e.filasRenta.map((f, i) => (
                  <p key={i} className="flex justify-between gap-2">
                    <span>{f.concepto}</span>
                    <span>{formatoMoneda(f.subtotal)}/mes</span>
                  </p>
                ))}
                <p className="flex justify-between gap-2 text-muted-foreground">
                  <span>Activación</span>
                  <span>{formatoMoneda(e.renta.activacion)}</span>
                </p>
                <p className="flex justify-between gap-2 font-medium">
                  <span>Total del primer año</span>
                  <span>{formatoMoneda(e.renta.totalPrimerAno)}</span>
                </p>
              </div>
            )}
            {e.unico && (
              <div className="space-y-1">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Pagos únicos</p>
                {e.filasUnicas.map((f, i) => (
                  <p key={i} className="flex justify-between gap-2">
                    <span>
                      {f.cantidad} × {f.concepto}
                    </span>
                    <span>{formatoMoneda(f.subtotal)}</span>
                  </p>
                ))}
                <p className="flex justify-between gap-2 text-muted-foreground">
                  <span>IVA</span>
                  <span>{formatoMoneda(e.unico.iva)}</span>
                </p>
                <p className="flex justify-between gap-2 font-medium">
                  <span>Total</span>
                  <span>{formatoMoneda(e.unico.total)}</span>
                </p>
                <p className="text-xs text-muted-foreground">
                  Anticipo {e.unico.anticipoPct}%: {formatoMoneda(e.unico.anticipo)} · Finiquito: {formatoMoneda(e.unico.finiquito)}
                </p>
                {e.unico.promociones.map((p, i) => (
                  <p key={i} className="text-xs text-primary">
                    {p.nombre}: {formatoMoneda(p.total)} de contado{p.regalo ? ` + ${p.regalo}` : ""}
                  </p>
                ))}
              </div>
            )}
            {e.mensual && (
              <p className="flex justify-between gap-2">
                <span>Servicios mensuales (con IVA)</span>
                <span>{formatoMoneda(e.mensual.total)}/mes</span>
              </p>
            )}
          </CardContent>
        </Card>
      ))}

      <MensajesCliente cotizacionId={borrador.id} autorizada={autorizada} telefono={borrador.cliente.telefono} />
    </div>
  );
}
