"use client";

import { Check, ChevronLeft, ChevronRight, Loader2, Save, TriangleAlert } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Aviso, Badge, Button, Card, CardContent } from "@/components/ui";
import { type BorradorCotizacion, borradorInicial, cuerpoParaGuardar } from "@/lib/cotizador/estado";
import { formatoMoneda } from "@/lib/formato";
import { calcular, type EntradaCotizacion, ErrorMotor, type Snapshot } from "@/lib/motor";
import { cn, llamarApi } from "@/lib/utils";
import { type ClienteOpcion, PasoDatos, PasoLevantamiento, PasoMateriales, type RecetaOpcion } from "./pasos-captura";
import { PasoOperacion, PasoResumen, PasoReventa } from "./pasos-cierre";

const PASOS = ["Datos", "Levantamiento", "Materiales", "Operación", "Reventa", "Resumen"] as const;

type Props = {
  usuarioId: string;
  vendedores: { id: string; nombre: string }[];
  puedeElegirVendedor: boolean;
  recetas: RecetaOpcion[];
  clientes: ClienteOpcion[];
  inicial?: BorradorCotizacion;
};

export function AsistenteCotizacion({ usuarioId, vendedores, puedeElegirVendedor, recetas, clientes, inicial }: Props) {
  const router = useRouter();
  const [borrador, setBorrador] = useState<BorradorCotizacion>(inicial ?? borradorInicial(usuarioId));
  const [paso, setPaso] = useState(0);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState<{ tipo: "ok" | "error"; texto: string } | null>(null);
  const [guardadoEn, setGuardadoEn] = useState<string | null>(inicial?.id ? "Borrador abierto" : null);

  // El catálogo se descarga una vez y el precio se recalcula aquí mismo, sin ir al servidor.
  useEffect(() => {
    llamarApi<{ snapshot: Snapshot }>("/api/catalogo/snapshot", "GET")
      .then((datos) => setSnapshot(datos.snapshot))
      .catch(() => setMensaje({ tipo: "error", texto: "No se pudo cargar el catálogo." }));
  }, []);

  const { resultado, errorCalculo } = useMemo(() => {
    if (!snapshot || borrador.entrada.opciones.length === 0) return { resultado: null, errorCalculo: null };
    try {
      return { resultado: calcular(borrador.entrada as EntradaCotizacion, snapshot), errorCalculo: null };
    } catch (error) {
      const texto = error instanceof ErrorMotor ? error.message : "Faltan datos para calcular.";
      return { resultado: null, errorCalculo: texto };
    }
  }, [borrador.entrada, snapshot]);

  async function guardar({ avisar = true } = {}) {
    if (!borrador.titulo.trim() || !borrador.cliente.nombreContacto.trim()) {
      if (avisar) setMensaje({ tipo: "error", texto: "El título y el contacto del cliente son obligatorios." });
      return false;
    }
    setGuardando(true);
    setMensaje(null);
    try {
      const cuerpo = cuerpoParaGuardar(borrador);
      const respuesta = borrador.id
        ? await llamarApi<{ id: string; folio: string }>(`/api/cotizaciones/${borrador.id}`, "PUT", cuerpo)
        : await llamarApi<{ id: string; folio: string }>("/api/cotizaciones", "POST", cuerpo);

      setBorrador((b) => ({ ...b, id: respuesta.id, folio: respuesta.folio }));
      setGuardadoEn(`Guardado ${new Date().toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })}`);
      if (avisar) setMensaje({ tipo: "ok", texto: `Borrador guardado con folio ${respuesta.folio}.` });
      if (!borrador.id) window.history.replaceState(null, "", `/cotizaciones/${respuesta.id}`);
      router.refresh();
      return true;
    } catch (error) {
      setMensaje({ tipo: "error", texto: error instanceof Error ? error.message : "No se pudo guardar." });
      return false;
    } finally {
      setGuardando(false);
    }
  }

  async function irAlPaso(destino: number) {
    // Autoguardado al cambiar de paso, una vez que hay lo mínimo para guardar.
    if (borrador.titulo.trim() && borrador.cliente.nombreContacto.trim() && borrador.entrada.opciones.length > 0) {
      await guardar({ avisar: false });
    }
    setPaso(Math.min(Math.max(destino, 0), PASOS.length - 1));
  }

  const cambiar = (transformacion: (b: BorradorCotizacion) => BorradorCotizacion) => setBorrador(transformacion);
  const primeraVariante = resultado?.opciones[0]?.variantes.at(-1) ?? null;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
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

        {mensaje && <Aviso tipo={mensaje.tipo}>{mensaje.texto}</Aviso>}

        {paso === 0 && (
          <PasoDatos
            borrador={borrador}
            cambiar={cambiar}
            clientes={clientes}
            vendedores={vendedores}
            puedeElegirVendedor={puedeElegirVendedor}
          />
        )}
        {paso === 1 && <PasoLevantamiento borrador={borrador} cambiar={cambiar} />}
        {paso === 2 && <PasoMateriales borrador={borrador} cambiar={cambiar} recetas={recetas} />}
        {paso === 3 && <PasoOperacion borrador={borrador} cambiar={cambiar} />}
        {paso === 4 && <PasoReventa borrador={borrador} cambiar={cambiar} />}
        {paso === 5 && <PasoResumen borrador={borrador} cambiar={cambiar} resultado={resultado} />}

        <div className="flex items-center justify-between gap-3 border-t pt-4">
          <Button type="button" variant="ghost" disabled={paso === 0} onClick={() => irAlPaso(paso - 1)}>
            <ChevronLeft /> Anterior
          </Button>
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" onClick={() => guardar()} disabled={guardando}>
              {guardando ? <Loader2 className="animate-spin" /> : <Save />} Guardar borrador
            </Button>
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

            {errorCalculo && (
              <p className="flex items-start gap-2 text-sm text-destructive">
                <TriangleAlert className="mt-0.5 size-4 shrink-0" /> {errorCalculo}
              </p>
            )}

            {!errorCalculo && !primeraVariante && (
              <p className="text-sm text-muted-foreground">Elige una opción de material y captura el levantamiento.</p>
            )}

            {primeraVariante && (
              <div className="space-y-1 text-sm">
                <p className="text-2xl font-semibold">{formatoMoneda(primeraVariante.total)}</p>
                <p className="text-muted-foreground">
                  {resultado?.levantamiento.piezas} piezas · {resultado?.levantamiento.areaM2} m²
                </p>
                <p className="text-muted-foreground">Unitario {formatoMoneda(primeraVariante.unitario)}</p>
                <p className="text-muted-foreground">Subtotal {formatoMoneda(primeraVariante.subtotal)}</p>
              </div>
            )}

            {resultado && resultado.opciones.length > 1 && (
              <div className="space-y-1 border-t pt-2 text-xs">
                {resultado.opciones.map((o) => (
                  <p key={o.recetaId} className="flex justify-between gap-2">
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
      </aside>
    </div>
  );
}
