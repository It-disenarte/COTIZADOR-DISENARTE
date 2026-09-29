"use client";

import { KeyRound, Pencil, Plus, RefreshCw, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useAvisos } from "@/components/avisos";
import { Modal } from "@/components/modal";
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Input, Label, Select } from "@/components/ui";
import { ETIQUETA_ROL } from "@/lib/permisos";
import { PASSWORD_MIN, ROLES, type Rol } from "@/lib/roles";
import { llamarApi } from "@/lib/utils";

type Usuario = {
  id: string;
  nombre: string;
  email: string;
  rol: Rol;
  activo: boolean;
  debeCambiarPassword: boolean;
  creadoEn: string;
};

/** Contraseña temporal legible (sin caracteres ambiguos). */
function generarTemporal(): string {
  const alfabeto = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const bytes = crypto.getRandomValues(new Uint32Array(14));
  return Array.from(bytes, (b) => alfabeto[b % alfabeto.length]).join("");
}

export function PanelUsuarios({ usuarios, idActual }: { usuarios: Usuario[]; idActual: string }) {
  const router = useRouter();
  const [actualizando, iniciarTransicion] = useTransition();
  const avisar = useAvisos();
  /** Cuenta cuyos datos (nombre y correo) se están editando en la ventana. */
  const [editando, setEditando] = useState<Usuario | null>(null);
  const [creando, setCreando] = useState(false);
  const [restableciendo, setRestableciendo] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  async function ejecutar(accion: () => Promise<unknown>, exito: string) {
    setOcupado(true);
    try {
      await accion();
      avisar({ tipo: "ok", texto: exito });
      iniciarTransicion(() => router.refresh());
      return true;
    } catch (e) {
      avisar({ tipo: "error", texto: e instanceof Error ? e.message : "Algo salió mal." });
      return false;
    } finally {
      setOcupado(false);
    }
  }

  async function crear(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const formulario = evento.currentTarget;
    const datos = Object.fromEntries(new FormData(formulario));
    const ok = await ejecutar(
      () => llamarApi("/api/usuarios", "POST", datos),
      `Cuenta creada para ${datos.email}. Comparte la contraseña temporal por un canal seguro.`,
    );
    if (ok) {
      formulario.reset();
      setCreando(false);
    }
  }

  async function restablecer(evento: React.FormEvent<HTMLFormElement>, usuario: Usuario) {
    evento.preventDefault();
    const passwordTemporal = String(new FormData(evento.currentTarget).get("passwordTemporal"));
    const ok = await ejecutar(
      () => llamarApi(`/api/usuarios/${usuario.id}/password`, "POST", { passwordTemporal }),
      `Contraseña de ${usuario.nombre} restablecida. Deberá cambiarla al entrar.`,
    );
    if (ok) setRestableciendo(null);
  }

  async function guardarDatos(evento: React.FormEvent<HTMLFormElement>, usuario: Usuario) {
    evento.preventDefault();
    const datos = new FormData(evento.currentTarget);
    const nombre = String(datos.get("nombre") ?? "").trim();
    const email = String(datos.get("email") ?? "").trim().toLowerCase();
    // Solo se manda lo que cambió.
    const cambios = {
      ...(nombre !== usuario.nombre && { nombre }),
      ...(email !== usuario.email && { email }),
    };
    if (Object.keys(cambios).length === 0) {
      setEditando(null);
      return;
    }
    const ok = await ejecutar(
      () => llamarApi(`/api/usuarios/${usuario.id}`, "PATCH", cambios),
      cambios.email
        ? `Datos de ${nombre} guardados. Desde ahora inicia sesión con ${email}; su contraseña no cambió.`
        : `Datos de ${nombre} guardados.`,
    );
    if (ok) setEditando(null);
  }

  const deshabilitado = ocupado || actualizando;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant={creando ? "outline" : "accent"} onClick={() => setCreando((v) => !v)}>
          {creando ? <X /> : <Plus />} {creando ? "Cancelar" : "Nueva cuenta"}
        </Button>
        {actualizando && <RefreshCw className="size-4 animate-spin text-muted-foreground" aria-label="Actualizando" />}
      </div>

      {creando && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Nueva cuenta</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={crear} className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="nombre">Nombre</Label>
                <Input id="nombre" name="nombre" required minLength={2} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Correo</Label>
                <Input id="email" name="email" type="email" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="rol">Rol</Label>
                <Select id="rol" name="rol" defaultValue="ventas">
                  {ROLES.map((rol) => (
                    <option key={rol} value={rol}>
                      {ETIQUETA_ROL[rol]}
                    </option>
                  ))}
                </Select>
              </div>
              <CampoTemporal id="passwordTemporal" />
              <div className="sm:col-span-2">
                <Button type="submit" disabled={deshabilitado}>
                  Crear cuenta
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
                <th className="px-4 py-3 font-medium">Nombre</th>
                <th className="px-4 py-3 font-medium">Rol</th>
                <th className="px-4 py-3 font-medium">Estado</th>
                <th className="px-4 py-3 text-right font-medium">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {usuarios.map((u) => {
                const soyYo = u.id === idActual;
                return (
                  <tr key={u.id} className={u.activo ? "" : "bg-muted/30"}>
                    <td className="px-4 py-3 align-top">
                      <p className={u.activo ? "font-medium" : "font-medium text-muted-foreground"}>
                        {u.nombre} {soyYo && <span className="text-xs font-normal text-muted-foreground">(tú)</span>}
                      </p>
                      <p className="text-xs text-muted-foreground">{u.email}</p>
                      {restableciendo === u.id && (
                        <form onSubmit={(e) => restablecer(e, u)} className="mt-3 flex max-w-sm flex-wrap items-end gap-2">
                          <CampoTemporal id={`reset-${u.id}`} />
                          <Button type="submit" size="sm" disabled={deshabilitado}>
                            Guardar
                          </Button>
                          <Button type="button" size="sm" variant="ghost" onClick={() => setRestableciendo(null)}>
                            Cancelar
                          </Button>
                        </form>
                      )}
                    </td>
                    <td className="px-4 py-3 align-top">
                      <Select
                        aria-label={`Rol de ${u.nombre}`}
                        className="h-9 w-48"
                        value={u.rol}
                        disabled={deshabilitado || soyYo}
                        title={soyYo ? "No puedes cambiar tu propio rol" : undefined}
                        onChange={(e) =>
                          ejecutar(
                            () => llamarApi(`/api/usuarios/${u.id}`, "PATCH", { rol: e.target.value }),
                            `Rol de ${u.nombre} actualizado.`,
                          )
                        }
                      >
                        {ROLES.map((rol) => (
                          <option key={rol} value={rol}>
                            {ETIQUETA_ROL[rol]}
                          </option>
                        ))}
                      </Select>
                    </td>
                    <td className="space-y-1 px-4 py-3 align-top">
                      <Badge variant={u.activo ? "success" : "destructive"}>{u.activo ? "Activa" : "Desactivada"}</Badge>
                      {u.debeCambiarPassword && u.activo && (
                        <Badge variant="accent" className="block w-fit">
                          Contraseña temporal
                        </Badge>
                      )}
                    </td>
                    <td className="px-4 py-3 align-top">
                      <div className="flex justify-end gap-2">
                        <Button size="sm" variant="outline" disabled={deshabilitado} onClick={() => setEditando(u)}>
                          <Pencil /> Editar
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={deshabilitado}
                          onClick={() => setRestableciendo(restableciendo === u.id ? null : u.id)}
                        >
                          <KeyRound /> Restablecer
                        </Button>
                        {!soyYo && (
                          <Button
                            size="sm"
                            variant={u.activo ? "outline" : "default"}
                            disabled={deshabilitado}
                            onClick={() =>
                              ejecutar(
                                () => llamarApi(`/api/usuarios/${u.id}`, "PATCH", { activo: !u.activo }),
                                u.activo
                                  ? `Cuenta de ${u.nombre} desactivada; sus sesiones se cerraron.`
                                  : `Cuenta de ${u.nombre} reactivada.`,
                              )
                            }
                          >
                            {u.activo ? "Desactivar" : "Activar"}
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {editando && (
        <Modal
          titulo={`Editar a ${editando.nombre}`}
          descripcion="La contraseña no cambia aquí: para eso está “Restablecer”."
          alCerrar={() => setEditando(null)}
          className="max-w-md"
        >
          <form onSubmit={(e) => guardarDatos(e, editando)} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="editar-nombre">Nombre</Label>
              <Input id="editar-nombre" name="nombre" defaultValue={editando.nombre} required minLength={2} autoFocus />
              <p className="text-xs text-muted-foreground">Sale como asesor comercial en las propuestas que cotice.</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="editar-email">Correo</Label>
              <Input id="editar-email" name="email" type="email" defaultValue={editando.email} required />
              <p className="text-xs text-muted-foreground">
                Es con el que inicia sesión. Si lo cambias, avísale: desde ese momento entra con el correo nuevo y la
                misma contraseña.
              </p>
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setEditando(null)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={deshabilitado}>
                Guardar cambios
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

function CampoTemporal({ id }: { id: string }) {
  const [valor, setValor] = useState("");
  return (
    <div className="min-w-0 flex-1 space-y-2">
      <Label htmlFor={id}>Contraseña temporal</Label>
      <div className="flex gap-2">
        <Input
          id={id}
          name="passwordTemporal"
          value={valor}
          onChange={(e) => setValor(e.target.value)}
          minLength={PASSWORD_MIN}
          required
          autoComplete="off"
          spellCheck={false}
          className="font-mono"
        />
        <Button type="button" variant="outline" size="icon" className="h-10 shrink-0" title="Generar" onClick={() => setValor(generarTemporal())}>
          <RefreshCw />
        </Button>
      </div>
    </div>
  );
}
