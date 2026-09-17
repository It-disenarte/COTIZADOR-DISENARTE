"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Aviso, Button, Input, Label } from "@/components/ui";
import { authClient } from "@/lib/auth-client";

const MENSAJES: Record<string, string> = {
  INVALID_EMAIL_OR_PASSWORD: "Correo o contraseña incorrectos.",
  CUENTA_DESACTIVADA: "Tu cuenta está desactivada. Habla con el administrador.",
};

export function FormularioLogin() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function enviar(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const datos = new FormData(evento.currentTarget);
    setError(null);
    setEnviando(true);
    const { error } = await authClient.signIn.email({
      email: String(datos.get("email")),
      password: String(datos.get("password")),
    });
    if (error) {
      setError((error.code && MENSAJES[error.code]) ?? (error.status === 429 ? "Demasiados intentos. Espera un momento." : "No se pudo iniciar sesión."));
      setEnviando(false);
      return;
    }
    // El layout protegido decide si hay que cambiar la contraseña primero.
    router.replace("/inicio");
    router.refresh();
  }

  return (
    <form onSubmit={enviar} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="email">Correo</Label>
        <Input id="email" name="email" type="email" autoComplete="username" required autoFocus />
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">Contraseña</Label>
        <Input id="password" name="password" type="password" autoComplete="current-password" required />
      </div>
      {error && <Aviso>{error}</Aviso>}
      <Button type="submit" className="w-full" disabled={enviando}>
        {enviando ? "Entrando…" : "Entrar"}
      </Button>
    </form>
  );
}
