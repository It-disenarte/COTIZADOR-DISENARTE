"use client";

import { Check, ChevronLeft, ChevronRight, FileDown, Loader2, Save, ShieldCheck, TriangleAlert } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useAvisos } from "@/components/avisos";
import { PantallaCarga } from "@/components/pantalla-carga";
import { Aviso, Badge, Button, Card, CardContent } from "@/components/ui";
import { type BorradorCotizacion, borradorInicial, cuerpoParaGuardar, opcionNueva } from "@/lib/cotizador/estado";
import { PASO, PASOS, type Pendiente, pasoDeErrorMotor } from "@/lib/cotizador/pasos";
import { formatoMoneda } from "@/lib/formato";
import { calcular, type EntradaCotizacion, ErrorMotor, type Snapshot } from "@/lib/motor";
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
  const [alertasConfirmadas, setAlertasConfirmadas] = useState(false);
  const [autorizadaEn, setAutorizadaEn] = useState<string | null>(autorizada);

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

  /** Guarda el borrador y devuelve su id (null si faltan datos o falló). */
  async function guardar({ avisar: avisarAlUsuario = true } = {}): Promise<string | null> {
    if (!borrador.titulo.trim() || !borrador.cliente.nombreContacto.trim()) {
      if (avisarAlUsuario) avisar({ tipo: "error", texto: "Para guardar, captura el título y el contacto del cliente en el paso Datos." });
      return null;
    }
    setGuardando(true);
    try {
      const cuerpo = cuerpoParaGuardar(borrador);
      type Respuesta = { id: string; folio: string; clienteId: string };
      const respuesta = borrador.id
        ? await llamarApi<Respuesta>(`/api/cotizaciones/${borrador.id}`, "PUT", cuerpo)
        : await llamarApi<Respuesta>("/api/cotizaciones", "POST", cuerpo);

      // El id del cliente se guarda también: sin él, cada autoguardado creaba otra copia del cliente.
      setBorrador((b) => ({ ...b, id: respuesta.id, folio: respuesta.folio, cliente: { ...b.cliente, id: respuesta.clienteId } }));
      setGuardadoEn(`Guardado ${new Date().toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })}`);
      if (avisarAlUsuario) avisar({ tipo: "ok", texto: `Borrador guardado con folio ${respuesta.folio}.` });
      if (!borrador.id) window.history.replaceState(null, "", `/cotizaciones/${respuesta.id}`);
      router.refresh();
      return respuesta.id;
    } catch (error) {
      avisar({ tipo: "error", texto: error instanceof Error ? error.message : "No se pudo guardar." });
      return null;
    } finally {
      setGuardando(false);
    }
  }

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
    // Autoguardado al cambiar de paso en cuanto están los datos del paso 1; lo demás puede ir incompleto.
    if (borrador.titulo.trim() && borrador.cliente.nombreContacto.trim()) {
      await guardar({ avisar: false });
    }
    setPaso(Math.min(Math.max(destino, 0), PASOS.length - 1));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const cambiar = (transformacion: (b: BorradorCotizacion) => BorradorCotizacion) => {
    setBorrador(transformacion);
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
          <PasoLevantamiento borrador={borrador} cambiar={cambiar} snapshot={snapshot} ranuraCatalogo={ranuraCatalogo} />
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
                <ComposicionDelCosto desglose={primeraVariante.desglose} irAOperacion={() => irAlPaso(PASO.operacion)} />
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

            {guardadoEn && <p className="border-t pt-2 text-xs text-muted-foreground">{guardadoEn}</p>}
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
 * De qué se compone el costo: materiales contra operación (diseño, producción, instalación, viajes).
 * Así se nota enseguida cuando la operación pesa más que el trabajo. Es interno: no sale al cliente.
 */
function ComposicionDelCosto({
  desglose,
  irAOperacion,
}: {
  desglose: { materiales: string; consumibles: string; costoTotal: string };
  irAOperacion: () => void;
}) {
  const materiales = Number(desglose.materiales) + Number(desglose.consumibles);
  const operacion = Math.max(Number(desglose.costoTotal) - materiales, 0);
  return (
    <div className="space-y-1 border-t pt-2 text-xs">
      <p className="text-muted-foreground">De qué se compone el costo:</p>
      <p className="flex justify-between gap-2">
        <span>Materiales</span>
        <span>{formatoMoneda(materiales.toFixed(2))}</span>
      </p>
      <p className="flex justify-between gap-2">
        <span>Operación y mano de obra</span>
        <span>{formatoMoneda(operacion.toFixed(2))}</span>
      </p>
      {operacion > materiales && (
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
