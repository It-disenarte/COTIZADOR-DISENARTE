"use client";

import { FilePlus2, FolderClock, House, KeyRound, LogOut, Package, Users } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Isotipo, Marca, TresPuntos } from "@/components/marca";
import { authClient } from "@/lib/auth-client";
import { ETIQUETA_ROL, type Permiso, tienePermiso, type UsuarioSesion } from "@/lib/permisos";
import { cn } from "@/lib/utils";

type Elemento = { href: string; etiqueta: string; icono: typeof House; permiso?: Permiso };

// Navegación por rol (sección 8).
const ELEMENTOS: Elemento[] = [
  { href: "/inicio", etiqueta: "Inicio", icono: House },
  { href: "/cotizaciones/nueva", etiqueta: "Nueva cotización", icono: FilePlus2, permiso: "cotizaciones.propias" },
  { href: "/cotizaciones", etiqueta: "Mis cotizaciones", icono: FolderClock, permiso: "cotizaciones.propias" },
  { href: "/catalogo", etiqueta: "Catálogo", icono: Package, permiso: "catalogo.ver" },
  { href: "/usuarios", etiqueta: "Usuarios", icono: Users, permiso: "usuarios.gestionar" },
];

/**
 * Barra lateral en el morado corporativo (#7C07A6) con el logo en su versión
 * positivo (blanco), como indica el manual para fondos de color.
 */
export function Navegacion({ usuario }: { usuario: UsuarioSesion }) {
  const ruta = usePathname();
  const router = useRouter();

  async function salir() {
    await authClient.signOut();
    router.replace("/login");
    router.refresh();
  }

  const visibles = ELEMENTOS.filter((e) => !e.permiso || tienePermiso(usuario, e.permiso));

  return (
    <aside className="flex flex-col bg-morado text-white md:sticky md:top-0 md:h-screen md:w-64">
      {/* Escritorio: logo completo. Celular: isotipo y nombre, para no ocupar media pantalla. */}
      <div className="hidden px-6 pt-8 pb-6 md:block">
        <Marca variante="positivo" ancho={132} conEtiqueta />
      </div>
      <div className="flex items-center gap-3 px-4 py-3 md:hidden">
        <Isotipo variante="positivo" tamano={32} />
        <span className="text-sm font-semibold">Cotizador</span>
      </div>
      <div className="filete-marca mx-6 hidden h-0.5 rounded-full md:block" />

      <nav className="flex gap-1 overflow-x-auto px-3 pb-3 md:flex-1 md:flex-col md:overflow-visible md:pt-5">
        {visibles.map(({ href, etiqueta, icono: Icono }) => {
          const activo = ruta === href || (href !== "/inicio" && ruta.startsWith(`${href}/`));
          return (
            <Link
              key={href}
              href={href}
              aria-current={activo ? "page" : undefined}
              className={cn(
                "flex shrink-0 items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                activo ? "bg-white font-medium text-morado shadow-sm" : "text-white/85 hover:bg-white/10 hover:text-white",
              )}
            >
              <Icono className="size-4" />
              {etiqueta}
            </Link>
          );
        })}
      </nav>

      <div className="hidden border-t border-white/15 p-4 md:block">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{usuario.nombre}</p>
            <p className="truncate text-xs text-white/70">{ETIQUETA_ROL[usuario.rol]}</p>
          </div>
          <TresPuntos className="mt-1.5 text-turquesa" />
        </div>
        <div className="mt-3 flex gap-1">
          <Link
            href="/cambiar-password"
            className="flex items-center gap-2 rounded-md px-2 py-1.5 text-xs text-white/85 hover:bg-white/10 hover:text-white"
          >
            <KeyRound className="size-3.5" /> Contraseña
          </Link>
          <button
            onClick={salir}
            className="ml-auto flex items-center gap-2 rounded-md px-2 py-1.5 text-xs text-white/85 hover:bg-white/10 hover:text-white"
          >
            <LogOut className="size-3.5" /> Salir
          </button>
        </div>
      </div>
      <div className="flex items-center justify-between border-t border-white/15 px-4 py-2 md:hidden">
        <span className="truncate text-xs text-white/85">
          {usuario.nombre} · {ETIQUETA_ROL[usuario.rol]}
        </span>
        <button onClick={salir} className="flex items-center gap-1 text-xs">
          <LogOut className="size-3.5" /> Salir
        </button>
      </div>
    </aside>
  );
}
