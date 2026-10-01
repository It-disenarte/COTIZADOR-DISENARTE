import { Marca } from "@/components/marca";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui";

/**
 * Pantallas sin sesión (entrar, configuración inicial, cambiar contraseña).
 * Escritorio: bloque morado con el ícono de la app en positivo a la izquierda y el formulario
 * sobre la textura. Celular: ícono a color arriba del formulario.
 */
export function PantallaAcceso({
  titulo,
  descripcion,
  children,
}: {
  titulo: string;
  descripcion: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <main className="grid min-h-screen md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      <section className="relative hidden flex-col overflow-hidden bg-morado p-10 text-white md:flex">
        <div className="my-auto space-y-8">
          <Marca variante="positivo" tamano={76} />
          <div className="filete-marca h-1 w-24 rounded-full" />
          <p className="max-w-xs text-lg font-light leading-snug text-white/90">
            Cotizador de comunicación visual, señalética e impresión.
          </p>
        </div>
        <p className="text-xs text-white/60">www.disenartemx.com</p>
      </section>

      <section className="flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-sm space-y-6">
          <Marca tamano={52} className="justify-center md:hidden" />
          <Card>
            <CardHeader>
              <CardTitle className="text-morado">{titulo}</CardTitle>
              <CardDescription>{descripcion}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">{children}</CardContent>
          </Card>
        </div>
      </section>
    </main>
  );
}
