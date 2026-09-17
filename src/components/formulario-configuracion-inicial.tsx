"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Aviso, Button, Input, Label } from "@/components/ui";
import { authClient } from "@/lib/auth-client";
import { PASSWORD_MIN } from "@/lib/roles";
import { llamarApi } from "@/lib/utils";

export function FormularioConfiguracionInicial() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function enviar(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const datos = new FormData(evento.currentTarget);
    const email = String(datos.get("email"));
    const password = String(datos.get("password"));
    if (password !== String(datos.get("confirmacion"))) {
      setError("Las contraseñas no coinciden.");
      return;
    }
    setError(null);
    setEnviando(true);
    try {
      await llamarApi("/api/configuracion-inicial", "POST", { nombre: String(datos.get("nombre")), email, password });
      const { error } = await authClient.signIn.email({ email, password });
      router.replace(error ? "/login" : "/inicio");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo crear la cuenta.");
      setEnviando(false);
    }
  }

  return (
    <form onSubmit={enviar} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="nombre">Nombre</Label>
        <Input id="nombre" name="nombre" autoComplete="name" required minLength={2} autoFocus />
      </div>
      <div className="space-y-2">
        <Label htmlFor="email">Correo</Label>
        <Input id="email" name="email" type="email" autoComplete="username" required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">Contraseña</Label>
        <Input id="password" name="password" type="password" autoComplete="new-password" minLength={PASSWORD_MIN} required />
        <p className="text-xs text-muted-foreground">Mínimo {PASSWORD_MIN} caracteres.</p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="confirmacion">Confirmar contraseña</Label>
        <Input id="confirmacion" name="confirmacion" type="password" autoComplete="new-password" minLength={PASSWORD_MIN} required />
      </div>
      {error && <Aviso>{error}</Aviso>}
      <Button type="submit" className="w-full" disabled={enviando}>
        {enviando ? "Creando…" : "Crear cuenta de admin"}
      </Button>
    </form>
  );
}
