"use client";

import { Check, ChevronLeft, ChevronRight, FileDown, Loader2, Save, ShieldCheck, TriangleAlert } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useAvisos } from "@/components/avisos";
import { Modal } from "@/components/modal";
import { PantallaCarga } from "@/components/pantalla-carga";
import { Aviso, Button, Card, CardContent } from "@/components/ui";
import { type BorradorCotizacion, borradorInicial, cuerpoParaGuardar, opcionNueva } from "@/lib/cotizador/estado";
import { idFila, revisarCaptura } from "@/lib/cotizador/revision";
import { useGuardadoCotizacion } from "./use-guardado";
import {
  PASO,
  PASO_RAPIDA,
  PASOS,
  PASOS_RAPIDA,
  type Pendiente,
  pasoDeAlerta,
  pasoDeErrorMotor,
  pasoDeRapida,
  QUE_HACER_ALERTA,
} from "@/lib/cotizador/pasos";
import { formatoMoneda } from "@/lib/formato";
import { calcular, type Desglose, type EntradaCotizacion, ErrorMotor, type ResultadoCotizacion, type Snapshot, repartirFilasPorOpcion } from "@/lib/motor";
import { cn, llamarApi } from "@/lib/utils";
import { problemaDeEntrada } from "@/lib/validacion/cotizacion";
import { PasoLevantamiento } from "./paso-levantamiento";
import { PasoOpciones } from "./paso-opciones";
import { type ClienteOpcion, PasoDatos } from "./pasos-captura";
import { PasoOperacion, PasoResumen, PasoReventa } from "./pasos-cierre";
import { PasoTiempoRapida } from "./paso-rapida";

type Props = {
  usuarioId: string;
  vendedores: { id: string; nombre: string }[];
  puedeElegirVendedor: boolean;
  clientes: ClienteOpcion[];
  inicial?: BorradorCotizacion;
  /** Quien puede autorizar el análisis de costos (PNO-COM-01, Fase 1). */
  puedeAutorizar: boolean;
  /** Quien edita el catálogo puede crear o corregir insumos desde el paso 2. */
  puedeEditarCatalogo?: boolean;
  /** Fecha de autorización del análisis; null mientras no se autoriza. */
  autorizada?: string | null;
};

export function AsistenteCotizacion({
  usuarioId,
  vendedores,
  puedeElegirVendedor,
  clientes,
  inicial,
  puedeAutorizar,
  puedeEditarCatalogo = false,
  autorizada = null,
}: Props) {
  const router = useRouter();
  const [autorizadaEn, setAutorizadaEn] = useState<string | null>(autorizada);
  const { borrador, cambiar, guardar, guardarPendiente, guardando, guardadoEn, autoguardado } = useGuardadoCotizacion({
    inicial: () => {
      const base = inicial ?? borradorInicial(usuarioId);
      // Siempre hay al menos una opción, para que la tabla del levantamiento reciba insumos.
      const entrada = base.entrada.opciones.length ? base.entrada : { ...base.entrada, opciones: [opcionNueva(1)] };
      // Cada concepto queda con su opción desde el principio.
      return { ...base, entrada: repartirFilasPorOpcion(entrada) };
    },
    cuerpo: cuerpoParaGuardar,
    // Al editar, la autorización anterior deja de valer: el servidor la borra al guardar.
    alEditar: () => setAutorizadaEn(null),
  });
  const [paso, setPaso] = useState(0);
  /** Opción que se está viendo en el levantamiento; vive aquí para poder ir a la casilla de cualquier opción. */
  const [indiceOpcion, setIndiceOpcion] = useState(0);
  /** Cuadro que dice qué falta; `continuar` existe cuando se llegó con "Siguiente". */
  const [falta, setFalta] = useState<{ pendiente: Pendiente; continuar?: () => void } | null>(null);
  // Cotización rápida: menos pasos y una sola variable (las horas de desarrollo). Se reconoce por la propia entrada.
  const rapida = !!borrador.entrada.rapida;
  const pasos: readonly string[] = rapida ? PASOS_RAPIDA : PASOS;
  const ultimoPaso = pasos.length - 1;
  /** Lleva un número de paso del asistente completo (el que usan los errores y alertas) al paso que se ve. */
  const pasoVisible = (completo: number) => (rapida ? pasoDeRapida(completo) : completo);
  const clave = (rapida ? ["datos", "cotizacion"] : ["datos", "levantamiento", "opciones", "operacion", "reventa", "resumen"])[paso];
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  /** Qué se está haciendo en el servidor, para la pantalla de carga (null = nada). */
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [ranuraCatalogo, setRanuraCatalogo] = useState<HTMLDivElement | null>(null);
  const avisar = useAvisos();
  const [alertasConfirmadas, setAlertasConfirmadas] = useState(false);

  /** Vuelve a descargar el catálogo: tras crear o editar un insumo, los precios se recalculan solos. */
  async function recargarCatalogo() {
    try {
      const datos = await llamarApi<{ snapshot: Snapshot }>("/api/catalogo/snapshot", "GET");
      setSnapshot(datos.snapshot);
    } catch {
      avisar({ tipo: "error", texto: "No se pudo actualizar el catálogo. Recarga la página." });
    }
  }

  // El catálogo se descarga una vez y el precio se recalcula aquí mismo, sin ir al servidor.
  useEffect(() => {
    llamarApi<{ snapshot: Snapshot }>("/api/catalogo/snapshot", "GET")
      .then((datos) => setSnapshot(datos.snapshot))
      .catch(() => avisar({ tipo: "error", texto: "No se pudo cargar el catálogo. Recarga la página." }));
  }, [avisar]);

  // Lo primero que falta (con el paso donde se captura) o el resultado, si ya se puede calcular.
  const { resultado, pendiente } = useMemo((): { resultado: ReturnType<typeof calcular> | null; pendiente: Pendiente | null } => {
    if (!snapshot) return { resultado: null, pendiente: null };
    const visible = (p: Pendiente): Pendiente => ({ ...p, paso: rapida ? pasoDeRapida(p.paso) : p.paso });
    // Primero lo que se ve casilla por casilla (título, contacto, cantidad, medidas, insumos), luego el esquema
    // general y al final los errores del motor (costos faltantes en el catálogo).
    const revision = revisarCaptura({
      titulo: borrador.titulo,
      cliente: { nombreContacto: borrador.cliente.nombreContacto },
      entrada: borrador.entrada,
    });
    if (revision) return { resultado: null, pendiente: visible(revision) };
    const problema = problemaDeEntrada(borrador.entrada);
    if (problema) return { resultado: null, pendiente: visible(problema) };
    try {
      return { resultado: calcular(borrador.entrada as EntradaCotizacion, snapshot), pendiente: null };
    } catch (error) {
      if (error instanceof ErrorMotor) {
        const filaId = error.contexto?.filaId;
        return {
          resultado: null,
          pendiente: visible({
            paso: pasoDeErrorMotor(error.codigo),
            mensaje: error.message,
            campo: filaId ? idFila(filaId, "insumos") : undefined,
          }),
        };
      }
      return { resultado: null, pendiente: { paso: rapida ? PASO_RAPIDA.cotizacion : PASO.resumen, mensaje: "Faltan datos para calcular." } };
    }
  }, [borrador.titulo, borrador.cliente.nombreContacto, borrador.entrada, snapshot, rapida]);

  /**
   * Autoriza el análisis de costos (PNO-COM-01, Fase 1). Solo lo puede hacer el responsable;
   * guarda primero, porque se autoriza exactamente lo que está capturado.
   */
  async function autorizar() {
    const id = await guardar({ avisar: false });
    if (!id) return;
    setOcupado("Autorizando el análisis…");
    try {
      const { autorizadaEn: fecha } = await llamarApi<{ autorizadaEn: string }>(
        `/api/cotizaciones/${id}/autorizar`,
        "POST",
        {},
      );
      setAutorizadaEn(fecha);
      avisar({ tipo: "ok", texto: "Análisis autorizado. Ya puedes generar la propuesta para el cliente." });
      router.refresh();
    } catch (error) {
      avisar({ tipo: "error", texto: error instanceof Error ? error.message : "No se pudo autorizar." });
    } finally {
      setOcupado(null);
    }
  }

  /** Guarda (para que el PDF salga de lo último capturado) y descarga. Las alertas piden confirmar. */
  async function generarPdf() {
    const id = await guardar({ avisar: false });
    if (!id) return;

    const totalAlertas = alertas.length;
    if (totalAlertas > 0 && !alertasConfirmadas) {
      setAlertasConfirmadas(true);
      avisar({
        tipo: "advertencia",
        texto: `Hay ${totalAlertas} alerta${totalAlertas === 1 ? "" : "s"} sin revisar (las ves en el precio en vivo). Vuelve a presionar "Generar PDF" si quieres continuar de todos modos.`,
      });
      return;
    }

    avisar({ tipo: "ok", texto: "Abriendo la vista previa en otra pestaña…" });
    // Vista previa en pestaña nueva; desde ahí se guarda o se imprime.
    window.open(`/api/cotizaciones/${id}/pdf?ver=1`, "_blank", "noopener");
  }

  async function irAlPaso(destino: number) {
    await guardarPendiente();
    setPaso(Math.min(Math.max(destino, 0), ultimoPaso));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  /** Quita la marca roja de las casillas: en cuanto se edita algo, lo que se marcó ya se está corrigiendo. */
  function quitarMarcas() {
    document.querySelectorAll('[data-error="true"]').forEach((el) => el.removeAttribute("data-error"));
  }
  useEffect(quitarMarcas, [borrador.entrada, borrador.titulo, borrador.cliente.nombreContacto]);

  /**
   * Lleva a la casilla que falta: cambia de sección si hace falta, la centra en pantalla, la enfoca y la marca
   * en rojo. Sin casilla conocida (p. ej. un precio de la gasolina por capturar), solo lleva a la sección.
   */
  async function corregir(problema: Pendiente) {
    setFalta(null);
    // Si la casilla es de un concepto de otra opción, primero se muestra esa opción.
    const fila = borrador.entrada.levantamiento.filas.find((f) => problema.campo?.startsWith(`fila-${f.id}-`));
    const indice = borrador.entrada.opciones.findIndex((o) => o.id === fila?.opcionId);
    if (indice >= 0) setIndiceOpcion(indice);
    if (problema.paso !== paso) await irAlPaso(problema.paso);
    // El paso nuevo tarda un instante en pintarse.
    window.setTimeout(() => {
      quitarMarcas();
      const casilla = problema.campo ? document.getElementById(problema.campo) : null;
      if (!casilla) return;
      casilla.scrollIntoView({ behavior: "smooth", block: "center" });
      casilla.setAttribute("data-error", "true");
      casilla.focus({ preventScroll: true });
    }, 120);
  }

  /** "Siguiente": si en esta sección falta algo, antes de pasar se dice qué es. */
  function siguiente() {
    if (pendiente && pendiente.paso === paso) {
      setFalta({ pendiente, continuar: () => irAlPaso(paso + 1) });
      return;
    }
    irAlPaso(paso + 1);
  }

  // El precio en vivo es el de la opción que se está viendo (si se quitó la última, el de la anterior).
  const indiceVisible = Math.min(indiceOpcion, Math.max(borrador.entrada.opciones.length - 1, 0));
  const opcionVisible = resultado?.opciones[indiceVisible] ?? null;
  const varianteVisible = opcionVisible?.variantes.at(-1) ?? null;
  const produccionVisible = opcionVisible?.levantamiento ?? resultado?.levantamiento;
  // Todas las alertas: las generales y las de cada opción (margen bajo, precio a mano), sin repetir.
  const todasLasAlertas = resultado
    ? [...resultado.alertas, ...resultado.opciones.flatMap((o) => o.variantes.flatMap((v) => v.alertas))]
    : [];
  const alertas = todasLasAlertas.filter(
    (a, i) => todasLasAlertas.findIndex((b) => b.codigo === a.codigo && b.mensaje === a.mensaje) === i,
  );

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="space-y-6">
        <nav className="flex flex-wrap gap-1 rounded-lg bg-muted p-1">
          {pasos.map((nombre, i) => (
            <button
              key={nombre}
              type="button"
              onClick={() => irAlPaso(i)}
              className={cn(
                "flex items-center gap-2 rounded-md px-3 py-2 text-sm",
                i === paso ? "bg-card font-medium shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <span className={cn("flex size-5 items-center justify-center rounded-full text-xs", i < paso ? "bg-success/20" : "bg-border")}>
                {i < paso ? <Check className="size-3" /> : i + 1}
              </span>
              {nombre}
            </button>
          ))}
        </nav>

        {(guardando || ocupado) && <PantallaCarga mensaje={ocupado ?? "Guardando…"} />}

        {/* Punto de control del PNO-COM-01: sin autorización no se comunica ningún precio. */}
        {paso === ultimoPaso && !autorizadaEn && (
          <Aviso tipo="error">
            {puedeAutorizar
              ? "El análisis de costos no está autorizado. Revísalo y presiona “Autorizar análisis” para poder generar la propuesta."
              : "El análisis de costos debe autorizarlo tu responsable antes de enviar cualquier precio al cliente. Avísale que ya está listo para revisión."}
          </Aviso>
        )}

        {clave === "datos" && (
          <PasoDatos
            borrador={borrador}
            cambiar={cambiar}
            clientes={clientes}
            vendedores={vendedores}
            puedeElegirVendedor={puedeElegirVendedor}
            conTraslado={!rapida}
            alSincronizarCliente={(b, { km, zona }) => ({
              ...b,
              entrada: {
                ...b.entrada,
                operacion: {
                  ...b.entrada.operacion,
                  viaticos: zona ? { ...b.entrada.operacion.viaticos, tipo: zona } : b.entrada.operacion.viaticos,
                  traslado: km !== undefined ? { ...b.entrada.operacion.traslado, kmPorTrayecto: km } : b.entrada.operacion.traslado,
                },
              },
            })}
          />
        )}
        {(clave === "levantamiento" || clave === "cotizacion") && (
          <PasoLevantamiento
            borrador={borrador}
            cambiar={cambiar}
            snapshot={snapshot}
            indiceOpcion={indiceOpcion}
            setIndiceOpcion={setIndiceOpcion}
            ranuraCatalogo={ranuraCatalogo}
            puedeEditarCatalogo={puedeEditarCatalogo}
            recargarCatalogo={recargarCatalogo}
          />
        )}
        {clave === "opciones" && (
          <PasoOpciones borrador={borrador} cambiar={cambiar} asegurarGuardado={() => guardar({ avisar: true })} />
        )}
        {clave === "operacion" && <PasoOperacion borrador={borrador} cambiar={cambiar} snapshot={snapshot} />}
        {clave === "cotizacion" && (
          <section className="space-y-3">
            <h2 className="text-lg font-semibold">Tiempo de desarrollo</h2>
            <PasoTiempoRapida borrador={borrador} cambiar={cambiar} snapshot={snapshot} />
          </section>
        )}
        {clave === "reventa" && <PasoReventa borrador={borrador} cambiar={cambiar} />}
        {(clave === "resumen" || clave === "cotizacion") && (
          <section className="space-y-3">
            {clave === "cotizacion" && <h2 className="text-lg font-semibold">Resumen y propuesta</h2>}
            <PasoResumen
              borrador={borrador}
              cambiar={cambiar}
              resultado={resultado}
              autorizada={!!autorizadaEn}
              pendiente={pendiente && <AvisoPendiente pendiente={pendiente} pasoActual={paso} irAlPaso={irAlPaso} pasos={pasos} corregir={corregir} />}
            />
          </section>
        )}

        {falta && (
          <Modal
            titulo="Falta información"
            descripcion={`Sección: ${pasos[falta.pendiente.paso] ?? ""}`}
            alCerrar={() => setFalta(null)}
            className="max-w-md"
          >
            <p className="flex items-start gap-2 text-sm">
              <TriangleAlert className="mt-0.5 size-4 shrink-0 text-destructive" />
              <span>{falta.pendiente.mensaje}</span>
            </p>
            <div className="flex flex-wrap justify-end gap-2">
              {falta.continuar && (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    const continuar = falta.continuar;
                    setFalta(null);
                    continuar?.();
                  }}
                >
                  Continuar sin corregir
                </Button>
              )}
              <Button type="button" onClick={() => corregir(falta.pendiente)}>
                {falta.pendiente.campo ? "Corregir ahora" : `Ir a ${pasos[falta.pendiente.paso] ?? "la sección"}`}
              </Button>
            </div>
          </Modal>
        )}

        <div className="flex items-center justify-between gap-3 border-t pt-4">
          <Button type="button" variant="ghost" disabled={paso === 0} onClick={() => irAlPaso(paso - 1)}>
            <ChevronLeft /> Anterior
          </Button>
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" onClick={() => guardar()} disabled={guardando}>
              {guardando ? <Loader2 className="animate-spin" /> : <Save />} Guardar borrador
            </Button>
            {paso === ultimoPaso && puedeAutorizar && !autorizadaEn && (
              <Button
                type="button"
                onClick={() => (pendiente ? setFalta({ pendiente }) : autorizar())}
                disabled={guardando || (!resultado && !pendiente)}
              >
                <ShieldCheck /> Autorizar análisis
              </Button>
            )}
            {paso === ultimoPaso && (
              <Button
                type="button"
                variant="accent"
                onClick={() => (pendiente ? setFalta({ pendiente }) : generarPdf())}
                disabled={guardando || (!pendiente && (!resultado || !autorizadaEn))}
                title={autorizadaEn ? undefined : "Falta autorizar el análisis de costos (PNO-COM-01, Fase 1)"}
              >
                <FileDown /> Generar PDF
              </Button>
            )}
            {paso < ultimoPaso && (
              <Button type="button" onClick={siguiente}>
                Siguiente <ChevronRight />
              </Button>
            )}
          </div>
        </div>
      </div>

      <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start">
        <Card>
          <CardContent className="space-y-3 pt-6">
            <div>
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Precio en vivo</p>
              {borrador.folio && <p className="font-mono text-xs">{borrador.folio}</p>}
            </div>

            {pendiente && <AvisoPendiente pendiente={pendiente} pasoActual={paso} irAlPaso={irAlPaso} pasos={pasos} corregir={corregir} />}

            {varianteVisible && (
              <div className="space-y-1 text-sm">
                {(resultado?.opciones.length ?? 0) > 1 && <p className="font-medium text-primary">{opcionVisible?.nombre}</p>}
                <p className="text-2xl font-semibold">{formatoMoneda(varianteVisible.total)}</p>
                <p className="text-muted-foreground">
                  {produccionVisible?.piezas} piezas · {produccionVisible?.areaM2} m²
                </p>
                <p className="text-muted-foreground">
                  {(varianteVisible.conceptos?.length ?? 1) > 1 ? "Unitario promedio" : "Unitario"}{" "}
                  {formatoMoneda(varianteVisible.unitario)}
                </p>
                <p className="text-muted-foreground">Subtotal {formatoMoneda(varianteVisible.subtotal)}</p>
                <ComposicionDelCosto
                  variante={varianteVisible}
                  parametros={snapshot?.parametros ?? null}
                  ajustes={borrador.entrada.ajustes}
                  irAOperacion={() => irAlPaso(rapida ? PASO_RAPIDA.cotizacion : PASO.operacion)}
                  rapida={rapida}
                />
              </div>
            )}

            {resultado && resultado.opciones.length === 0 && <SoloReventaEnVivo reventa={resultado.reventa} />}

            {resultado && resultado.opciones.length > 1 && (
              <div className="space-y-1 border-t pt-2 text-xs">
                {resultado.opciones.map((o, i) => (
                  <button
                    key={o.id ?? o.recetaId}
                    type="button"
                    onClick={() => setIndiceOpcion(i)}
                    aria-pressed={i === indiceVisible}
                    title="Ver esta opción"
                    className={cn(
                      "flex w-full justify-between gap-2 rounded px-1.5 py-1 text-left hover:bg-muted",
                      i === indiceVisible && "bg-primary/10 font-medium text-primary",
                    )}
                  >
                    <span className={cn("truncate", i !== indiceVisible && "text-muted-foreground")}>{o.nombre}</span>
                    <span>{formatoMoneda(o.variantes.at(-1)?.total ?? "0")}</span>
                  </button>
                ))}
              </div>
            )}

            {resultado && resultado.reventa.items.length > 0 && varianteVisible && (
              <ReventaEnVivo
                total={resultado.reventa.total}
                articulos={resultado.reventa.items.length}
                totalOpcion={varianteVisible.total}
                nombreOpcion={resultado.opciones.length > 1 ? (opcionVisible?.nombre ?? null) : null}
              />
            )}

            {alertas.length > 0 && (
              <ListaAlertas
                alertas={alertas}
                pasoActual={paso}
                irAlPaso={irAlPaso}
                pasos={pasos}
                pasoDe={(codigo) => pasoVisible(pasoDeAlerta(codigo))}
              />
            )}

            <EstadoGuardado estado={autoguardado} guardadoEn={guardadoEn} reintentar={() => guardar({ avisar: true })} />
          </CardContent>
        </Card>
        {/* El catálogo del paso 2 se dibuja aquí, debajo del precio en vivo. */}
        <div ref={setRanuraCatalogo} />
      </aside>
    </div>
  );
}

/** Lo que falta para calcular, con un botón para ir directo al paso donde se captura. */
export function AvisoPendiente({
  pendiente,
  pasoActual,
  irAlPaso,
  pasos = PASOS,
  corregir,
}: {
  pendiente: Pendiente;
  pasoActual: number;
  irAlPaso: (paso: number) => void;
  /** Nombres de los pasos del asistente (física o digital). */
  pasos?: readonly string[];
  /** Lleva a la casilla que falta y la marca. Sin esto, el botón solo cambia de paso. */
  corregir?: (pendiente: Pendiente) => void;
}) {
  return (
    <div className="space-y-2 rounded-md border border-accent/40 bg-accent/5 p-3 text-sm">
      <p className="flex items-start gap-2">
        <TriangleAlert className="mt-0.5 size-4 shrink-0 text-accent" />
        <span>
          <span className="font-medium">Falta en “{pasos[pendiente.paso]}”:</span> {pendiente.mensaje}
        </span>
      </p>
      {corregir && pendiente.campo ? (
        <Button type="button" size="sm" variant="outline" onClick={() => corregir(pendiente)}>
          Ir a la casilla <ChevronRight />
        </Button>
      ) : (
        pendiente.paso !== pasoActual && (
          <Button type="button" size="sm" variant="outline" onClick={() => irAlPaso(pendiente.paso)}>
            Ir a {pasos[pendiente.paso]} <ChevronRight />
          </Button>
        )
      )}
    </div>
  );
}

/**
 * El camino completo del costo al precio, para que se vea de dónde sale cada peso: materiales,
 * consumibles y operación; luego la fórmula del PNO (× margen de error, ÷ margen) y el IVA.
 * Es interno: no sale al cliente.
 */
function ComposicionDelCosto({
  variante,
  parametros,
  ajustes,
  irAOperacion,
  rapida,
}: {
  variante: { desglose: Desglose; subtotal: string; total: string; descuento: string; ajustePrecio?: string };
  parametros: Snapshot["parametros"] | null;
  ajustes: BorradorCotizacion["entrada"]["ajustes"];
  irAOperacion: () => void;
  rapida: boolean;
}) {
  const { desglose } = variante;
  const materiales = Number(desglose.materiales);
  const consumibles = Number(desglose.consumibles);
  const costo = Number(desglose.costoTotal);
  const operacion = Math.max(costo - materiales - consumibles, 0);

  // Cotización rápida: sin consumibles, con costos indirectos y siempre el margen de error.
  const indirectos = rapida ? Number(parametros?.pctIndirectos ?? 0.05) : 0;
  const margen = ajustes.margen !== "" && ajustes.margen != null ? Number(ajustes.margen) : Number(parametros?.margen ?? 0.3);
  const pctError = ajustes.aplicaMargenError || rapida ? Number(parametros?.pctMargenError ?? 0.1) : 0;
  const pctConsumibles = Number(parametros?.pctConsumibles ?? 0.05);
  const iva = Number(parametros?.iva ?? 0.16);
  const conError = costo * (1 + pctError);
  const conIndirectos = conError * (1 + indirectos);
  const precio = conIndirectos / (1 - margen);
  const subtotal = Number(variante.subtotal);
  const descuento = Number(variante.descuento);
  const ajuste = Number(variante.ajustePrecio ?? 0);
  // El subtotal redondea el unitario de cada concepto a centavos (y respeta precios manuales y descuento):
  // si se aleja de la fórmula más que unos centavos, se dice por qué.
  const diferencia = Math.abs(subtotal + descuento - ajuste - precio) > 1;

  const porcentaje = (valor: number) => `${Math.round(valor * 1000) / 10}%`;
  const renglon = (etiqueta: string, valor: number, clase = "") => (
    <p className={cn("flex justify-between gap-2", clase)}>
      <span>{etiqueta}</span>
      <span className="tabular-nums">{formatoMoneda(valor.toFixed(2))}</span>
    </p>
  );

  return (
    <div className="space-y-1 border-t pt-2 text-xs">
      <p className="text-muted-foreground">Cómo se llega al precio:</p>
      {renglon("Materiales", materiales)}
      {ajustes.aplicaConsumibles && !rapida && renglon(`Consumibles (${porcentaje(pctConsumibles)} de materiales)`, consumibles)}
      {renglon("Operación y mano de obra", operacion)}
      {renglon("Costo", costo, "border-t pt-1 font-medium")}
      {pctError > 0 && renglon(`× ${(1 + pctError).toFixed(2)} margen de error`, conError)}
      {indirectos > 0 && renglon(`× ${(1 + indirectos).toFixed(2)} costos indirectos (${porcentaje(indirectos)})`, conIndirectos)}
      {renglon(`÷ ${(1 - margen).toFixed(2)} margen del ${porcentaje(margen)}`, precio)}
      {ajuste > 0 && renglon("+ Ajuste al precio deseado", ajuste)}
      {descuento > 0 && renglon("− Descuento", descuento)}
      {renglon("Subtotal", subtotal, "border-t pt-1 font-medium")}
      {renglon(`+ IVA ${porcentaje(iva)}`, Number(variante.total), "font-medium")}
      {diferencia && (
        <p className="text-muted-foreground">
          El subtotal no es exacto a la fórmula porque hay precios escritos a mano o por el redondeo de cada pieza.
        </p>
      )}
      {!rapida && operacion > materiales + consumibles && (
        <p className="rounded-md bg-accent/10 p-2 text-foreground">
          La operación pesa más que los materiales. Si es solo suministro, revisa diseño, instalación y viáticos.{" "}
          <button type="button" onClick={irAOperacion} className="font-medium underline underline-offset-2">
            Ir a Operación
          </button>
        </p>
      )}
    </div>
  );
}

/** Cómo va el guardado automático, al pie del precio en vivo. */
export function EstadoGuardado({
  estado,
  guardadoEn,
  reintentar,
}: {
  estado: { estado: "listo" | "pendiente" | "guardando" | "error"; error?: string };
  guardadoEn: string | null;
  reintentar: () => void;
}) {
  if (estado.estado === "error") {
    return (
      <div className="space-y-1 border-t pt-2 text-xs text-destructive">
        <p>No se guardaron los últimos cambios: {estado.error}</p>
        <button type="button" onClick={reintentar} className="font-medium underline underline-offset-2">
          Intentar de nuevo
        </button>
      </div>
    );
  }
  const texto =
    estado.estado === "guardando" ? "Guardando…" : estado.estado === "pendiente" ? "Cambios sin guardar…" : guardadoEn;
  if (!texto) return null;
  return <p className="border-t pt-2 text-xs text-muted-foreground">{texto}</p>;
}

/**
 * La reventa se cotiza aparte (su propia utilidad y su página en el PDF) y es la misma para todas las
 * opciones: aquí se ve junto al precio, sin mezclarla con él.
 */
/** Venta de pura reventa o maquila: artículos (compra + utilidad de reventa) y la operación aparte. */
function SoloReventaEnVivo({ reventa }: { reventa: ResultadoCotizacion["reventa"] }) {
  const renglon = (etiqueta: string, valor: string, clase = "") => (
    <p className={cn("flex justify-between gap-2", clase)}>
      <span>{etiqueta}</span>
      <span className="tabular-nums">{formatoMoneda(valor)}</span>
    </p>
  );
  const articulos = reventa.items.reduce((total, i) => total + Number(i.subtotal), 0);
  return (
    <div className="space-y-1 text-sm">
      <p className="text-2xl font-semibold">{formatoMoneda(reventa.total)}</p>
      <p className="text-muted-foreground">Reventa y maquila · {reventa.items.length} artículo{reventa.items.length === 1 ? "" : "s"}</p>
      <div className="space-y-1 border-t pt-2 text-xs">
        {renglon("Artículos (compra + utilidad de reventa)", articulos.toFixed(2))}
        {(reventa.operacion ?? []).map((f) => (
          <div key={f.concepto}>{renglon(f.concepto, f.subtotal)}</div>
        ))}
        {Number(reventa.ajustePrecio ?? 0) > 0 && (
          <p className="text-muted-foreground">
            Incluye {formatoMoneda(reventa.ajustePrecio ?? "0")} de ajuste al precio deseado (calculado:{" "}
            {formatoMoneda(reventa.subtotalCalculado ?? "0")}).
          </p>
        )}
        {Number(reventa.descuento ?? 0) > 0 && renglon("− Descuento", reventa.descuento ?? "0")}
        {renglon("Subtotal", reventa.subtotal, "border-t pt-1 font-medium")}
        {renglon("+ IVA", reventa.iva)}
        <p className="text-muted-foreground">
          La operación (diseño, envío, instalación y extras) sale en filas aparte, con la fórmula del PNO.
        </p>
      </div>
    </div>
  );
}

function ReventaEnVivo({
  total,
  articulos,
  totalOpcion,
  nombreOpcion,
}: {
  total: string;
  articulos: number;
  totalOpcion: string;
  /** Con varias opciones, cuál se está sumando. */
  nombreOpcion: string | null;
}) {
  return (
    <div className="space-y-1 border-t pt-2 text-sm">
      <p className="flex justify-between gap-2">
        <span className="text-muted-foreground">
          + Reventa ({articulos} artículo{articulos === 1 ? "" : "s"}, con IVA)
        </span>
        <span className="tabular-nums">{formatoMoneda(total)}</span>
      </p>
      <p className="flex justify-between gap-2 font-medium">
        <span>Total de la propuesta{nombreOpcion ? ` (con ${nombreOpcion})` : ""}</span>
        <span className="tabular-nums">{formatoMoneda((Number(totalOpcion) + Number(total)).toFixed(2))}</span>
      </p>
    </div>
  );
}

/** Las alertas por revisar: al abrirlas dicen qué pasa, qué hacer y llevan al paso donde se corrige. */
export function ListaAlertas({
  alertas,
  pasoActual,
  irAlPaso,
  pasos = PASOS,
  pasoDe = pasoDeAlerta,
  queHacer = QUE_HACER_ALERTA,
}: {
  alertas: { codigo: string; mensaje: string }[];
  pasoActual: number;
  irAlPaso: (paso: number) => void;
  pasos?: readonly string[];
  /** Dónde se revisa cada alerta. */
  pasoDe?: (codigo: string) => number;
  queHacer?: Record<string, string>;
}) {
  const [abierta, setAbierta] = useState(false);
  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={() => setAbierta((a) => !a)}
        aria-expanded={abierta}
        className="inline-flex items-center gap-1 rounded-full bg-accent/15 px-3 py-1 text-xs font-medium text-accent hover:bg-accent/25"
      >
        <TriangleAlert className="size-3.5" />
        {alertas.length} alerta{alertas.length === 1 ? "" : "s"} por revisar
        <ChevronRight className={cn("size-3.5 transition-transform", abierta && "rotate-90")} />
      </button>
      {abierta && (
        <ul className="space-y-2">
          {alertas.map((alerta, i) => {
            const destino = pasoDe(alerta.codigo);
            return (
              <li key={i} className="space-y-1 rounded-md border border-accent/30 bg-accent/5 p-2 text-xs">
                <p>{alerta.mensaje}</p>
                {queHacer[alerta.codigo] && <p className="text-muted-foreground">{queHacer[alerta.codigo]}</p>}
                {destino !== pasoActual ? (
                  <button type="button" onClick={() => irAlPaso(destino)} className="font-medium text-accent underline underline-offset-2">
                    Ir a {pasos[destino]}
                  </button>
                ) : (
                  <p className="font-medium text-accent">Está en este paso.</p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
