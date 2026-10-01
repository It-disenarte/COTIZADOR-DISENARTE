import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { ProveedorAvisos } from "@/components/avisos";
import { Navegacion } from "@/components/navegacion";
import { COOKIE_MENU_OCULTO } from "@/lib/menu";
import { obtenerSesion } from "@/lib/sesion";

export default async function LayoutApp({ children }: { children: React.ReactNode }) {
  const sesion = await obtenerSesion(await headers());
  if (!sesion) redirect("/login");
  if (sesion.usuario.debeCambiarPassword) redirect("/cambiar-password");
  // El menú se dibuja como lo dejó la persona (escondido o no), sin parpadear al cargar.
  const menuOculto = (await cookies()).get(COOKIE_MENU_OCULTO)?.value === "1";

  return (
    <ProveedorAvisos>
      <div className="flex min-h-screen flex-col md:flex-row">
        <Navegacion usuario={sesion.usuario} inicialOculto={menuOculto} />
        <main className="min-w-0 flex-1 px-4 py-6 md:px-10 md:py-10">{children}</main>
      </div>
    </ProveedorAvisos>
  );
}
