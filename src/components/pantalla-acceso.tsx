import { Marca, TresPuntos } from "@/components/marca";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui";

/**
 * Pantallas sin sesión (entrar, configuración inicial, cambiar contraseña).
 * Escritorio: bloque morado con el logo en positivo a la izquierda y el formulario sobre
 * la textura. Celular: logo a color arriba del formulario.
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
      <section className="relative hidden flex-col justify-between overflow-hidden bg-morado p-10 text-white md:flex">
        <TresPuntos className="self-end text-white" />
        <div className="space-y-8">
          <Marca variante="positivo" ancho={190} className="items-start" />
          <div className="filete-marca h-1 w-24 rounded-full" />
          <p className="max-w-xs text-lg font-light leading-snug text-white/90">
            Cotizador de comunicación visual, señalética e impresión.
          </p>
        </div>
        <p className="text-xs text-white/60">www.disenartemx.com</p>
      </section>

      <section className="flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-sm space-y-6">
          <Marca ancho={120} className="md:hidden" />
          <Card>
            <CardHeader>
              <div className="flex items-start justify-between gap-3">
                <CardTitle className="text-morado">{titulo}</CardTitle>
                <TresPuntos className="mt-1.5 text-morado" />
              </div>
              <CardDescription>{descripcion}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">{children}</CardContent>
          </Card>
        </div>
      </section>
    </main>
  );
}
