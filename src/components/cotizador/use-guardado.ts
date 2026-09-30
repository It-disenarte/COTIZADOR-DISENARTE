"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useAvisos } from "@/components/avisos";
import { llamarApi } from "@/lib/utils";

/** Lo mínimo que necesita cualquier borrador (físico o digital) para guardarse. */
export type BorradorGuardable = {
  id: string | null;
  folio: string | null;
  titulo: string;
  cliente: { id: string | null; nombreContacto: string };
};

export type EstadoAutoguardado = { estado: "listo" | "pendiente" | "guardando" | "error"; error?: string };

const faltanDatosPaso1 = (b: BorradorGuardable) => !b.titulo.trim() || !b.cliente.nombreContacto.trim();

/**
 * El borrador del asistente y su guardado: automático dos segundos después de la última edición,
 * manual con "Guardar borrador" y al cambiar de paso. Lo usan los dos asistentes (física y digital).
 * - Solo guarda si alguien editó (abrir una cotización autorizada no la toca).
 * - Una escritura a la vez: el primer guardado de una cotización nueva no se duplica.
 * - Si se cierra la pestaña con cambios sin guardar, el navegador pregunta.
 */
export function useGuardadoCotizacion<B extends BorradorGuardable>({
  inicial,
  cuerpo,
  alEditar,
}: {
  inicial: () => B;
  /** Lo que se manda a la API (incluye el tipo de cotización). */
  cuerpo: (borrador: B) => unknown;
  /** Se llama en cada edición (p. ej. para dar por perdida la autorización). */
  alEditar?: () => void;
}) {
  const router = useRouter();
  const avisar = useAvisos();
  const [borrador, setBorrador] = useState<B>(inicial);
  const [guardando, setGuardando] = useState(false);
  const [guardadoEn, setGuardadoEn] = useState<string | null>(() => (borrador.id ? "Borrador abierto" : null));
  const [autoguardado, setAutoguardado] = useState<EstadoAutoguardado>({ estado: "listo" });

  // Se cuenta cada edición; lo guardado se recuerda por número de edición.
  const [ediciones, setEdiciones] = useState(0);
  const edicionesRef = useRef(0);
  const guardadasRef = useRef(0);
  const borradorRef = useRef(borrador);
  /** Guardado en curso: se espera antes de otro, para no crear la misma cotización dos veces. */
  const enCursoRef = useRef<Promise<string> | null>(null);
  useEffect(() => {
    borradorRef.current = borrador;
  }, [borrador]);

  /**
   * Escribe en el servidor lo más reciente que hay en pantalla y devuelve el id. Si hay otra escritura
   * en curso, la espera y luego guarda. Lanza el error del servidor para que quien llama decida.
   */
  async function escribirEnServidor(): Promise<string> {
    while (enCursoRef.current) await enCursoRef.current.catch(() => null);
    const actual = borradorRef.current;
    const edicion = edicionesRef.current;
    const tarea = (async () => {
      type Respuesta = { id: string; folio: string; clienteId: string };
      const datos = cuerpo(actual);
      const respuesta = actual.id
        ? await llamarApi<Respuesta>(`/api/cotizaciones/${actual.id}`, "PUT", datos)
        : await llamarApi<Respuesta>("/api/cotizaciones", "POST", datos);
      // El id (y el del cliente) se conocen desde ya: el siguiente guardado actualiza, no crea otra.
      const conIds = (b: B): B => ({ ...b, id: respuesta.id, folio: respuesta.folio, cliente: { ...b.cliente, id: respuesta.clienteId } });
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

  /** Al cambiar de paso: guarda lo que falte (si el automático ya guardó todo, no hay espera). */
  async function guardarPendiente() {
    const hayPendiente = edicionesRef.current > guardadasRef.current || !borradorRef.current.id;
    if (hayPendiente && !faltanDatosPaso1(borradorRef.current)) await guardar({ avisar: false });
  }

  // Guardado automático: dos segundos después de la última edición, sin pantalla de carga.
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
    return () => clearTimeout(temporizador);
    // escribirEnServidor lee lo más reciente de los refs: solo importa cuándo hubo una edición.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ediciones]);

  // Si se intenta cerrar o recargar con cambios sin guardar, el navegador pregunta antes.
  useEffect(() => {
    const alSalir = (e: BeforeUnloadEvent) => {
      if (edicionesRef.current > guardadasRef.current && !faltanDatosPaso1(borradorRef.current)) e.preventDefault();
    };
    window.addEventListener("beforeunload", alSalir);
    return () => window.removeEventListener("beforeunload", alSalir);
  }, []);

  const cambiar = (transformacion: (b: B) => B) => {
    setBorrador(transformacion);
    edicionesRef.current += 1;
    setEdiciones(edicionesRef.current);
    alEditar?.();
  };

  return { borrador, cambiar, guardar, guardarPendiente, guardando, guardadoEn, autoguardado };
}
