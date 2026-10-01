"use client";

import { Archive, ArchiveRestore, Pencil, Plus, RefreshCw, Search, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { type ReactNode, useState, useTransition } from "react";
import { useAvisos } from "@/components/avisos";
import { Modal } from "@/components/modal";
import { PantallaCarga } from "@/components/pantalla-carga";
import { Button, Card, Checkbox, Input, Label, Select, Textarea } from "@/components/ui";
import { llamarApi } from "@/lib/utils";

export type Campo = {
  nombre: string;
  etiqueta: string;
  tipo?: "texto" | "numero" | "select" | "checkbox" | "textarea" | "url" | "fecha";
  opciones?: { valor: string; etiqueta: string }[];
  requerido?: boolean;
  ayuda?: string;
  anchoCompleto?: boolean;
};

export type Columna<T> = { titulo: string; celda: (fila: T) => ReactNode; className?: string };

type Props<T extends { id: string }> = {
  filas: T[];
  columnas: Columna<T>[];
  campos: Campo[];
  /** Valores del formulario: sin fila = alta nueva. */
  valores: (fila?: T) => Record<string, string | boolean>;
  endpoint: string;
  etiquetaNueva: string;
  puedeEditar: boolean;
  texto: (fila: T) => string;
  /** Cómo se nombra la fila en avisos y confirmaciones (por defecto, el texto de búsqueda). */
  nombreDe?: (fila: T) => string;
  archivable?: boolean;
  esArchivado?: (fila: T) => boolean;
  /** Muestra el botón de eliminar (DELETE al endpoint), con confirmación. */
  eliminable?: boolean;
  /** Texto de la confirmación al eliminar: qué pasa y qué conviene hacer si se usa. */
  avisoEliminar?: string;
  vacio?: string;
  /** Título de la ventana del formulario: sin fila = alta nueva. */
  tituloFormulario?: (fila?: T) => string;
  /** Opciones de un select que dependen de la fila (p. ej. conservar una categoría antigua). */
  opcionesDe?: (campo: string, fila?: T) => { valor: string; etiqueta: string }[] | undefined;
};

/**
 * Tabla + formulario para las entidades simples del catálogo (insumos y clientes).
 * Toda la validación real ocurre en el servidor; aquí solo se muestran sus mensajes.
 */
export function PanelCrud<T extends { id: string }>({
  filas,
  columnas,
  campos,
  valores,
  endpoint,
  etiquetaNueva,
  puedeEditar,
  texto,
  nombreDe = texto,
  archivable = false,
  esArchivado = () => false,
  eliminable = false,
  avisoEliminar = "Se borra para siempre; no se puede deshacer.",
  vacio = "Sin registros.",
  tituloFormulario,
  opcionesDe,
}: Props<T>) {
  const router = useRouter();
  const [actualizando, iniciarTransicion] = useTransition();
  const [ocupado, setOcupado] = useState(false);
  const avisar = useAvisos();
  const [busqueda, setBusqueda] = useState("");
  const [verArchivados, setVerArchivados] = useState(false);
  const [editando, setEditando] = useState<T | "nuevo" | null>(null);
  const [porEliminar, setPorEliminar] = useState<T | null>(null);

  const visibles = filas.filter((f) => {
    if (!verArchivados && esArchivado(f)) return false;
    const q = busqueda.trim().toLowerCase();
    return q === "" || texto(f).toLowerCase().includes(q);
  });

  async function guardar(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const formulario = evento.currentTarget;
    const datos = new FormData(formulario);
    const cuerpo: Record<string, string | boolean> = {};
    for (const campo of campos) {
      cuerpo[campo.nombre] = campo.tipo === "checkbox" ? datos.get(campo.nombre) === "on" : String(datos.get(campo.nombre) ?? "");
    }
    const esNuevo = editando === "nuevo";
    setOcupado(true);
    try {
      await llamarApi(esNuevo ? endpoint : `${endpoint}/${(editando as T).id}`, esNuevo ? "POST" : "PATCH", cuerpo);
      avisar({ tipo: "ok", texto: esNuevo ? "Registro creado." : "Cambios guardados." });
      setEditando(null);
      iniciarTransicion(() => router.refresh());
    } catch (e) {
      avisar({ tipo: "error", texto: e instanceof Error ? e.message : "No se pudo guardar." });
    } finally {
      setOcupado(false);
    }
  }

  async function alternarArchivado(fila: T) {
    const archivar = !esArchivado(fila);
    setOcupado(true);
    try {
      await llamarApi(`${endpoint}/${fila.id}`, "PATCH", { archivado: archivar });
      avisar({ tipo: "ok", texto: archivar ? "Registro archivado." : "Registro restaurado." });
      iniciarTransicion(() => router.refresh());
    } catch (e) {
      avisar({ tipo: "error", texto: e instanceof Error ? e.message : "No se pudo archivar." });
    } finally {
      setOcupado(false);
    }
  }

  async function eliminar(fila: T) {
    setOcupado(true);
    try {
      await llamarApi(`${endpoint}/${fila.id}`, "DELETE");
      avisar({ tipo: "ok", texto: `"${nombreDe(fila)}" se eliminó.` });
      setPorEliminar(null);
      iniciarTransicion(() => router.refresh());
    } catch (e) {
      // P. ej. un insumo que usan cotizaciones: el mensaje dice cuáles y que conviene archivarlo.
      avisar({ tipo: "error", texto: e instanceof Error ? e.message : "No se pudo eliminar." });
      setPorEliminar(null);
    } finally {
      setOcupado(false);
    }
  }

  const deshabilitado = ocupado || actualizando;
  const valoresFormulario = editando ? valores(editando === "nuevo" ? undefined : editando) : {};

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-52 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar…"
            className="pl-9"
            aria-label="Buscar"
          />
        </div>
        {archivable && (
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <Checkbox checked={verArchivados} onChange={(e) => setVerArchivados(e.target.checked)} />
            Ver archivados
          </label>
        )}
        {puedeEditar && (
          <Button variant="accent" onClick={() => setEditando("nuevo")}>
            <Plus /> {etiquetaNueva}
          </Button>
        )}
        {actualizando && <RefreshCw className="size-4 animate-spin text-muted-foreground" aria-label="Actualizando" />}
      </div>

      {ocupado && <PantallaCarga mensaje={porEliminar ? "Eliminando…" : "Guardando…"} />}

      {porEliminar && (
        <Modal titulo="¿Eliminar?" alCerrar={() => setPorEliminar(null)}>
          <div className="space-y-4">
            <p className="text-sm">
              <span className="font-medium">{nombreDe(porEliminar)}</span>
            </p>
            <p className="text-sm text-muted-foreground">{avisoEliminar}</p>
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
        <Modal
          titulo={tituloFormulario?.(editando === "nuevo" ? undefined : editando) ?? (editando === "nuevo" ? etiquetaNueva : "Editar")}
          alCerrar={() => setEditando(null)}
        >
            <form
              key={editando === "nuevo" ? "nuevo" : editando.id}
              onSubmit={guardar}
              className="grid gap-4 sm:grid-cols-2"
            >
              {campos.map((campo) => {
                const id = `${campo.nombre}-${editando === "nuevo" ? "nuevo" : editando.id}`;
                const valor = valoresFormulario[campo.nombre];
                return (
                  <div key={campo.nombre} className={`space-y-2 ${campo.anchoCompleto ? "sm:col-span-2" : ""}`}>
                    {campo.tipo === "checkbox" ? (
                      <label className="flex items-center gap-2 pt-6 text-sm">
                        <Checkbox id={id} name={campo.nombre} defaultChecked={Boolean(valor)} />
                        {campo.etiqueta}
                      </label>
                    ) : (
                      <>
                        <Label htmlFor={id}>
                          {campo.etiqueta}
                          {campo.requerido && <span className="text-destructive"> *</span>}
                        </Label>
                        {campo.tipo === "select" ? (
                          <Select id={id} name={campo.nombre} defaultValue={String(valor ?? "")} required={campo.requerido}>
                            {campo.requerido && !valor && <option value="">Elige una…</option>}
                            {(opcionesDe?.(campo.nombre, editando === "nuevo" ? undefined : editando) ?? campo.opciones)?.map((o) => (
                              <option key={o.valor} value={o.valor}>
                                {o.etiqueta}
                              </option>
                            ))}
                          </Select>
                        ) : campo.tipo === "textarea" ? (
                          <Textarea id={id} name={campo.nombre} defaultValue={String(valor ?? "")} />
                        ) : (
                          <Input
                            id={id}
                            name={campo.nombre}
                            defaultValue={String(valor ?? "")}
                            required={campo.requerido}
                            type={campo.tipo === "fecha" ? "date" : "text"}
                            inputMode={campo.tipo === "numero" ? "decimal" : undefined}
                          />
                        )}
                      </>
                    )}
                    {campo.ayuda && <p className="text-xs text-muted-foreground">{campo.ayuda}</p>}
                  </div>
                );
              })}
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

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                {columnas.map((c) => (
                  <th key={c.titulo} className={`px-4 py-3 font-medium ${c.className ?? ""}`}>
                    {c.titulo}
                  </th>
                ))}
                {puedeEditar && <th className="px-4 py-3 text-right font-medium">Acciones</th>}
              </tr>
            </thead>
            <tbody className="divide-y">
              {visibles.length === 0 && (
                <tr>
                  <td colSpan={columnas.length + 1} className="px-4 py-8 text-center text-muted-foreground">
                    {vacio}
                  </td>
                </tr>
              )}
              {visibles.map((fila) => (
                <tr key={fila.id} className={esArchivado(fila) ? "bg-muted/30 text-muted-foreground" : ""}>
                  {columnas.map((c) => (
                    <td key={c.titulo} className={`px-4 py-3 align-top ${c.className ?? ""}`}>
                      {c.celda(fila)}
                    </td>
                  ))}
                  {puedeEditar && (
                    <td className="px-4 py-3 align-top">
                      <div className="flex justify-end gap-2">
                        <Button size="sm" variant="outline" disabled={deshabilitado} onClick={() => setEditando(fila)}>
                          <Pencil /> Editar
                        </Button>
                        {archivable && (
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={deshabilitado}
                            title={esArchivado(fila) ? "Restaurar" : "Archivar"}
                            onClick={() => alternarArchivado(fila)}
                          >
                            {esArchivado(fila) ? <ArchiveRestore /> : <Archive />}
                          </Button>
                        )}
                        {eliminable && (
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={deshabilitado}
                            title="Eliminar"
                            aria-label={`Eliminar ${nombreDe(fila)}`}
                            className="text-destructive hover:bg-destructive/10"
                            onClick={() => setPorEliminar(fila)}
                          >
                            <Trash2 />
                          </Button>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
