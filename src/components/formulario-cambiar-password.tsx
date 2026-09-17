"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Aviso, Button, Input, Label } from "@/components/ui";
import { PASSWORD_MIN } from "@/lib/roles";
import { llamarApi } from "@/lib/utils";

export function FormularioCambiarPassword() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function enviar(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const datos = new FormData(evento.currentTarget);
    const nueva = String(datos.get("nueva"));
    if (nueva !== String(datos.get("confirmacion"))) {
      setError("Las contraseñas nuevas no coinciden.");
      return;
    }
    setError(null);
    setEnviando(true);
    try {
      await llamarApi("/api/cuenta/password", "POST", { actual: String(datos.get("actual")), nueva });
      router.replace("/inicio");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cambiar la contraseña.");
      setEnviando(false);
    }
  }

  return (
    <form onSubmit={enviar} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="actual">Contraseña actual</Label>
        <Input id="actual" name="actual" type="password" autoComplete="current-password" required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="nueva">Nueva contraseña</Label>
        <Input id="nueva" name="nueva" type="password" autoComplete="new-password" minLength={PASSWORD_MIN} required />
        <p className="text-xs text-muted-foreground">Mínimo {PASSWORD_MIN} caracteres.</p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="confirmacion">Confirmar nueva contraseña</Label>
        <Input id="confirmacion" name="confirmacion" type="password" autoComplete="new-password" minLength={PASSWORD_MIN} required />
      </div>
      {error && <Aviso>{error}</Aviso>}
      <Button type="submit" className="w-full" disabled={enviando}>
        {enviando ? "Guardando…" : "Guardar contraseña"}
      </Button>
    </form>
  );
}
