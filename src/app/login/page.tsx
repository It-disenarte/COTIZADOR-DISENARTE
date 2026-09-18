import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { FormularioLogin } from "@/components/formulario-login";
import { PantallaAcceso } from "@/components/pantalla-acceso";
import { requiereConfiguracionInicial } from "@/lib/servicios/configuracion-inicial";
import { obtenerSesion } from "@/lib/sesion";

export default async function PaginaLogin() {
  const encabezados = await headers();
  if (await requiereConfiguracionInicial()) redirect("/configuracion-inicial");
  if (await obtenerSesion(encabezados)) redirect("/inicio");

  return (
    <PantallaAcceso titulo="Iniciar sesión" descripcion="Usa el correo y la contraseña que te dio el administrador.">
      <FormularioLogin />
    </PantallaAcceso>
  );
}
