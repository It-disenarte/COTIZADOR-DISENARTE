import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Navegacion } from "@/components/navegacion";
import { obtenerSesion } from "@/lib/sesion";

export default async function LayoutApp({ children }: { children: React.ReactNode }) {
  const sesion = await obtenerSesion(await headers());
  if (!sesion) redirect("/login");
  if (sesion.usuario.debeCambiarPassword) redirect("/cambiar-password");

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <Navegacion usuario={sesion.usuario} />
      <main className="flex-1 px-4 py-6 md:px-10 md:py-10">{children}</main>
    </div>
  );
}
