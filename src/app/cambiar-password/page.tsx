import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { FormularioCambiarPassword } from "@/components/formulario-cambiar-password";
import { Marca } from "@/components/marca";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui";
import { obtenerSesion } from "@/lib/sesion";

export default async function PaginaCambiarPassword() {
  const sesion = await obtenerSesion(await headers());
  if (!sesion) redirect("/login");
  const obligatorio = sesion.usuario.debeCambiarPassword;

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6">
        <Marca className="text-center" />
        <Card>
          <CardHeader>
            <CardTitle>{obligatorio ? "Crea tu contraseña" : "Cambiar contraseña"}</CardTitle>
            <CardDescription>
              {obligatorio
                ? `Hola, ${sesion.usuario.nombre}. Tu contraseña es temporal: cámbiala para continuar.`
                : "Al cambiarla se cerrarán tus sesiones en otros dispositivos."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <FormularioCambiarPassword />
            {!obligatorio && (
              <Link href="/inicio" className="block text-center text-sm text-muted-foreground hover:underline">
                Volver
              </Link>
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
