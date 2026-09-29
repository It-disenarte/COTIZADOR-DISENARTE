"use client";

import { Check, ChevronLeft, ChevronRight, FileDown, Loader2, Save, ShieldCheck, TriangleAlert } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { useAvisos } from "@/components/avisos";
import { PantallaCarga } from "@/components/pantalla-carga";
import { Aviso, Badge, Button, Card, CardContent } from "@/components/ui";
import { type BorradorCotizacion, borradorInicial, cuerpoParaGuardar, opcionNueva } from "@/lib/cotizador/estado";
import { PASO, PASOS, type Pendiente, pasoDeErrorMotor } from "@/lib/cotizador/pasos";
import { formatoMoneda } from "@/lib/formato";
import { calcular, type Desglose, type EntradaCotizacion, ErrorMotor, type Snapshot } from "@/lib/motor";
import { cn, llamarApi } from "@/lib/utils";
import { problemaDeEntrada } from "@/lib/validacion/cotizacion";
import { PasoLevantamiento } from "./paso-levantamiento";
import { PasoOpciones } from "./paso-opciones";
import { type ClienteOpcion, PasoDatos } from "./pasos-captura";
import { PasoOperacion, PasoResumen, PasoReventa } from "./pasos-cierre";

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
  const [borrador, setBorrador] = useState<BorradorCotizacion>(() => {
    const base = inicial ?? borradorInicial(usuarioId);
    // Siempre hay al menos una opción, para que la tabla del levantamiento reciba insumos.
    return base.entrada.opciones.length ? base : { ...base, entrada: { ...base.entrada, opciones: [opcionNueva(1)] } };
  });
  const [paso, setPaso] = useState(0);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [guardando, setGuardando] = useState(false);
  /** Qué se está haciendo en el servidor, para la pantalla de carga (null = nada). */
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [ranuraCatalogo, setRanuraCatalogo] = useState<HTMLDivElement | null>(null);
  const avisar = useAvisos();
  const [guardadoEn, setGuardadoEn] = useState<string | null>(inicial?.id ? "Borrador abierto" : null);

  // Guardado automático. Se cuenta cada edición; lo que se guardó se recuerda por número de edición,
  // así solo se guarda si alguien cambió algo (abrir una cotización autorizada no la toca).
  const [ediciones, setEdiciones] = useState(0);
  const edicionesRef = useRef(0);
  const guardadasRef = useRef(0);
  const borradorRef = useRef(borrador);
  /** Guardado en curso: se espera antes de otro, para no crear la misma cotización dos veces. */
  const enCursoRef = useRef<Promise<string> | null>(null);
  const [autoguardado, setAutoguardado] = useState<{ estado: "listo" | "pendiente" | "guardando" | "error"; error?: string }>({
    estado: "listo",
  });
  useEffect(() => {
    borradorRef.current = borrador;
  }, [borrador]);
  const [alertasConfirmadas, setAlertasConfirmadas] = useState(false);
  const [autorizadaEn, setAutorizadaEn] = useState<string | null>(autorizada);

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
    const problema = problemaDeEntrada(borrador.entrada);
    if (problema) return { resultado: null, pendiente: problema };
    try {
      return { resultado: calcular(borrador.entrada as EntradaCotizacion, snapshot), pendiente: null };
    } catch (error) {
      if (error instanceof ErrorMotor) {
        return { resultado: null, pendiente: { paso: pasoDeErrorMotor(error.codigo), mensaje: error.message } };
      }
      return { resultado: null, pendiente: { paso: PASO.resumen, mensaje: "Faltan datos para calcular." } };
    }
  }, [borrador.entrada, snapshot]);

  const faltanDatosPaso1 = (b: BorradorCotizacion) => !b.titulo.trim() || !b.cliente.nombreContacto.trim();

  /**
   * Escribe en el servidor lo más reciente que hay en pantalla y devuelve el id. Una escritura a la
   * vez: si hay otra en curso, la espera y luego guarda (así el primer guardado de una cotización
   * nueva no se duplica). Lanza el error del servidor para que quien llama decida cómo avisarlo.
   */
  async function escribirEnServidor(): Promise<string> {
    while (enCursoRef.current) await enCursoRef.current.catch(() => null);
    const actual = borradorRef.current;
    const edicion = edicionesRef.current;
    const tarea = (async () => {
      type Respuesta = { id: string; folio: string; clienteId: string };
      const cuerpo = cuerpoParaGuardar(actual);
      const respuesta = actual.id
        ? await llamarApi<Respuesta>(`/api/cotizaciones/${actual.id}`, "PUT", cuerpo)
        : await llamarApi<Respuesta>("/api/cotizaciones", "POST", cuerpo);
      // El id (y el del cliente) se conocen desde ya: el siguiente guardado actualiza, no crea otra.
      const conIds = (b: BorradorCotizacion) => ({ ...b, id: respuesta.id, folio: respuesta.folio, cliente: { ...b.cliente, id: respuesta.clienteId } });
      borradorRef.current = conIds(borradorRef.current);
      setBorrador(conIds);
      guardadasRef.current = Math.max(guardadasRef.current, edicion);
      if (!actual.id) window.history.replaceState(null, "", `/cotizaciones/${respuesta.id}`);
      setGuardadoEn(`Guardado ${new Date().toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })}`);
      return respuesta.id;
    })();
    enCursoRef.current = tarea;
    try {
      return await tarea;
    } finally {
      if (enCursoRef.current === tarea) enCursoRef.current = null;
    }
  }

  /** Guarda el borrador y devuelve su id (null si faltan datos o falló). Con pantalla de carga. */
  async function guardar({ avisar: avisarAlUsuario = true } = {}): Promise<string | null> {
    if (faltanDatosPaso1(borradorRef.current)) {
      if (avisarAlUsuario) avisar({ tipo: "error", texto: "Para guardar, captura el título y el contacto del cliente en el paso Datos." });
      return null;
    }
    setGuardando(true);
    try {
      const id = await escribirEnServidor();
      setAutoguardado({ estado: "listo" });
      if (avisarAlUsuario) avisar({ tipo: "ok", texto: `Borrador guardado con folio ${borradorRef.current.folio}.` });
      router.refresh();
      return id;
    } catch (error) {
      avisar({ tipo: "error", texto: error instanceof Error ? error.message : "No se pudo guardar." });
      return null;
    } finally {
      setGuardando(false);
    }
  }

  // Guardado automático: dos segundos después de la última edición, sin pantalla de carga, para que
  // no se pierda nada si algo falla o se cierra la pestaña sin guardar.
  useEffect(() => {
    if (ediciones === 0 || ediciones <= guardadasRef.current) return;
    if (faltanDatosPaso1(borradorRef.current)) return;
    setAutoguardado({ estado: "pendiente" });
    const temporizador = setTimeout(async () => {
      setAutoguardado({ estado: "guardando" });
      try {
        await escribirEnServidor();
        setAutoguardado(edicionesRef.current > guardadasRef.current ? { estado: "pendiente" } : { estado: "listo" });
      } catch (error) {
        setAutoguardado({ estado: "error", error: error instanceof Error ? error.message : "No se pudo guardar." });
      }
    }, 2000);
    // escribirEnServidor lee lo más reciente de los refs: solo importa cuándo hubo una edición.
    return () => clearTimeout(temporizador);
  }, [ediciones]);

  // Si se intenta cerrar o recargar con cambios sin guardar, el navegador pregunta antes.
  useEffect(() => {
    const alSalir = (e: BeforeUnloadEvent) => {
      if (edicionesRef.current > guardadasRef.current && !faltanDatosPaso1(borradorRef.current)) e.preventDefault();
    };
    window.addEventListener("beforeunload", alSalir);
    return () => window.removeEventListener("beforeunload", alSalir);
  }, []);

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

    const alertas = resultado?.alertas.length ?? 0;
    if (alertas > 0 && !alertasConfirmadas) {
      setAlertasConfirmadas(true);
      avisar({
        tipo: "advertencia",
        texto: `Hay ${alertas} alerta${alertas === 1 ? "" : "s"} sin revisar. Vuelve a presionar "Generar PDF" si quieres continuar de todos modos.`,
      });
      return;
    }

    avisar({ tipo: "ok", texto: "Abriendo la vista previa en otra pestaña…" });
    // Vista previa en pestaña nueva; desde ahí se guarda o se imprime.
    window.open(`/api/cotizaciones/${id}/pdf?ver=1`, "_blank", "noopener");
  }

  async function irAlPaso(destino: number) {
    // Al cambiar de paso se guarda lo que falte (si el automático ya guardó todo, no hay espera).
    const hayPendiente = edicionesRef.current > guardadasRef.current || !borradorRef.current.id;
    if (hayPendiente && !faltanDatosPaso1(borradorRef.current)) {
      await guardar({ avisar: false });
    }
    setPaso(Math.min(Math.max(destino, 0), PASOS.length - 1));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const cambiar = (transformacion: (b: BorradorCotizacion) => BorradorCotizacion) => {
    setBorrador(transformacion);
    edicionesRef.current += 1;
    setEdiciones(edicionesRef.current);
    // Al editar, la autorización anterior deja de valer: el servidor la borra al guardar.
    setAutorizadaEn(null);
  };
  const primeraVariante = resultado?.opciones[0]?.variantes.at(-1) ?? null;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="space-y-6">
        <nav className="flex flex-wrap gap-1 rounded-lg bg-muted p-1">
          {PASOS.map((nombre, i) => (
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
        {paso === PASOS.length - 1 && !autorizadaEn && (
          <Aviso tipo="error">
            {puedeAutorizar
              ? "El análisis de costos no está autorizado. Revísalo y presiona “Autorizar análisis” para poder generar la propuesta."
              : "El análisis de costos debe autorizarlo tu responsable antes de enviar cualquier precio al cliente. Avísale que ya está listo para revisión."}
          </Aviso>
        )}

        {paso === 0 && (
          <PasoDatos
            borrador={borrador}
            cambiar={cambiar}
            clientes={clientes}
            vendedores={vendedores}
            puedeElegirVendedor={puedeElegirVendedor}
          />
        )}
        {paso === 1 && (
          <PasoLevantamiento
            borrador={borrador}
            cambiar={cambiar}
            snapshot={snapshot}
            ranuraCatalogo={ranuraCatalogo}
            puedeEditarCatalogo={puedeEditarCatalogo}
            recargarCatalogo={recargarCatalogo}
          />
        )}
        {paso === 2 && (
          <PasoOpciones borrador={borrador} cambiar={cambiar} asegurarGuardado={() => guardar({ avisar: true })} />
        )}
        {paso === 3 && <PasoOperacion borrador={borrador} cambiar={cambiar} snapshot={snapshot} />}
        {paso === 4 && <PasoReventa borrador={borrador} cambiar={cambiar} />}
        {paso === 5 && (
          <PasoResumen
            borrador={borrador}
            cambiar={cambiar}
            resultado={resultado}
            autorizada={!!autorizadaEn}
            pendiente={pendiente && <AvisoPendiente pendiente={pendiente} pasoActual={paso} irAlPaso={irAlPaso} />}
          />
        )}

        <div className="flex items-center justify-between gap-3 border-t pt-4">
          <Button type="button" variant="ghost" disabled={paso === 0} onClick={() => irAlPaso(paso - 1)}>
            <ChevronLeft /> Anterior
          </Button>
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" onClick={() => guardar()} disabled={guardando}>
              {guardando ? <Loader2 className="animate-spin" /> : <Save />} Guardar borrador
            </Button>
            {paso === PASOS.length - 1 && puedeAutorizar && !autorizadaEn && (
              <Button type="button" onClick={autorizar} disabled={guardando || !resultado}>
                <ShieldCheck /> Autorizar análisis
              </Button>
            )}
            {paso === PASOS.length - 1 && (
              <Button
                type="button"
                variant="accent"
                onClick={generarPdf}
                disabled={guardando || !resultado || !autorizadaEn}
                title={autorizadaEn ? undefined : "Falta autorizar el análisis de costos (PNO-COM-01, Fase 1)"}
              >
                <FileDown /> Generar PDF
              </Button>
            )}
            {paso < PASOS.length - 1 && (
              <Button type="button" onClick={() => irAlPaso(paso + 1)}>
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

            {pendiente && <AvisoPendiente pendiente={pendiente} pasoActual={paso} irAlPaso={irAlPaso} />}

            {primeraVariante && (
              <div className="space-y-1 text-sm">
                <p className="text-2xl font-semibold">{formatoMoneda(primeraVariante.total)}</p>
                <p className="text-muted-foreground">
                  {resultado?.levantamiento.piezas} piezas · {resultado?.levantamiento.areaM2} m²
                </p>
                <p className="text-muted-foreground">
                  {(primeraVariante.conceptos?.length ?? 1) > 1 ? "Unitario promedio" : "Unitario"}{" "}
                  {formatoMoneda(primeraVariante.unitario)}
                </p>
                <p className="text-muted-foreground">Subtotal {formatoMoneda(primeraVariante.subtotal)}</p>
                <ComposicionDelCosto
                  variante={primeraVariante}
                  parametros={snapshot?.parametros ?? null}
                  ajustes={borrador.entrada.ajustes}
                  irAOperacion={() => irAlPaso(PASO.operacion)}
                />
              </div>
            )}

            {resultado && resultado.opciones.length > 1 && (
              <div className="space-y-1 border-t pt-2 text-xs">
                {resultado.opciones.map((o) => (
                  <p key={o.id ?? o.recetaId} className="flex justify-between gap-2">
                    <span className="truncate text-muted-foreground">{o.nombre}</span>
                    <span>{formatoMoneda(o.variantes.at(-1)?.total ?? "0")}</span>
                  </p>
                ))}
              </div>
            )}

            {resultado && resultado.alertas.length > 0 && (
              <Badge variant="accent" className="block w-fit">
                {resultado.alertas.length} alerta{resultado.alertas.length === 1 ? "" : "s"} por revisar
              </Badge>
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
function AvisoPendiente({
  pendiente,
  pasoActual,
  irAlPaso,
}: {
  pendiente: Pendiente;
  pasoActual: number;
  irAlPaso: (paso: number) => void;
}) {
  return (
    <div className="space-y-2 rounded-md border border-accent/40 bg-accent/5 p-3 text-sm">
      <p className="flex items-start gap-2">
        <TriangleAlert className="mt-0.5 size-4 shrink-0 text-accent" />
        <span>
          <span className="font-medium">Falta en “{PASOS[pendiente.paso]}”:</span> {pendiente.mensaje}
        </span>
      </p>
      {pendiente.paso !== pasoActual && (
        <Button type="button" size="sm" variant="outline" onClick={() => irAlPaso(pendiente.paso)}>
          Ir a {PASOS[pendiente.paso]} <ChevronRight />
        </Button>
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
}: {
  variante: { desglose: Desglose; subtotal: string; total: string; descuento: string };
  parametros: Snapshot["parametros"] | null;
  ajustes: BorradorCotizacion["entrada"]["ajustes"];
  irAOperacion: () => void;
}) {
  const { desglose } = variante;
  const materiales = Number(desglose.materiales);
  const consumibles = Number(desglose.consumibles);
  const costo = Number(desglose.costoTotal);
  const operacion = Math.max(costo - materiales - consumibles, 0);

  const margen = ajustes.margen !== "" && ajustes.margen != null ? Number(ajustes.margen) : Number(parametros?.margen ?? 0.3);
  const pctError = ajustes.aplicaMargenError ? Number(parametros?.pctMargenError ?? 0.1) : 0;
  const pctConsumibles = Number(parametros?.pctConsumibles ?? 0.05);
  const iva = Number(parametros?.iva ?? 0.16);
  const conError = costo * (1 + pctError);
  const precio = conError / (1 - margen);
  const subtotal = Number(variante.subtotal);
  const descuento = Number(variante.descuento);
  // El subtotal redondea el unitario de cada concepto a centavos (y respeta precios manuales y descuento):
  // si se aleja de la fórmula más que unos centavos, se dice por qué.
  const diferencia = Math.abs(subtotal + descuento - precio) > 1;

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
      {ajustes.aplicaConsumibles && renglon(`Consumibles (${porcentaje(pctConsumibles)} de materiales)`, consumibles)}
      {renglon("Operación y mano de obra", operacion)}
      {renglon("Costo", costo, "border-t pt-1 font-medium")}
      {pctError > 0 && renglon(`× ${(1 + pctError).toFixed(2)} margen de error`, conError)}
      {renglon(`÷ ${(1 - margen).toFixed(2)} margen del ${porcentaje(margen)}`, precio)}
      {descuento > 0 && renglon("− Descuento", descuento)}
      {renglon("Subtotal", subtotal, "border-t pt-1 font-medium")}
      {renglon(`+ IVA ${porcentaje(iva)}`, Number(variante.total), "font-medium")}
      {diferencia && (
        <p className="text-muted-foreground">
          El subtotal no es exacto a la fórmula porque hay precios escritos a mano o por el redondeo de cada pieza.
        </p>
      )}
      {operacion > materiales + consumibles && (
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
function EstadoGuardado({
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
