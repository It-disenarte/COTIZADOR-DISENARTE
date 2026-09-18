import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { FormularioCambiarPassword } from "@/components/formulario-cambiar-password";
import { PantallaAcceso } from "@/components/pantalla-acceso";
import { obtenerSesion } from "@/lib/sesion";

export default async function PaginaCambiarPassword() {
  const sesion = await obtenerSesion(await headers());
  if (!sesion) redirect("/login");
  const obligatorio = sesion.usuario.debeCambiarPassword;

  return (
    <PantallaAcceso
      titulo={obligatorio ? "Crea tu contraseña" : "Cambiar contraseña"}
      descripcion={
        obligatorio
          ? `Hola, ${sesion.usuario.nombre}. Tu contraseña es temporal: cámbiala para continuar.`
          : "Al cambiarla se cerrarán tus sesiones en otros dispositivos."
      }
    >
      <FormularioCambiarPassword />
      {!obligatorio && (
        <Link href="/inicio" className="block text-center text-sm text-muted-foreground hover:underline">
          Volver
        </Link>
      )}
    </PantallaAcceso>
  );
}
