"use client";

import { Check, ChevronLeft, ChevronRight, FileDown, Save, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAvisos } from "@/components/avisos";
import { PantallaCarga } from "@/components/pantalla-carga";
import { Aviso, Button, Card, CardContent } from "@/components/ui";
import { type BorradorDigital, borradorDigitalInicial, cuerpoDigital, type ServicioCatalogo } from "@/lib/cotizador/estado-digital";
import {
  PASO_DIGITAL,
  PASOS_DIGITAL,
  type Pendiente,
  pasoDeAlertaDigital,
  pasoDeErrorDigital,
  QUE_HACER_ALERTA_DIGITAL,
} from "@/lib/cotizador/pasos";
import { formatoMoneda } from "@/lib/formato";
import { calcularDigital, ErrorMotor, type ResultadoDigital } from "@/lib/motor";
import { cn, llamarApi } from "@/lib/utils";
import { problemaDeEntradaDigital } from "@/lib/validacion/digital";
import { AvisoPendiente, EstadoGuardado, ListaAlertas } from "./asistente";
import { PasoBrief } from "./paso-brief";
import { type ClienteOpcion, PasoDatos } from "./pasos-captura";
import { PasoPago, PasoResumenDigital, PasoServicios } from "./pasos-digital";
import { useGuardadoCotizacion } from "./use-guardado";

type Props = {
  usuarioId: string;
  vendedores: { id: string; nombre: string }[];
  puedeElegirVendedor: boolean;
  clientes: ClienteOpcion[];
  inicial?: BorradorDigital;
  puedeAutorizar: boolean;
  puedeEditarCatalogo?: boolean;
  autorizada?: string | null;
};

/**
 * Asistente de Digitalización: Datos → Servicios → Brief del cliente → Pago y promociones → Resumen.
 * Comparte con el de publicidad física el guardado automático, la autorización del responsable
 * (PNO, Fase 1), el PDF y los mensajes; el precio sale de listas, no de costos.
 */
export function AsistenteDigital({
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
  const avisar = useAvisos();
  const [autorizadaEn, setAutorizadaEn] = useState<string | null>(autorizada);
  const { borrador, cambiar, guardar, guardarPendiente, guardando, guardadoEn, autoguardado } = useGuardadoCotizacion({
    inicial: () => inicial ?? borradorDigitalInicial(usuarioId),
    cuerpo: cuerpoDigital,
    alEditar: () => setAutorizadaEn(null),
  });
  const [paso, setPaso] = useState(0);
  const [servicios, setServicios] = useState<ServicioCatalogo[] | null>(null);
  const [iva, setIva] = useState("0.16");
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [alertasConfirmadas, setAlertasConfirmadas] = useState(false);

  const cargarServicios = useCallback(async () => {
    try {
      const datos = await llamarApi<{ servicios: ServicioCatalogo[]; iva: string }>("/api/servicios-digitales", "GET");
      setServicios(datos.servicios);
      setIva(datos.iva);
    } catch {
      avisar({ tipo: "error", texto: "No se pudo cargar el catálogo de servicios. Recarga la página." });
    }
  }, [avisar]);

  // El catálogo se descarga una vez; el precio se recalcula aquí mismo, sin ir al servidor.
  useEffect(() => {
    llamarApi<{ servicios: ServicioCatalogo[]; iva: string }>("/api/servicios-digitales", "GET")
      .then((datos) => {
        setServicios(datos.servicios);
        setIva(datos.iva);
      })
      .catch(() => avisar({ tipo: "error", texto: "No se pudo cargar el catálogo de servicios. Recarga la página." }));
  }, [avisar]);

  const { resultado, pendiente } = useMemo((): { resultado: ResultadoDigital | null; pendiente: Pendiente | null } => {
    const problema = problemaDeEntradaDigital(borrador.entrada);
    if (problema) return { resultado: null, pendiente: problema };
    try {
      return { resultado: calcularDigital(borrador.entrada, iva), pendiente: null };
    } catch (error) {
      if (error instanceof ErrorMotor) return { resultado: null, pendiente: { paso: pasoDeErrorDigital(error.codigo), mensaje: error.message } };
      return { resultado: null, pendiente: { paso: PASO_DIGITAL.resumen, mensaje: "Faltan datos para calcular." } };
    }
  }, [borrador.entrada, iva]);

  async function irAlPaso(destino: number) {
    await guardarPendiente();
    setPaso(Math.min(Math.max(destino, 0), PASOS_DIGITAL.length - 1));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function autorizar() {
    const id = await guardar({ avisar: false });
    if (!id) return;
    setOcupado("Autorizando la propuesta…");
    try {
      const { autorizadaEn: fecha } = await llamarApi<{ autorizadaEn: string }>(`/api/cotizaciones/${id}/autorizar`, "POST", {});
      setAutorizadaEn(fecha);
      avisar({ tipo: "ok", texto: "Propuesta autorizada. Ya puedes generar el PDF para el cliente." });
      router.refresh();
    } catch (error) {
      avisar({ tipo: "error", texto: error instanceof Error ? error.message : "No se pudo autorizar." });
    } finally {
      setOcupado(null);
    }
  }

  async function generarPdf() {
    const id = await guardar({ avisar: false });
    if (!id) return;
    const alertas = resultado?.alertas.length ?? 0;
    if (alertas > 0 && !alertasConfirmadas) {
      setAlertasConfirmadas(true);
      avisar({
        tipo: "advertencia",
        texto: `Hay ${alertas} alerta${alertas === 1 ? "" : "s"} sin revisar (las ves en el precio en vivo). Vuelve a presionar "Generar PDF" si quieres continuar de todos modos.`,
      });
      return;
    }
    avisar({ tipo: "ok", texto: "Abriendo la vista previa en otra pestaña…" });
    window.open(`/api/cotizaciones/${id}/pdf?ver=1`, "_blank", "noopener");
  }

  const ultimo = paso === PASOS_DIGITAL.length - 1;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="min-w-0 space-y-6">
        <nav className="flex flex-wrap gap-1 rounded-lg bg-muted p-1">
          {PASOS_DIGITAL.map((nombre, i) => (
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

        {ultimo && !autorizadaEn && (
          <Aviso tipo="error">
            {puedeAutorizar
              ? "La propuesta no está autorizada. Revísala y presiona “Autorizar propuesta” para poder generar el PDF."
              : "Tu responsable debe autorizar la propuesta antes de enviar cualquier precio al cliente. Avísale que ya está lista para revisión."}
          </Aviso>
        )}

        {paso === PASO_DIGITAL.datos && (
          <PasoDatos
            borrador={borrador}
            cambiar={cambiar}
            clientes={clientes}
            vendedores={vendedores}
            puedeElegirVendedor={puedeElegirVendedor}
            conTraslado={false}
          />
        )}
        {paso === PASO_DIGITAL.servicios && (
          <PasoServicios
            borrador={borrador}
            cambiar={cambiar}
            servicios={servicios}
            puedeEditarCatalogo={puedeEditarCatalogo}
            recargarServicios={cargarServicios}
          />
        )}
        {paso === PASO_DIGITAL.brief && <PasoBrief borrador={borrador} cambiar={cambiar} servicios={servicios} />}
        {paso === PASO_DIGITAL.pago && <PasoPago borrador={borrador} cambiar={cambiar} />}
        {ultimo && <PasoResumenDigital borrador={borrador} cambiar={cambiar} resultado={resultado} autorizada={!!autorizadaEn} />}

        <div className="flex items-center justify-between gap-3 border-t pt-4">
          <Button type="button" variant="ghost" disabled={paso === 0} onClick={() => irAlPaso(paso - 1)}>
            <ChevronLeft /> Anterior
          </Button>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => guardar()} disabled={guardando}>
              <Save /> Guardar borrador
            </Button>
            {ultimo && puedeAutorizar && !autorizadaEn && (
              <Button type="button" onClick={autorizar} disabled={guardando || !resultado}>
                <ShieldCheck /> Autorizar propuesta
              </Button>
            )}
            {ultimo && (
              <Button
                type="button"
                variant="accent"
                onClick={generarPdf}
                disabled={guardando || !resultado || !autorizadaEn}
                title={autorizadaEn ? undefined : "Falta autorizar la propuesta (PNO-COM-01, Fase 1)"}
              >
                <FileDown /> Generar PDF
              </Button>
            )}
            {!ultimo && (
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
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Precio en vivo · Digitalización</p>
              {borrador.folio && <p className="font-mono text-xs">{borrador.folio}</p>}
            </div>

            {pendiente && <AvisoPendiente pendiente={pendiente} pasoActual={paso} irAlPaso={irAlPaso} pasos={PASOS_DIGITAL} />}

            {resultado?.escenarios.map((e) => (
              <div key={e.clave} className="space-y-1 border-t pt-2 text-sm first:border-t-0 first:pt-0">
                {resultado.escenarios.length > 1 && <p className="text-xs font-medium text-primary">{e.etiqueta}</p>}
                {e.renta && (
                  <>
                    <p className="text-lg font-semibold">
                      {formatoMoneda(e.renta.mensualidad)}
                      <span className="text-sm font-normal text-muted-foreground"> /mes × {e.renta.meses}</span>
                    </p>
                    <p className="text-muted-foreground">Activación {formatoMoneda(e.renta.activacion)} · IVA incluido</p>
                  </>
                )}
                {e.unico && (
                  <>
                    <p className={e.renta ? "text-muted-foreground" : "text-lg font-semibold"}>
                      {e.renta ? "+ Pagos únicos " : ""}
                      {formatoMoneda(e.unico.total)}
                      {!e.renta && <span className="text-sm font-normal text-muted-foreground"> con IVA</span>}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Anticipo {formatoMoneda(e.unico.anticipo)} · Finiquito {formatoMoneda(e.unico.finiquito)}
                    </p>
                  </>
                )}
                {e.mensual && <p className="text-muted-foreground">+ {formatoMoneda(e.mensual.total)} al mes (servicios mensuales)</p>}
              </div>
            ))}

            {resultado && resultado.alertas.length > 0 && (
              <ListaAlertas
                alertas={resultado.alertas}
                pasoActual={paso}
                irAlPaso={irAlPaso}
                pasos={PASOS_DIGITAL}
                pasoDe={pasoDeAlertaDigital}
                queHacer={QUE_HACER_ALERTA_DIGITAL}
              />
            )}

            <EstadoGuardado estado={autoguardado} guardadoEn={guardadoEn} reintentar={() => guardar({ avisar: true })} />
          </CardContent>
        </Card>
      </aside>
    </div>
  );
}
