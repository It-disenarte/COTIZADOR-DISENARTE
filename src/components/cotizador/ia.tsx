"use client";

import { ExternalLink, FileUp, Loader2, Sparkles, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { Badge, Button, Card, CardContent, Input, Label, Textarea } from "@/components/ui";
import { reducirImagen } from "@/lib/cotizador/imagen";
import { formatoMoneda } from "@/lib/formato";
import { cn, llamarApi } from "@/lib/utils";

/**
 * Botones de Gemini dentro del asistente. Ninguno cambia la cotización por su cuenta:
 * muestran lo que propuso la IA y el vendedor decide si lo usa.
 */

const TAMANO_MAXIMO = 4 * 1024 * 1024;

type Fila = { concepto: string; anchoM: string; altoM: string; cantidades: string[]; confianza: number };
export type LevantamientoLeido = { areas: string[]; filas: Fila[]; notas: string[] };

// Levantamiento -------------------------------------------------------------------------------

export function ImportarLevantamiento({
  alAplicar,
}: {
  alAplicar: (leido: LevantamientoLeido, modo: "reemplazar" | "agregar") => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const [archivo, setArchivo] = useState<File | null>(null);
  const [instruccion, setInstruccion] = useState("");
  const [leyendo, setLeyendo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [leido, setLeido] = useState<LevantamientoLeido | null>(null);

  async function leer() {
    if (!archivo) return;
    setError(null);
    setLeido(null);
    setLeyendo(true);
    try {
      // Las fotos se reducen (2000 px bastan para leer); los PDF van tal cual.
      const envio = archivo.type.startsWith("image/")
        ? new File([await reducirImagen(archivo, 2000, 0.85)], "levantamiento.jpg", { type: "image/jpeg" })
        : archivo;
      if (envio.size > TAMANO_MAXIMO) {
        throw new Error("El archivo pesa más de 4 MB. Divídelo o sube capturas de las páginas.");
      }

      const formulario = new FormData();
      formulario.append("archivo", envio);
      formulario.append("instruccion", instruccion);
      const respuesta = await fetch("/api/ia/levantamiento", {
        method: "POST",
        headers: { "x-cotizador": "1" },
        body: formulario,
      });
      const datos = await respuesta.json().catch(() => ({}));
      if (!respuesta.ok) throw new Error(datos.error ?? "No se pudo leer el archivo.");
      setLeido(datos as LevantamientoLeido);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo leer el archivo.");
    } finally {
      setLeyendo(false);
    }
  }

  function aplicar(modo: "reemplazar" | "agregar") {
    if (!leido) return;
    alAplicar(leido, modo);
    setLeido(null);
    setArchivo(null);
    setAbierto(false);
  }

  if (!abierto) {
    return (
      <Button type="button" variant="outline" onClick={() => setAbierto(true)}>
        <Sparkles /> Importar con IA
      </Button>
    );
  }

  const dudosas = leido?.filas.filter((f) => f.confianza < 0.7).length ?? 0;

  return (
    <Card className="w-full border-accent/60">
      <CardContent className="space-y-4 pt-6">
        <div>
          <h3 className="flex items-center gap-2 font-medium">
            <Sparkles className="size-4 text-accent" /> Leer el levantamiento con IA
          </h3>
          <p className="text-sm text-muted-foreground">
            Sube el PDF o la foto que mandó el cliente (máximo 4 MB). La IA propone la tabla con medidas en metros;
            tú la revisas antes de usarla. Si lo tienes en Excel, es más rápido “Pegar de Excel”.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="archivo-levantamiento">Archivo</Label>
            <Input
              id="archivo-levantamiento"
              type="file"
              accept="application/pdf,image/*"
              onChange={(e) => {
                setArchivo(e.target.files?.[0] ?? null);
                setLeido(null);
              }}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="instruccion-ia">Indicaciones (opcional)</Label>
            <Textarea
              id="instruccion-ia"
              value={instruccion}
              onChange={(e) => setInstruccion(e.target.value)}
              placeholder="Ej.: solo la sección de señalética; las medidas vienen en pulgadas"
              className="min-h-10"
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={leer} disabled={!archivo || leyendo}>
            {leyendo ? <Loader2 className="animate-spin" /> : <FileUp />}
            {leyendo ? "Leyendo… (puede tardar hasta un minuto)" : "Leer archivo"}
          </Button>
          <Button type="button" variant="ghost" onClick={() => setAbierto(false)} disabled={leyendo}>
            Cerrar
          </Button>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        {leido && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="font-medium">
                {leido.filas.length} fila{leido.filas.length === 1 ? "" : "s"} · áreas: {leido.areas.join(", ")}
              </span>
              {dudosas > 0 && (
                <Badge variant="accent">
                  {dudosas} por revisar
                </Badge>
              )}
            </div>

            <div className="max-h-80 overflow-auto rounded-md border">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-muted text-left">
                  <tr>
                    <th className="px-2 py-1.5 font-medium">Concepto</th>
                    <th className="px-2 py-1.5 font-medium">Ancho (m)</th>
                    <th className="px-2 py-1.5 font-medium">Alto (m)</th>
                    {leido.areas.map((a, i) => (
                      <th key={`${a}-${i}`} className="px-2 py-1.5 font-medium">
                        {a}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {leido.filas.map((f, i) => (
                    <tr
                      key={i}
                      className={cn(f.confianza < 0.7 && "bg-accent/10")}
                      title={f.confianza < 0.7 ? "La IA no está segura de esta fila: revísala" : undefined}
                    >
                      <td className="px-2 py-1.5">
                        {f.confianza < 0.7 && <TriangleAlert className="mr-1 inline size-3 text-accent" />}
                        {f.concepto}
                      </td>
                      <td className="px-2 py-1.5">{f.anchoM}</td>
                      <td className="px-2 py-1.5">{f.altoM}</td>
                      {f.cantidades.map((c, j) => (
                        <td key={j} className="px-2 py-1.5">
                          {c}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {leido.notas.length > 0 && (
              <div className="rounded-md bg-muted p-3 text-sm">
                <p className="font-medium">Notas de la IA</p>
                <ul className="mt-1 list-disc space-y-0.5 pl-5 text-muted-foreground">
                  {leido.notas.map((n, i) => (
                    <li key={i}>{n}</li>
                  ))}
                </ul>
              </div>
            )}

            <p className="text-xs text-muted-foreground">
              Compara contra el documento antes de usarla. Las filas marcadas son las que la IA leyó con dudas.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button type="button" onClick={() => aplicar("reemplazar")}>
                Usar esta tabla (reemplaza la actual)
              </Button>
              <Button type="button" variant="outline" onClick={() => aplicar("agregar")}>
                Agregar a la tabla actual
              </Button>
              <Button type="button" variant="ghost" onClick={() => setLeido(null)}>
                Descartar
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// Reventa -------------------------------------------------------------------------------------

type PrecioEncontrado = {
  nombre: string;
  precioReferencia: string;
  fuentes: { titulo: string; url: string }[];
  notas: string | null;
};

export function BuscarPrecio({
  nombre,
  alAplicar,
}: {
  nombre: string;
  alAplicar: (precio: { precioReferencia: string; link: string }) => void;
}) {
  const [buscando, setBuscando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [encontrado, setEncontrado] = useState<PrecioEncontrado | null>(null);

  async function buscar() {
    setBuscando(true);
    setError(null);
    setEncontrado(null);
    try {
      setEncontrado(await llamarApi<PrecioEncontrado>("/api/ia/reventa", "POST", { nombre }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo buscar el precio.");
    } finally {
      setBuscando(false);
    }
  }

  return (
    <div className="space-y-2 sm:col-span-4">
      <Button type="button" variant="outline" size="sm" onClick={buscar} disabled={buscando || !nombre.trim()}>
        {buscando ? <Loader2 className="animate-spin" /> : <Sparkles />}
        {buscando ? "Buscando precio…" : "Buscar precio con IA"}
      </Button>
      {error && <p className="text-xs text-destructive">{error}</p>}

      {encontrado && (
        <div className="space-y-2 rounded-md border border-accent/60 p-3 text-sm">
          <p>
            <span className="font-medium">{encontrado.nombre}</span>:{" "}
            {Number(encontrado.precioReferencia) > 0 ? (
              <span className="font-semibold">{formatoMoneda(encontrado.precioReferencia)}</span>
            ) : (
              <span className="text-muted-foreground">no encontró un precio confiable</span>
            )}
          </p>
          {encontrado.notas && <p className="text-xs text-muted-foreground">{encontrado.notas}</p>}
          {encontrado.fuentes.length > 0 && (
            <ul className="space-y-0.5 text-xs">
              {encontrado.fuentes.map((f) => (
                <li key={f.url}>
                  <a href={f.url} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">
                    <ExternalLink className="mr-1 inline size-3" />
                    {f.titulo}
                  </a>
                </li>
              ))}
            </ul>
          )}
          <p className="text-xs text-muted-foreground">
            Queda como “sin verificar”: abre una fuente, confirma el precio y marca la casilla.
          </p>
          <div className="flex gap-2">
            {Number(encontrado.precioReferencia) > 0 && (
              <Button
                type="button"
                size="sm"
                onClick={() => {
                  alAplicar({ precioReferencia: encontrado.precioReferencia, link: encontrado.fuentes[0]?.url ?? "" });
                  setEncontrado(null);
                }}
              >
                Usar este precio
              </Button>
            )}
            <Button type="button" variant="ghost" size="sm" onClick={() => setEncontrado(null)}>
              Descartar
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// Alcance -------------------------------------------------------------------------------------

export type PeticionAlcance = {
  titulo: string;
  areas: string[];
  piezas: string;
  recetas: { nombre: string; descripcion: string | null }[];
  tiempoEstimado: string | null;
  incluyeEnvio: boolean;
  incluyeInstalacion: boolean;
};

export function RedactarAlcance({
  concepto,
  resumen,
  peticion,
  alCambiar,
}: {
  concepto: string;
  resumen: string;
  peticion: PeticionAlcance;
  alCambiar: (alcance: { concepto: string; resumen: string }) => void;
}) {
  const [redactando, setRedactando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const palabras = resumen.trim() ? resumen.trim().split(/\s+/).length : 0;

  async function redactar() {
    setRedactando(true);
    setError(null);
    try {
      const alcance = await llamarApi<{ concepto: string; resumen: string }>("/api/ia/alcance", "POST", peticion);
      alCambiar({ concepto: alcance.concepto, resumen: alcance.resumen });
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo redactar.");
    } finally {
      setRedactando(false);
    }
  }

  return (
    <Card>
      <CardContent className="space-y-4 pt-6">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h3 className="font-medium">Resumen de alcance del PDF</h3>
            <p className="text-sm text-muted-foreground">
              Lo que dice la columna “Resumen de alcance” de cada opción. Si lo dejas vacío, sale el título de la
              cotización.
            </p>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={redactar} disabled={redactando}>
            {redactando ? <Loader2 className="animate-spin" /> : <Sparkles />}
            {redactando ? "Redactando…" : "Redactar con IA"}
          </Button>
        </div>

        <div className="space-y-2">
          <Label htmlFor="alcance-concepto">Concepto</Label>
          <Input
            id="alcance-concepto"
            value={concepto}
            onChange={(e) => alCambiar({ concepto: e.target.value, resumen })}
            placeholder={peticion.titulo || "Señalética para protección civil"}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="alcance-resumen">Resumen</Label>
          <Textarea
            id="alcance-resumen"
            value={resumen}
            onChange={(e) => alCambiar({ concepto, resumen: e.target.value })}
            placeholder="Señalética completa para las 3 áreas: CENDI, Primaria y Secundaria."
          />
          <p className={cn("text-xs", palabras > 40 ? "text-accent" : "text-muted-foreground")}>
            {palabras} palabras{palabras > 40 ? " · se recomienda máximo 40 para que quepa bien en la tabla" : ""}. La
            IA solo usa lo que ya capturaste; revisa que no afirme nada que no vayas a entregar.
          </p>
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </CardContent>
    </Card>
  );
}
