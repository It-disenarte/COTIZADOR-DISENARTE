"use client";

import { ChevronDown, ChevronRight, GripVertical, MapPin, Pencil, Phone, Plus, Search, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useAvisos } from "@/components/avisos";
import { Modal } from "@/components/modal";
import { PantallaCarga } from "@/components/pantalla-carga";
import { Badge, Button, Card, Input, Label, Select, Textarea } from "@/components/ui";
import type { Insumo } from "@/lib/servicios/insumos";
import type { Proveedor } from "@/lib/servicios/proveedores";
import { cn, llamarApi } from "@/lib/utils";
import { MiniaturaInsumo } from "./imagen-insumo";

const TIPO_ARRASTRE = "application/x-insumo-proveedor";

/**
 * Proveedores a la izquierda, insumos a la derecha. Se arrastra un insumo a un proveedor para decir "esto se lo
 * compramos a este". Un insumo puede tener varios proveedores: arrastrarlo agrega uno, no reemplaza. La X lo quita.
 * Cada insumo también tiene un selector para agregar proveedor, por si no se puede arrastrar (celular).
 */
export function ProveedoresCatalogo({
  proveedores,
  insumos,
  puedeEditar,
}: {
  proveedores: Proveedor[];
  insumos: Insumo[];
  puedeEditar: boolean;
}) {
  const router = useRouter();
  const avisar = useAvisos();
  const [actualizando, iniciarTransicion] = useTransition();
  const [ocupado, setOcupado] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const [soloSinProveedor, setSoloSinProveedor] = useState(false);
  const [sobre, setSobre] = useState<string | null>(null);
  const [abiertos, setAbiertos] = useState<Set<string>>(new Set());
  const [editando, setEditando] = useState<Proveedor | "nuevo" | null>(null);
  const [porEliminar, setPorEliminar] = useState<Proveedor | null>(null);

  const activos = insumos.filter((i) => !i.archivado);
  const q = busqueda.trim().toLowerCase();
  const visibles = activos.filter(
    (i) =>
      (!soloSinProveedor || !i.proveedores?.length) &&
      (q === "" || `${i.nombre} ${i.categoria} ${i.proveedores?.map((p) => p.nombre).join(" ") ?? ""}`.toLowerCase().includes(q)),
  );
  const sinProveedor = activos.filter((i) => !i.proveedores?.length).length;

  const loSurte = (insumo: Insumo, proveedorId: string) => !!insumo.proveedores?.some((p) => p.id === proveedorId);

  /** Agrega o quita un proveedor de un insumo; los demás proveedores del insumo no se tocan. */
  async function vincular(insumoId: string, proveedorId: string, agregar: boolean) {
    const insumo = insumos.find((i) => i.id === insumoId);
    const proveedor = proveedores.find((p) => p.id === proveedorId);
    if (!insumo || !proveedor) return;
    if (loSurte(insumo, proveedorId) === agregar) {
      if (agregar) avisar({ tipo: "ok", texto: `${proveedor.nombre} ya surte "${insumo.nombre}".` });
      return;
    }
    setOcupado(true);
    try {
      await llamarApi(`/api/proveedores/${proveedorId}/insumos/${insumoId}`, agregar ? "PUT" : "DELETE");
      avisar({
        tipo: "ok",
        texto: agregar ? `"${insumo.nombre}" se compra con ${proveedor.nombre}.` : `${proveedor.nombre} ya no surte "${insumo.nombre}".`,
      });
      iniciarTransicion(() => router.refresh());
    } catch (e) {
      avisar({ tipo: "error", texto: e instanceof Error ? e.message : "No se pudo guardar el proveedor." });
    } finally {
      setOcupado(false);
    }
  }

  async function guardar(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const datos = new FormData(evento.currentTarget);
    const cuerpo = {
      nombre: String(datos.get("nombre") ?? ""),
      contacto: String(datos.get("contacto") ?? ""),
      ubicacion: String(datos.get("ubicacion") ?? ""),
      confiable: datos.get("confiable") === "si",
      comentario: String(datos.get("comentario") ?? ""),
    };
    const esNuevo = editando === "nuevo";
    setOcupado(true);
    try {
      await llamarApi(esNuevo ? "/api/proveedores" : `/api/proveedores/${(editando as Proveedor).id}`, esNuevo ? "POST" : "PATCH", cuerpo);
      avisar({ tipo: "ok", texto: esNuevo ? "Proveedor creado." : "Cambios guardados." });
      setEditando(null);
      iniciarTransicion(() => router.refresh());
    } catch (e) {
      avisar({ tipo: "error", texto: e instanceof Error ? e.message : "No se pudo guardar." });
    } finally {
      setOcupado(false);
    }
  }

  async function eliminar(proveedor: Proveedor) {
    setOcupado(true);
    try {
      await llamarApi(`/api/proveedores/${proveedor.id}`, "DELETE");
      avisar({ tipo: "ok", texto: `"${proveedor.nombre}" se eliminó.` });
      iniciarTransicion(() => router.refresh());
    } catch (e) {
      avisar({ tipo: "error", texto: e instanceof Error ? e.message : "No se pudo eliminar." });
    } finally {
      setPorEliminar(null);
      setOcupado(false);
    }
  }

  const alternar = (id: string) =>
    setAbiertos((previo) => {
      const siguiente = new Set(previo);
      if (!siguiente.delete(id)) siguiente.add(id);
      return siguiente;
    });

  /** Props para que la ficha de un proveedor reciba insumos soltados encima. */
  const zona = (proveedorId: string) => ({
    onDragOver: (e: React.DragEvent) => {
      if (!puedeEditar || !e.dataTransfer.types.includes(TIPO_ARRASTRE)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
      setSobre(proveedorId);
    },
    onDragLeave: () => setSobre((actual) => (actual === proveedorId ? null : actual)),
    onDrop: (e: React.DragEvent) => {
      const id = e.dataTransfer.getData(TIPO_ARRASTRE);
      setSobre(null);
      if (!id) return;
      e.preventDefault();
      void vincular(id, proveedorId, true);
    },
  });

  const deshabilitado = ocupado || actualizando;
  const proveedorEnFormulario = editando && editando !== "nuevo" ? editando : undefined;

  return (
    <div className="space-y-4">
      {ocupado && <PantallaCarga mensaje="Guardando…" />}
      {puedeEditar && (
        <p className="text-sm text-muted-foreground">
          Arrastra un insumo (columna derecha) sobre un proveedor para decir que se lo compramos a él. Un mismo insumo puede tener varios
          proveedores.
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Proveedores */}
        <section className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-medium">Proveedores ({proveedores.length})</h2>
            {puedeEditar && (
              <Button variant="accent" size="sm" onClick={() => setEditando("nuevo")}>
                <Plus /> Nuevo proveedor
              </Button>
            )}
          </div>

          {proveedores.length === 0 && (
            <Card>
              <p className="px-4 py-8 text-center text-sm text-muted-foreground">
                Aún no hay proveedores.{puedeEditar ? " Agrega el primero con “Nuevo proveedor”." : ""}
              </p>
            </Card>
          )}

          {proveedores.map((p) => {
            const suyos = activos.filter((i) => loSurte(i, p.id));
            const abierto = abiertos.has(p.id);
            return (
              <Card
                key={p.id}
                {...zona(p.id)}
                className={cn("transition-colors", sobre === p.id && "border-accent bg-accent/10 ring-2 ring-accent")}
              >
                <div className="space-y-2 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 space-y-1">
                      <p className="font-medium">{p.nombre}</p>
                      <div className="flex flex-wrap gap-1">
                        <Badge variant={p.confiable ? "success" : "destructive"}>{p.confiable ? "Confiable" : "No confiable"}</Badge>
                        <Badge>{p.totalInsumos === 1 ? "1 insumo" : `${p.totalInsumos} insumos`}</Badge>
                      </div>
                    </div>
                    {puedeEditar && (
                      <div className="flex shrink-0 gap-1">
                        <Button size="sm" variant="outline" disabled={deshabilitado} onClick={() => setEditando(p)}>
                          <Pencil /> Editar
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={deshabilitado}
                          title="Eliminar"
                          aria-label={`Eliminar ${p.nombre}`}
                          className="text-destructive hover:bg-destructive/10"
                          onClick={() => setPorEliminar(p)}
                        >
                          <Trash2 />
                        </Button>
                      </div>
                    )}
                  </div>

                  {(p.contacto || p.ubicacion) && (
                    <div className="space-y-0.5 text-xs text-muted-foreground">
                      {p.contacto && (
                        <p className="flex items-start gap-1.5">
                          <Phone className="mt-0.5 size-3 shrink-0" /> <span className="whitespace-pre-line">{p.contacto}</span>
                        </p>
                      )}
                      {p.ubicacion && (
                        <p className="flex items-start gap-1.5">
                          <MapPin className="mt-0.5 size-3 shrink-0" /> <span className="whitespace-pre-line">{p.ubicacion}</span>
                        </p>
                      )}
                    </div>
                  )}
                  {p.comentario && <p className="whitespace-pre-line rounded-md bg-muted px-3 py-2 text-xs">{p.comentario}</p>}

                  <button
                    type="button"
                    onClick={() => alternar(p.id)}
                    className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
                    aria-expanded={abierto}
                  >
                    {abierto ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
                    Insumos que le compramos
                  </button>
                  {abierto &&
                    (suyos.length === 0 ? (
                      <p className="text-xs text-muted-foreground">Ninguno todavía: arrastra insumos aquí.</p>
                    ) : (
                      <ul className="divide-y rounded-md border">
                        {suyos.map((i) => (
                          <li key={i.id} className="flex items-center justify-between gap-2 px-3 py-1.5 text-xs">
                            <span className="min-w-0 truncate">
                              {i.nombre} <span className="text-muted-foreground">· {i.categoria}</span>
                            </span>
                            {puedeEditar && (
                              <button
                                type="button"
                                disabled={deshabilitado}
                                onClick={() => vincular(i.id, p.id, false)}
                                title="Quitar de este proveedor"
                                aria-label={`Quitar ${i.nombre} de ${p.nombre}`}
                                className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-destructive"
                              >
                                <X className="size-3.5" />
                              </button>
                            )}
                          </li>
                        ))}
                      </ul>
                    ))}
                </div>
              </Card>
            );
          })}

        </section>

        {/* Insumos */}
        <section className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-medium">Insumos ({activos.length})</h2>
            <span className="text-xs text-muted-foreground">{sinProveedor} sin proveedor</span>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative min-w-40 flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Buscar insumo…"
                className="pl-9"
                aria-label="Buscar insumo"
              />
            </div>
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <input type="checkbox" checked={soloSinProveedor} onChange={(e) => setSoloSinProveedor(e.target.checked)} />
              Solo sin proveedor
            </label>
          </div>

          <Card className="max-h-[70vh] overflow-y-auto">
            {visibles.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-muted-foreground">No hay insumos con ese filtro.</p>
            ) : (
              <ul className="divide-y">
                {visibles.map((i) => (
                  <li
                    key={i.id}
                    draggable={puedeEditar}
                    onDragStart={(e) => {
                      e.dataTransfer.setData(TIPO_ARRASTRE, i.id);
                      e.dataTransfer.effectAllowed = "copy";
                    }}
                    onDragEnd={() => setSobre(null)}
                    className={cn("flex items-center gap-3 px-3 py-2", puedeEditar && "cursor-grab active:cursor-grabbing")}
                  >
                    {puedeEditar && <GripVertical className="size-4 shrink-0 text-muted-foreground" aria-hidden />}
                    <MiniaturaInsumo insumoId={i.id} version={i.imagenVersion} className="size-10" />
                    <div className="min-w-0 flex-1 space-y-1">
                      <p className="truncate text-sm font-medium">{i.nombre}</p>
                      <p className="truncate text-xs text-muted-foreground">{i.categoria}</p>
                      <div className="flex flex-wrap gap-1">
                        {!i.proveedores?.length && <Badge variant="accent">Sin proveedor</Badge>}
                        {i.proveedores?.map((p) => (
                          <Badge key={p.id} className="gap-1">
                            {p.nombre}
                            {puedeEditar && (
                              <button
                                type="button"
                                disabled={deshabilitado}
                                onClick={() => vincular(i.id, p.id, false)}
                                title="Quitar proveedor"
                                aria-label={`Quitar ${p.nombre} de ${i.nombre}`}
                                className="rounded-full text-muted-foreground hover:text-destructive"
                              >
                                <X className="size-3" />
                              </button>
                            )}
                          </Badge>
                        ))}
                      </div>
                    </div>
                    {puedeEditar && proveedores.some((p) => !loSurte(i, p.id)) && (
                      <Select
                        value=""
                        disabled={deshabilitado}
                        onChange={(e) => e.target.value && vincular(i.id, e.target.value, true)}
                        aria-label={`Agregar proveedor a ${i.nombre}`}
                        className="h-8 w-36 shrink-0 text-xs"
                      >
                        <option value="">+ Proveedor…</option>
                        {proveedores
                          .filter((p) => !loSurte(i, p.id))
                          .map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.nombre}
                            </option>
                          ))}
                      </Select>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </section>
      </div>

      {porEliminar && (
        <Modal titulo="¿Eliminar proveedor?" alCerrar={() => setPorEliminar(null)}>
          <div className="space-y-4">
            <p className="text-sm font-medium">{porEliminar.nombre}</p>
            <p className="text-sm text-muted-foreground">
              Se borra el proveedor para siempre.{" "}
              {porEliminar.totalInsumos > 0
                ? `Sus insumos (${porEliminar.totalInsumos}) no se borran: solo dejan de tener a este proveedor.`
                : "No tiene insumos asignados."}
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="destructive" disabled={deshabilitado} onClick={() => eliminar(porEliminar)}>
                <Trash2 /> Eliminar
              </Button>
              <Button variant="ghost" onClick={() => setPorEliminar(null)}>
                Cancelar
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {editando && (
        <Modal titulo={proveedorEnFormulario ? `Editar ${proveedorEnFormulario.nombre}` : "Nuevo proveedor"} alCerrar={() => setEditando(null)}>
          <form key={proveedorEnFormulario?.id ?? "nuevo"} onSubmit={guardar} className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="prov-nombre">
                Nombre <span className="text-destructive">*</span>
              </Label>
              <Input id="prov-nombre" name="nombre" required defaultValue={proveedorEnFormulario?.nombre ?? ""} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="prov-contacto">Contacto recurrente</Label>
              <Textarea id="prov-contacto" name="contacto" defaultValue={proveedorEnFormulario?.contacto ?? ""} />
              <p className="text-xs text-muted-foreground">Con quién se habla y cómo: nombre, teléfono, WhatsApp o correo.</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="prov-ubicacion">Ubicación</Label>
              <Textarea id="prov-ubicacion" name="ubicacion" defaultValue={proveedorEnFormulario?.ubicacion ?? ""} />
              <p className="text-xs text-muted-foreground">Dirección o ciudad, para saber si conviene ir por el material.</p>
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="prov-confiable">¿Es confiable?</Label>
              <Select id="prov-confiable" name="confiable" defaultValue={proveedorEnFormulario && !proveedorEnFormulario.confiable ? "no" : "si"}>
                <option value="si">Proveedor confiable</option>
                <option value="no">Proveedor no confiable</option>
              </Select>
              <p className="text-xs text-muted-foreground">Solo orienta al equipo: no cambia ningún precio.</p>
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="prov-comentario">Comentario</Label>
              <Textarea id="prov-comentario" name="comentario" defaultValue={proveedorEnFormulario?.comentario ?? ""} />
              <p className="text-xs text-muted-foreground">Por qué es confiable o no, tiempos de entrega, condiciones de pago…</p>
            </div>
            <div className="flex justify-end gap-2 sm:col-span-2">
              <Button type="submit" disabled={deshabilitado}>
                Guardar
              </Button>
              <Button type="button" variant="ghost" onClick={() => setEditando(null)}>
                Cancelar
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
