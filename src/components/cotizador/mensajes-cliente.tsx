"use client";

import { Check, Copy, Loader2, Mail, MessageCircle, Sparkles } from "lucide-react";
import { useState } from "react";
import { Button, Card, CardContent, Input, Label, Textarea } from "@/components/ui";
import { llamarApi } from "@/lib/utils";

type Mensajes = { asunto: string; correo: string; whatsapp: string; preguntaTecnica: string };

/**
 * Fase 2 y Fase 3 del PNO-COM-01: el correo con la propuesta y el mensaje de seguimiento por
 * WhatsApp. La IA los redacta con los datos de la cotización ya autorizada; el texto queda
 * editable, porque quien firma es la persona.
 */
export function MensajesCliente({
  cotizacionId,
  autorizada,
  telefono,
}: {
  cotizacionId: string | null;
  autorizada: boolean;
  telefono: string;
}) {
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mensajes, setMensajes] = useState<Mensajes | null>(null);
  const [copiado, setCopiado] = useState<string | null>(null);

  async function redactar() {
    if (!cotizacionId) return;
    setCargando(true);
    setError(null);
    try {
      setMensajes(await llamarApi<Mensajes>(`/api/cotizaciones/${cotizacionId}/mensajes`, "POST", {}));
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudieron redactar los mensajes.");
    } finally {
      setCargando(false);
    }
  }

  async function copiar(clave: string, texto: string) {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(clave);
      setTimeout(() => setCopiado((actual) => (actual === clave ? null : actual)), 2000);
    } catch {
      setError("El navegador no dejó copiar. Selecciona el texto y cópialo a mano.");
    }
  }

  const editar = (cambios: Partial<Mensajes>) => setMensajes((m) => (m ? { ...m, ...cambios } : m));
  const soloDigitos = telefono.replace(/\D/g, "");
  const enlaceWhatsapp =
    mensajes && soloDigitos.length >= 10
      ? `https://wa.me/${soloDigitos.length === 10 ? `52${soloDigitos}` : soloDigitos}?text=${encodeURIComponent(mensajes.whatsapp)}`
      : null;

  return (
    <Card>
      <CardContent className="space-y-4 pt-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="font-medium">Mensajes para el cliente</h3>
            <p className="text-sm text-muted-foreground">
              El correo de la Fase 2 y el mensaje de seguimiento de la Fase 3. La IA los redacta con lo que ya
              capturaste; revísalos y edítalos antes de enviarlos.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={redactar}
            disabled={cargando || !autorizada || !cotizacionId}
            title={autorizada ? undefined : "Primero hay que autorizar el análisis de costos"}
          >
            {cargando ? <Loader2 className="animate-spin" /> : <Sparkles />}
            {cargando ? "Redactando…" : "Redactar con IA"}
          </Button>
        </div>

        {!autorizada && (
          <p className="text-xs text-muted-foreground">
            Disponible cuando el análisis esté autorizado: el PNO prohíbe comunicar precios antes de esa revisión.
          </p>
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}

        {mensajes && (
          <div className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="asunto-correo" className="flex items-center gap-2">
                <Mail className="size-4 text-primary" /> Asunto del correo
              </Label>
              <Input id="asunto-correo" value={mensajes.asunto} onChange={(e) => editar({ asunto: e.target.value })} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="cuerpo-correo">Correo (Fase 2)</Label>
              <Textarea
                id="cuerpo-correo"
                className="min-h-64 font-mono text-xs"
                value={mensajes.correo}
                onChange={(e) => editar({ correo: e.target.value })}
              />
              <div className="flex flex-wrap gap-2">
                <Button type="button" size="sm" variant="outline" onClick={() => copiar("asunto", mensajes.asunto)}>
                  {copiado === "asunto" ? <Check /> : <Copy />} Copiar asunto
                </Button>
                <Button type="button" size="sm" onClick={() => copiar("correo", mensajes.correo)}>
                  {copiado === "correo" ? <Check /> : <Copy />} Copiar correo
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Antes de enviarlo: adjunta el PDF de la propuesta y revisa que el nombre y las cifras coincidan con
                lo autorizado (punto de control de la Fase 2).
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="mensaje-whatsapp" className="flex items-center gap-2">
                <MessageCircle className="size-4 text-primary" /> WhatsApp (Fase 3)
              </Label>
              <Textarea
                id="mensaje-whatsapp"
                className="min-h-32"
                value={mensajes.whatsapp}
                onChange={(e) => editar({ whatsapp: e.target.value })}
              />
              {mensajes.preguntaTecnica && (
                <p className="text-xs text-muted-foreground">
                  Pregunta técnica que obliga a responder: <strong>{mensajes.preguntaTecnica}</strong>
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                <Button type="button" size="sm" onClick={() => copiar("whatsapp", mensajes.whatsapp)}>
                  {copiado === "whatsapp" ? <Check /> : <Copy />} Copiar mensaje
                </Button>
                {enlaceWhatsapp && (
                  <a
                    href={enlaceWhatsapp}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex h-9 items-center gap-2 rounded-md border px-3 text-sm hover:bg-muted"
                  >
                    <MessageCircle className="size-4" /> Abrir en WhatsApp
                  </a>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                Se manda el mismo día del correo, en horario laboral, y no lleva precios: esos van en el documento
                formal.
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
