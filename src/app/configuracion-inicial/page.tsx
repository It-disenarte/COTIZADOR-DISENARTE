import { notFound } from "next/navigation";
import { connection } from "next/server";
import { FormularioConfiguracionInicial } from "@/components/formulario-configuracion-inicial";
import { Marca } from "@/components/marca";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui";
import { requiereConfiguracionInicial } from "@/lib/servicios/configuracion-inicial";

export default async function PaginaConfiguracionInicial() {
  // Consultar en cada petición, nunca en el build.
  await connection();
  if (!(await requiereConfiguracionInicial())) notFound();

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6">
        <Marca className="text-center" />
        <Card>
          <CardHeader>
            <CardTitle>Configuración inicial</CardTitle>
            <CardDescription>
              Crea la cuenta de Admin total. Este paso solo aparece una vez, mientras no exista ninguna cuenta.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <FormularioConfiguracionInicial />
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
