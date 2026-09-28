"use client";

import { Check, Copy, Loader2, Mail, MessageCircle, Sparkles } from "lucide-react";
import { useState } from "react";
import { Button, Card, CardContent, Input, Label, Textarea } from "@/components/ui";
import { llamarApi } from "@/lib/utils";

type Canal = "correo" | "whatsapp";
type Correo = { asunto: string; correo: string };

/**
 * El mensaje con el que se manda la propuesta al cliente. Correo y WhatsApp son independientes:
 * el vendedor elige por dónde la manda y redacta solo ese (o los dos, si quiere). La IA los
 * redacta con los datos de la cotización ya autorizada; el texto queda editable, porque quien
 * firma es la persona.
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
  const [cargando, setCargando] = useState<Canal | null>(null);
  const [error, setError] = useState<{ canal: Canal; texto: string } | null>(null);
  const [correo, setCorreo] = useState<Correo | null>(null);
  const [whatsapp, setWhatsapp] = useState<string | null>(null);
  const [copiado, setCopiado] = useState<string | null>(null);

  async function redactar(canal: Canal) {
    if (!cotizacionId) return;
    setCargando(canal);
    setError(null);
    try {
      const respuesta = await llamarApi<Correo & { whatsapp: string }>(`/api/cotizaciones/${cotizacionId}/mensajes`, "POST", {
        canal,
      });
      if (canal === "correo") setCorreo({ asunto: respuesta.asunto, correo: respuesta.correo });
      else setWhatsapp(respuesta.whatsapp);
    } catch (e) {
      setError({ canal, texto: e instanceof Error ? e.message : "No se pudo redactar el mensaje." });
    } finally {
      setCargando(null);
    }
  }

  async function copiar(clave: string, texto: string) {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(clave);
      setTimeout(() => setCopiado((actual) => (actual === clave ? null : actual)), 2000);
    } catch {
      setError({ canal: clave === "whatsapp" ? "whatsapp" : "correo", texto: "El navegador no dejó copiar. Selecciona el texto y cópialo a mano." });
    }
  }

  const soloDigitos = telefono.replace(/\D/g, "");
  const enlaceWhatsapp =
    whatsapp && soloDigitos.length >= 10
      ? `https://wa.me/${soloDigitos.length === 10 ? `52${soloDigitos}` : soloDigitos}?text=${encodeURIComponent(whatsapp)}`
      : null;
  const bloqueado = !autorizada || !cotizacionId;

  const botonRedactar = (canal: Canal, texto: string) => (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={() => redactar(canal)}
      disabled={cargando !== null || bloqueado}
      title={autorizada ? undefined : "Primero hay que autorizar el análisis de costos"}
    >
      {cargando === canal ? <Loader2 className="animate-spin" /> : <Sparkles />}
      {cargando === canal ? "Redactando…" : texto}
    </Button>
  );

  return (
    <Card>
      <CardContent className="space-y-5 pt-6">
        <div>
          <h3 className="font-medium">Mandar la propuesta al cliente</h3>
          <p className="text-sm text-muted-foreground">
            Elige por dónde la mandas: por correo, por WhatsApp o por los dos. Cada mensaje es independiente y la
            presenta completa. La IA los redacta con lo que ya capturaste; revísalos y edítalos antes de enviarlos.
          </p>
          {!autorizada && (
            <p className="mt-1 text-xs text-muted-foreground">
              Disponible cuando el análisis esté autorizado: el PNO prohíbe comunicar precios antes de esa revisión.
            </p>
          )}
        </div>

        <section className="space-y-3 rounded-lg border p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="flex items-center gap-2 text-sm font-medium">
              <Mail className="size-4 text-primary" /> Por correo
            </h4>
            {botonRedactar("correo", correo ? "Redactar de nuevo" : "Redactar correo con IA")}
          </div>
          {error?.canal === "correo" && <p className="text-sm text-destructive">{error.texto}</p>}
          {correo && (
            <div className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor="asunto-correo">Asunto</Label>
                <Input
                  id="asunto-correo"
                  value={correo.asunto}
                  onChange={(e) => setCorreo({ ...correo, asunto: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cuerpo-correo">Correo</Label>
                <Textarea
                  id="cuerpo-correo"
                  className="min-h-64 font-mono text-xs"
                  value={correo.correo}
                  onChange={(e) => setCorreo({ ...correo, correo: e.target.value })}
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <Button type="button" size="sm" variant="outline" onClick={() => copiar("asunto", correo.asunto)}>
                  {copiado === "asunto" ? <Check /> : <Copy />} Copiar asunto
                </Button>
                <Button type="button" size="sm" onClick={() => copiar("correo", correo.correo)}>
                  {copiado === "correo" ? <Check /> : <Copy />} Copiar correo
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Antes de enviarlo: adjunta el PDF de la propuesta y revisa que el nombre y las cifras coincidan con lo
                autorizado.
              </p>
            </div>
          )}
        </section>

        <section className="space-y-3 rounded-lg border p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="flex items-center gap-2 text-sm font-medium">
              <MessageCircle className="size-4 text-primary" /> Por WhatsApp
            </h4>
            {botonRedactar("whatsapp", whatsapp !== null ? "Redactar de nuevo" : "Redactar WhatsApp con IA")}
          </div>
          {error?.canal === "whatsapp" && <p className="text-sm text-destructive">{error.texto}</p>}
          {whatsapp !== null && (
            <div className="space-y-3">
              <Textarea
                aria-label="Mensaje de WhatsApp"
                className="min-h-40"
                value={whatsapp}
                onChange={(e) => setWhatsapp(e.target.value)}
              />
              <div className="flex flex-wrap gap-2">
                <Button type="button" size="sm" onClick={() => copiar("whatsapp", whatsapp)}>
                  {copiado === "whatsapp" ? <Check /> : <Copy />} Copiar mensaje
                </Button>
                {enlaceWhatsapp && (
                  <a
                    href={enlaceWhatsapp}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex h-8 items-center gap-2 rounded-md border px-3 text-xs hover:bg-muted"
                  >
                    <MessageCircle className="size-4" /> Abrir en WhatsApp
                  </a>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                Adjunta el PDF de la propuesta en el mismo chat.
                {!enlaceWhatsapp && " Para abrir WhatsApp directo, captura el teléfono del cliente en el paso Datos."}
              </p>
            </div>
          )}
        </section>
      </CardContent>
    </Card>
  );
}
