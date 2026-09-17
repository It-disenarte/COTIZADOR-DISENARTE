import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { FormularioLogin } from "@/components/formulario-login";
import { Marca } from "@/components/marca";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui";
import { requiereConfiguracionInicial } from "@/lib/servicios/configuracion-inicial";
import { obtenerSesion } from "@/lib/sesion";

export default async function PaginaLogin() {
  const encabezados = await headers();
  if (await requiereConfiguracionInicial()) redirect("/configuracion-inicial");
  if (await obtenerSesion(encabezados)) redirect("/inicio");

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6">
        <Marca className="text-center" />
        <Card>
          <CardHeader>
            <CardTitle>Iniciar sesión</CardTitle>
            <CardDescription>Usa el correo y la contraseña que te dio el administrador.</CardDescription>
          </CardHeader>
          <CardContent>
            <FormularioLogin />
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
