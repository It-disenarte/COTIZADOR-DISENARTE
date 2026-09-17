"use client";

import { Archive, ArchiveRestore, Pencil, Plus, RefreshCw, Search, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { type ReactNode, useState, useTransition } from "react";
import { Aviso, Button, Card, CardContent, Checkbox, Input, Label, Select, Textarea } from "@/components/ui";
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
  archivable?: boolean;
  esArchivado?: (fila: T) => boolean;
  vacio?: string;
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
  archivable = false,
  esArchivado = () => false,
  vacio = "Sin registros.",
}: Props<T>) {
  const router = useRouter();
  const [actualizando, iniciarTransicion] = useTransition();
  const [ocupado, setOcupado] = useState(false);
  const [mensaje, setMensaje] = useState<{ tipo: "ok" | "error"; texto: string } | null>(null);
  const [busqueda, setBusqueda] = useState("");
  const [verArchivados, setVerArchivados] = useState(false);
  const [editando, setEditando] = useState<T | "nuevo" | null>(null);

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
    setMensaje(null);
    try {
      await llamarApi(esNuevo ? endpoint : `${endpoint}/${(editando as T).id}`, esNuevo ? "POST" : "PATCH", cuerpo);
      setMensaje({ tipo: "ok", texto: esNuevo ? "Registro creado." : "Cambios guardados." });
      setEditando(null);
      iniciarTransicion(() => router.refresh());
    } catch (e) {
      setMensaje({ tipo: "error", texto: e instanceof Error ? e.message : "No se pudo guardar." });
    } finally {
      setOcupado(false);
    }
  }

  async function alternarArchivado(fila: T) {
    const archivar = !esArchivado(fila);
    setOcupado(true);
    setMensaje(null);
    try {
      await llamarApi(`${endpoint}/${fila.id}`, "PATCH", { archivado: archivar });
      setMensaje({ tipo: "ok", texto: archivar ? "Registro archivado." : "Registro restaurado." });
      iniciarTransicion(() => router.refresh());
    } catch (e) {
      setMensaje({ tipo: "error", texto: e instanceof Error ? e.message : "No se pudo archivar." });
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
          <Button variant={editando === "nuevo" ? "outline" : "accent"} onClick={() => setEditando(editando === "nuevo" ? null : "nuevo")}>
            {editando === "nuevo" ? <X /> : <Plus />} {editando === "nuevo" ? "Cancelar" : etiquetaNueva}
          </Button>
        )}
        {actualizando && <RefreshCw className="size-4 animate-spin text-muted-foreground" aria-label="Actualizando" />}
      </div>

      {mensaje && <Aviso tipo={mensaje.tipo}>{mensaje.texto}</Aviso>}

      {editando && (
        <Card>
          <CardContent className="pt-6">
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
                          <Select id={id} name={campo.nombre} defaultValue={String(valor ?? "")}>
                            {campo.opciones?.map((o) => (
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
              <div className="flex gap-2 sm:col-span-2">
                <Button type="submit" disabled={deshabilitado}>
                  Guardar
                </Button>
                <Button type="button" variant="ghost" onClick={() => setEditando(null)}>
                  Cancelar
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
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
