import { notFound } from "next/navigation";
import { connection } from "next/server";
import { FormularioConfiguracionInicial } from "@/components/formulario-configuracion-inicial";
import { PantallaAcceso } from "@/components/pantalla-acceso";
import { requiereConfiguracionInicial } from "@/lib/servicios/configuracion-inicial";

export default async function PaginaConfiguracionInicial() {
  // Consultar en cada petición, nunca en el build.
  await connection();
  if (!(await requiereConfiguracionInicial())) notFound();

  return (
    <PantallaAcceso
      titulo="Configuración inicial"
      descripcion="Crea la cuenta de Admin total. Este paso solo aparece una vez, mientras no exista ninguna cuenta."
    >
      <FormularioConfiguracionInicial />
    </PantallaAcceso>
  );
}
