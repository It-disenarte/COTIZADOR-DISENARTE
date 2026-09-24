"use client";

import { ClipboardPaste, ImagePlus, Loader2, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { Badge, Button, Card, CardContent, Checkbox, Input, Label, Select, Textarea } from "@/components/ui";
import { ETIQUETA_FAMILIA, ETIQUETA_ZONA, ZONAS } from "@/lib/catalogo/constantes";
import { type BorradorCotizacion, filasDesdeTsv, fusionarLevantamiento, num, txt } from "@/lib/cotizador/estado";
import { subirImagenCotizacion } from "@/lib/cotizador/imagen";
import type { Lugar } from "@/lib/mapas/osm";
import { CalcularKm } from "./calcular-km";
import { CampoDireccion } from "./campo-direccion";
import { ImportarLevantamiento } from "./ia";
import { cn } from "@/lib/utils";

export type RecetaOpcion = {
  id: string;
  nombre: string;
  familia: keyof typeof ETIQUETA_FAMILIA;
  descripcionPdf: string | null;
  cotizable: boolean;
  motivo: string | null;
};

export type ClienteOpcion = {
  id: string;
  nombreContacto: string;
  empresa: string | null;
  correo: string | null;
  telefono: string | null;
  direccion: string | null;
  kmDesdeSjr: string | null;
  zona: "local" | "foraneo";
  notas: string | null;
};

type Props = {
  borrador: BorradorCotizacion;
  cambiar: (cambios: (b: BorradorCotizacion) => BorradorCotizacion) => void;
};

// Paso 1 -------------------------------------------------------------------------------------

export function PasoDatos({
  borrador,
  cambiar,
  clientes,
  vendedores,
  puedeElegirVendedor,
}: Props & { clientes: ClienteOpcion[]; vendedores: { id: string; nombre: string }[]; puedeElegirVendedor: boolean }) {
  const cliente = borrador.cliente;
  // Punto exacto elegido en las sugerencias de dirección (si lo hay).
  const [lugarElegido, setLugarElegido] = useState<Lugar | null>(null);
  const sugerencias = clientes
    .filter((c) => {
      const q = `${cliente.empresa} ${cliente.nombreContacto}`.trim().toLowerCase();
      return q.length >= 2 && `${c.empresa ?? ""} ${c.nombreContacto}`.toLowerCase().includes(q) && c.id !== cliente.id;
    })
    .slice(0, 5);

  const editarCliente = (cambios: Partial<BorradorCotizacion["cliente"]>) =>
    cambiar((b) => ({ ...b, cliente: { ...b.cliente, ...cambios } }));

  /** Los km se guardan con el cliente y pasan al "Km por trayecto" de Operación. */
  const ponerKm = (valor: string) =>
    cambiar((b) => ({
      ...b,
      cliente: { ...b.cliente, kmDesdeSjr: valor },
      entrada: {
        ...b.entrada,
        operacion: { ...b.entrada.operacion, traslado: { ...b.entrada.operacion.traslado, kmPorTrayecto: valor } },
      },
    }));

  const usarCliente = (c: ClienteOpcion) =>
    cambiar((b) => ({
      ...b,
      cliente: {
        id: c.id,
        nombreContacto: c.nombreContacto,
        empresa: c.empresa ?? "",
        correo: c.correo ?? "",
        telefono: c.telefono ?? "",
        direccion: c.direccion ?? "",
        kmDesdeSjr: c.kmDesdeSjr ?? "",
        zona: c.zona,
        notas: c.notas ?? "",
      },
      entrada: {
        ...b.entrada,
        operacion: {
          ...b.entrada.operacion,
          viaticos: { ...b.entrada.operacion.viaticos, tipo: c.zona },
          // El km se guarda por cliente para no volver a capturarlo; pasa directo al traslado de Operación.
          traslado: { ...b.entrada.operacion.traslado, kmPorTrayecto: c.kmDesdeSjr ?? b.entrada.operacion.traslado.kmPorTrayecto },
        },
      },
    }));

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="grid gap-4 pt-6 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="titulo">Título del proyecto</Label>
            <Input
              id="titulo"
              value={borrador.titulo}
              onChange={(e) => cambiar((b) => ({ ...b, titulo: e.target.value }))}
              placeholder="Señalética protección civil"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="solicitante">Solicitante</Label>
            <Input
              id="solicitante"
              value={borrador.solicitante}
              onChange={(e) => cambiar((b) => ({ ...b, solicitante: e.target.value }))}
              placeholder="Quién pide la cotización"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="asesor">Asesor comercial</Label>
            <Select
              id="asesor"
              value={borrador.vendedorId}
              disabled={!puedeElegirVendedor}
              onChange={(e) => cambiar((b) => ({ ...b, vendedorId: e.target.value }))}
            >
              {vendedores.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.nombre}
                </option>
              ))}
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-4 pt-6">
          <div>
            <h3 className="font-medium">Cliente</h3>
            <p className="text-sm text-muted-foreground">
              Se guarda solo. La próxima vez que cotices para él, escribe su nombre y aparece con sus kilómetros.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="empresa">Empresa</Label>
              <Input id="empresa" value={cliente.empresa} onChange={(e) => editarCliente({ empresa: e.target.value, id: null })} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="contacto">Contacto</Label>
              <Input
                id="contacto"
                value={cliente.nombreContacto}
                onChange={(e) => editarCliente({ nombreContacto: e.target.value, id: null })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="correo">Correo</Label>
              <Input id="correo" value={cliente.correo} onChange={(e) => editarCliente({ correo: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="telefono">Teléfono</Label>
              <Input id="telefono" value={cliente.telefono} onChange={(e) => editarCliente({ telefono: e.target.value })} />
            </div>
            <div className="sm:col-span-2">
              <CampoDireccion
                valor={cliente.direccion}
                alCambiar={(direccion) => editarCliente({ direccion })}
                alElegirLugar={setLugarElegido}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="km">Km desde San Juan del Río</Label>
              <Input
                id="km"
                inputMode="decimal"
                value={cliente.kmDesdeSjr}
                onChange={(e) => ponerKm(e.target.value)}
                placeholder="58.6"
              />
              <p className="text-xs text-muted-foreground">
                Un solo trayecto (no ida y vuelta). Se guarda con el cliente y pasa solo al campo “Km por trayecto”
                del paso de Operación, donde se usa para calcular la gasolina.
              </p>
              <CalcularKm direccion={cliente.direccion} lugar={lugarElegido} alUsar={ponerKm} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="zona">Zona</Label>
              <Select
                id="zona"
                value={cliente.zona}
                onChange={(e) => {
                  const zona = e.target.value as "local" | "foraneo";
                  editarCliente({ zona });
                  cambiar((b) => ({
                    ...b,
                    entrada: { ...b.entrada, operacion: { ...b.entrada.operacion, viaticos: { ...b.entrada.operacion.viaticos, tipo: zona } } },
                  }));
                }}
              >
                {ZONAS.map((z) => (
                  <option key={z} value={z}>
                    {ETIQUETA_ZONA[z]}
                  </option>
                ))}
              </Select>
              <p className="text-xs text-muted-foreground">
                Fija el tipo de viáticos ($250 local o $500 foráneo) en Operación. Puedes cambiarlo ahí si este
                proyecto es distinto.
              </p>
            </div>
          </div>

          {sugerencias.length > 0 && (
            <div className="space-y-2 rounded-md border bg-muted/40 p-3">
              <p className="text-xs text-muted-foreground">¿Es alguno de estos? Se llenan sus datos.</p>
              <div className="flex flex-wrap gap-2">
                {sugerencias.map((c) => (
                  <Button key={c.id} type="button" size="sm" variant="outline" onClick={() => usarCliente(c)}>
                    {c.empresa ?? c.nombreContacto}
                    {c.empresa && <span className="text-muted-foreground"> · {c.nombreContacto}</span>}
                  </Button>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// Paso 2 -------------------------------------------------------------------------------------

export function PasoLevantamiento({ borrador, cambiar }: Props) {
  const { areas, filas } = borrador.entrada.levantamiento;
  const [pegado, setPegado] = useState<string | null>(null);
  // Texto tal cual se escribe. Separado del array de áreas: si no, la coma que abre
  // el siguiente nombre crea de inmediato una columna vacía ("Área 2") antes de escribirlo.
  const [areasTexto, setAreasTexto] = useState(() => areas.join(", "));

  const editarLevantamiento = (cambios: Partial<BorradorCotizacion["entrada"]["levantamiento"]>) =>
    cambiar((b) => ({ ...b, entrada: { ...b.entrada, levantamiento: { ...b.entrada.levantamiento, ...cambios } } }));

  const editarFila = (indice: number, cambios: Partial<(typeof filas)[number]>) =>
    editarLevantamiento({ filas: filas.map((f, i) => (i === indice ? { ...f, ...cambios } : f)) });

  const totalPiezas = filas.reduce<number>((total, f) => total + f.cantidades.reduce<number>((s, c) => s + num(c), 0), 0);
  const totalM2 = filas.reduce(
    (total, f) => total + f.cantidades.reduce<number>((s, c) => s + num(c), 0) * num(f.anchoM) * num(f.altoM),
    0,
  );

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="space-y-4 pt-6">
          <div className="flex flex-wrap items-end gap-2">
            <div className="flex-1 space-y-2">
              <Label htmlFor="areas">Áreas</Label>
              <Input
                id="areas"
                value={areasTexto}
                onChange={(e) => {
                  const texto = e.target.value;
                  setAreasTexto(texto);
                  // Un nombre vacío (p. ej. justo después de escribir la coma) no crea columna todavía.
                  const nuevas = texto.split(",").map((a) => a.trim()).filter((a) => a !== "");
                  if (nuevas.length === 0) return;
                  editarLevantamiento({
                    areas: nuevas,
                    filas: filas.map((f) => ({
                      ...f,
                      cantidades: Array.from({ length: nuevas.length }, (_, i) => f.cantidades[i] ?? ""),
                    })),
                  });
                }}
                placeholder="CENDI, Primaria, Secundaria"
              />
              <p className="text-xs text-muted-foreground">
                Sepáralas con coma. Cada área es una columna de cantidades. Si el material se cobra por pieza y no
                por m², deja ancho y alto en 0: solo importa la cantidad.
              </p>
            </div>
            <Button type="button" variant="outline" onClick={() => setPegado(pegado === null ? "" : null)}>
              <ClipboardPaste /> Pegar de Excel
            </Button>
            <ImportarLevantamiento
              alAplicar={(leido, modo) => {
                const filas = leido.filas.map((f) => ({
                  concepto: f.concepto,
                  anchoM: f.anchoM,
                  altoM: f.altoM,
                  cantidades: f.cantidades,
                }));
                const nuevo = { areas: leido.areas, filas };
                const final = modo === "reemplazar" ? nuevo : fusionarLevantamiento(borrador.entrada.levantamiento, nuevo);
                editarLevantamiento(final);
                setAreasTexto(final.areas.join(", "));
              }}
            />
          </div>

          {pegado !== null && (
            <div className="space-y-2">
              <Textarea
                value={pegado}
                onChange={(e) => setPegado(e.target.value)}
                placeholder={"Concepto\tAncho\tAlto\tCantidad área 1\tCantidad área 2"}
                className="min-h-28 font-mono text-xs"
              />
              <Button
                type="button"
                size="sm"
                onClick={() => {
                  const nuevas = filasDesdeTsv(pegado, areas.length);
                  if (nuevas.length) editarLevantamiento({ filas: nuevas });
                  setPegado(null);
                }}
              >
                Reemplazar tabla con lo pegado
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Concepto</th>
                <th className="px-3 py-2 font-medium">Ancho (m)</th>
                <th className="px-3 py-2 font-medium">Alto (m)</th>
                {areas.map((area, i) => (
                  <th key={`${area}-${i}`} className="px-3 py-2 font-medium">
                    {area || `Área ${i + 1}`}
                  </th>
                ))}
                <th className="px-3 py-2 text-right font-medium">m²</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {filas.map((fila, i) => {
                const piezas = fila.cantidades.reduce<number>((s, c) => s + num(c), 0);
                const m2 = piezas * num(fila.anchoM) * num(fila.altoM);
                return (
                  <tr key={i}>
                    <td className="px-3 py-2">
                      <Input
                        className="h-9 min-w-40"
                        value={fila.concepto}
                        onChange={(e) => editarFila(i, { concepto: e.target.value })}
                        aria-label={`Concepto de la fila ${i + 1}`}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <Input
                        className="h-9 w-24"
                        inputMode="decimal"
                        value={txt(fila.anchoM)}
                        onChange={(e) => editarFila(i, { anchoM: e.target.value })}
                        aria-label={`Ancho de la fila ${i + 1}`}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <Input
                        className="h-9 w-24"
                        inputMode="decimal"
                        value={txt(fila.altoM)}
                        onChange={(e) => editarFila(i, { altoM: e.target.value })}
                        aria-label={`Alto de la fila ${i + 1}`}
                      />
                    </td>
                    {areas.map((area, j) => (
                      <td key={`${area}-${j}`} className="px-3 py-2">
                        <Input
                          className="h-9 w-20"
                          inputMode="numeric"
                          value={txt(fila.cantidades[j])}
                          onChange={(e) =>
                            editarFila(i, {
                              cantidades: fila.cantidades.map((c, k) => (k === j ? e.target.value : c)),
                            })
                          }
                          aria-label={`Cantidad de ${area || `área ${j + 1}`} en la fila ${i + 1}`}
                        />
                      </td>
                    ))}
                    <td className="px-3 py-2 text-right text-xs text-muted-foreground">
                      {piezas} pzas · {m2.toFixed(2)} m²
                    </td>
                    <td className="px-3 py-2">
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        title="Quitar fila"
                        onClick={() => editarLevantamiento({ filas: filas.filter((_, k) => k !== i) })}
                      >
                        <Trash2 />
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="bg-muted/40 text-sm font-medium">
              <tr>
                <td className="px-3 py-2" colSpan={3 + areas.length}>
                  Total
                </td>
                <td className="px-3 py-2 text-right">
                  {totalPiezas} pzas · {totalM2.toFixed(2)} m²
                </td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      </Card>

      <Button
        type="button"
        variant="outline"
        onClick={() =>
          editarLevantamiento({
            filas: [...filas, { concepto: "", anchoM: "0", altoM: "0", cantidades: areas.map(() => "") }],
          })
        }
      >
        <Plus /> Agregar fila
      </Button>
    </div>
  );
}

// Paso 3 -------------------------------------------------------------------------------------

export function PasoMateriales({
  borrador,
  cambiar,
  recetas,
  asegurarGuardado,
}: Props & { recetas: RecetaOpcion[]; asegurarGuardado: () => Promise<string | null> }) {
  const elegidas = borrador.entrada.opciones.map((o) => o.recetaId);

  const alternar = (id: string) =>
    cambiar((b) => {
      const opciones = b.entrada.opciones.some((o) => o.recetaId === id)
        ? b.entrada.opciones.filter((o) => o.recetaId !== id)
        : [...b.entrada.opciones, { recetaId: id, precioUnitarioManual: "" }];
      return { ...b, entrada: { ...b.entrada, opciones } };
    });

  return (
    <div className="space-y-6">
      <div>
        <h3 className="font-medium">Opciones de material</h3>
        <p className="text-sm text-muted-foreground">Cada receta que elijas es una opción de precio y una página del PDF.</p>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {recetas.map((receta) => {
          const activa = elegidas.includes(receta.id);
          return (
            <button
              key={receta.id}
              type="button"
              disabled={!receta.cotizable}
              onClick={() => alternar(receta.id)}
              className={cn(
                "rounded-xl border p-4 text-left transition-colors",
                activa ? "border-accent bg-accent/10" : "bg-card hover:bg-muted",
                !receta.cotizable && "cursor-not-allowed opacity-60",
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-medium">{receta.nombre}</p>
                  <p className="text-xs text-muted-foreground">{ETIQUETA_FAMILIA[receta.familia]}</p>
                </div>
                {activa && <Badge variant="accent">Elegida</Badge>}
              </div>
              {receta.descripcionPdf && <p className="mt-2 text-sm text-muted-foreground">{receta.descripcionPdf}</p>}
              {!receta.cotizable && <p className="mt-2 text-xs text-destructive">{receta.motivo}</p>}
            </button>
          );
        })}
      </div>

      <Card>
        <CardContent className="grid gap-4 pt-6 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="tiempo">Tiempo estimado</Label>
            <Input
              id="tiempo"
              value={txt(borrador.entrada.tiempoEstimado)}
              onChange={(e) =>
                cambiar((b) => ({ ...b, entrada: { ...b.entrada, tiempoEstimado: e.target.value } }))
              }
              placeholder="5-7 días"
            />
            <p className="text-xs text-muted-foreground">
              Un solo texto para todo el proyecto (diseño, producción e instalación juntos). Tú lo escribes; no se
              calcula de los días que captures en Operación. Se repite igual en cada página del PDF.
            </p>
          </div>
          <div className="pt-8">
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={borrador.entrada.incluyeEnvio}
                onChange={(e) => cambiar((b) => ({ ...b, entrada: { ...b.entrada, incluyeEnvio: e.target.checked } }))}
              />
              Incluye envío
            </label>
            <p className="mt-1 text-xs text-muted-foreground">
              Márcalo si se manda el material aunque no haya instalación: así se calculan viáticos, gasolina y
              casetas del viaje de entrega en el paso de Operación.
            </p>
          </div>
        </CardContent>
      </Card>

      {borrador.entrada.opciones.length > 0 && (
        <div className="space-y-3">
          <div>
            <h3 className="font-medium">Fotos para el PDF</h3>
            <p className="text-sm text-muted-foreground">
              Opcional. La foto sale debajo de la tabla de precios, en la página de esa opción (por ejemplo, cómo se
              ve el material terminado). Se reduce sola antes de subirse; puedes usar una foto del celular.
            </p>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {borrador.entrada.opciones.map((opcion) => (
              <FotoOpcion
                key={opcion.recetaId}
                nombre={recetas.find((r) => r.id === opcion.recetaId)?.nombre ?? "Opción"}
                cotizacionId={borrador.id ?? null}
                imagenId={opcion.imagenId ?? null}
                asegurarGuardado={asegurarGuardado}
                alCambiar={(imagenId) =>
                  cambiar((b) => ({
                    ...b,
                    entrada: {
                      ...b.entrada,
                      opciones: b.entrada.opciones.map((o) => (o.recetaId === opcion.recetaId ? { ...o, imagenId } : o)),
                    },
                  }))
                }
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function FotoOpcion({
  nombre,
  cotizacionId,
  imagenId,
  asegurarGuardado,
  alCambiar,
}: {
  nombre: string;
  cotizacionId: string | null;
  imagenId: string | null;
  asegurarGuardado: () => Promise<string | null>;
  alCambiar: (imagenId: string | null) => void;
}) {
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function elegir(archivo: File | undefined) {
    if (!archivo) return;
    setError(null);
    if (!archivo.type.startsWith("image/")) {
      setError("Elige una imagen (JPG, PNG o foto del celular).");
      return;
    }
    setSubiendo(true);
    try {
      // La imagen se liga a la cotización, así que necesita estar guardada.
      const id = cotizacionId ?? (await asegurarGuardado());
      if (!id) {
        setError("Guarda primero el borrador (título y contacto del cliente) para poder subir fotos.");
        return;
      }
      alCambiar(await subirImagenCotizacion(id, archivo));
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo subir la imagen.");
    } finally {
      setSubiendo(false);
    }
  }

  async function quitar() {
    if (cotizacionId && imagenId) {
      // Si falla el borrado en el servidor, igual se quita de la cotización: no sale en el PDF.
      await fetch(`/api/cotizaciones/${cotizacionId}/imagenes/${imagenId}`, { method: "DELETE" }).catch(() => null);
    }
    alCambiar(null);
  }

  return (
    <Card>
      <CardContent className="space-y-3 pt-6">
        <p className="text-sm font-medium">{nombre}</p>
        {imagenId && cotizacionId ? (
          <div className="space-y-2">
            {/* eslint-disable-next-line @next/next/no-img-element -- imagen privada servida por la API, sin optimizar */}
            <img
              src={`/api/cotizaciones/${cotizacionId}/imagenes/${imagenId}`}
              alt={`Foto de ${nombre}`}
              className="max-h-48 w-full rounded-md border object-contain"
            />
            <div className="flex gap-2">
              <Label className="cursor-pointer text-sm text-accent underline-offset-4 hover:underline">
                <ImagePlus className="mr-1 inline size-4" />
                Cambiar
                <input
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  disabled={subiendo}
                  onChange={(e) => elegir(e.target.files?.[0])}
                />
              </Label>
              <Button type="button" variant="ghost" size="sm" onClick={quitar}>
                <Trash2 /> Quitar
              </Button>
            </div>
          </div>
        ) : (
          <label
            className={cn(
              "flex cursor-pointer flex-col items-center justify-center gap-1 rounded-md border border-dashed p-6 text-sm text-muted-foreground hover:bg-muted",
              subiendo && "pointer-events-none opacity-60",
            )}
          >
            {subiendo ? <Loader2 className="size-5 animate-spin" /> : <ImagePlus className="size-5" />}
            {subiendo ? "Subiendo…" : "Agregar foto"}
            <input
              type="file"
              accept="image/*"
              className="sr-only"
              disabled={subiendo}
              onChange={(e) => elegir(e.target.files?.[0])}
            />
          </label>
        )}
        {error && <p className="text-xs text-destructive">{error}</p>}
      </CardContent>
    </Card>
  );
}
