"use client";

import { KeyRound, Plus, RefreshCw, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Aviso, Badge, Button, Card, CardContent, CardHeader, CardTitle, Input, Label, Select } from "@/components/ui";
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
  const [mensaje, setMensaje] = useState<{ tipo: "ok" | "error"; texto: string } | null>(null);
  const [creando, setCreando] = useState(false);
  const [restableciendo, setRestableciendo] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  async function ejecutar(accion: () => Promise<unknown>, exito: string) {
    setOcupado(true);
    setMensaje(null);
    try {
      await accion();
      setMensaje({ tipo: "ok", texto: exito });
      iniciarTransicion(() => router.refresh());
      return true;
    } catch (e) {
      setMensaje({ tipo: "error", texto: e instanceof Error ? e.message : "Algo salió mal." });
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

  const deshabilitado = ocupado || actualizando;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant={creando ? "outline" : "accent"} onClick={() => setCreando((v) => !v)}>
          {creando ? <X /> : <Plus />} {creando ? "Cancelar" : "Nueva cuenta"}
        </Button>
        {actualizando && <RefreshCw className="size-4 animate-spin text-muted-foreground" aria-label="Actualizando" />}
      </div>

      {mensaje && <Aviso tipo={mensaje.tipo}>{mensaje.texto}</Aviso>}

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
