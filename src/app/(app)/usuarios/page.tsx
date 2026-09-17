import { headers } from "next/headers";
import { PanelUsuarios } from "@/components/panel-usuarios";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui";
import { tienePermiso } from "@/lib/permisos";
import { requireSesion } from "@/lib/sesion";
import { listarUsuarios } from "@/lib/servicios/usuarios";

export default async function PaginaUsuarios() {
  const { usuario } = await requireSesion(await headers());

  if (!tienePermiso(usuario, "usuarios.gestionar")) {
    return (
      <Card className="mx-auto max-w-md">
        <CardHeader>
          <CardTitle>Sin acceso</CardTitle>
          <CardDescription>Solo el Admin total puede administrar cuentas.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const usuarios = await listarUsuarios(usuario);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Usuarios</h1>
        <p className="text-sm text-muted-foreground">
          Las cuentas no se borran: se desactivan y conservan su historial.
        </p>
      </header>
      <PanelUsuarios
        usuarios={usuarios.map((u) => ({ ...u, creadoEn: u.creadoEn.toISOString() }))}
        idActual={usuario.id}
      />
    </div>
  );
}
