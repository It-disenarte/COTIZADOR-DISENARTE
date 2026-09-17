"use client";

import { FilePlus2, FolderClock, History, House, KeyRound, LogOut, Package, Users } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Marca } from "@/components/marca";
import { authClient } from "@/lib/auth-client";
import { ETIQUETA_ROL, type Permiso, tienePermiso, type UsuarioSesion } from "@/lib/permisos";
import { cn } from "@/lib/utils";

type Elemento = { href: string; etiqueta: string; icono: typeof House; permiso?: Permiso; fase?: number };

// Navegación por rol (sección 8). Las pantallas de fases posteriores se muestran deshabilitadas.
const ELEMENTOS: Elemento[] = [
  { href: "/inicio", etiqueta: "Inicio", icono: House },
  { href: "/cotizaciones/nueva", etiqueta: "Nueva cotización", icono: FilePlus2, permiso: "cotizaciones.propias", fase: 4 },
  { href: "/cotizaciones", etiqueta: "Mis cotizaciones", icono: FolderClock, permiso: "cotizaciones.propias", fase: 6 },
  { href: "/catalogo", etiqueta: "Catálogo", icono: Package, permiso: "catalogo.ver" },
  { href: "/historial", etiqueta: "Historial general", icono: History, permiso: "cotizaciones.ver_todas", fase: 6 },
  { href: "/usuarios", etiqueta: "Usuarios", icono: Users, permiso: "usuarios.gestionar" },
];

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
    <aside className="flex flex-col border-b bg-card md:sticky md:top-0 md:h-screen md:w-64 md:border-r md:border-b-0">
      <div className="px-5 py-5">
        <Marca />
      </div>
      <nav className="flex gap-1 overflow-x-auto px-3 pb-3 md:flex-1 md:flex-col md:overflow-visible">
        {visibles.map(({ href, etiqueta, icono: Icono, fase }) => {
          const activo = ruta === href || (href !== "/inicio" && ruta.startsWith(`${href}/`));
          const clases = "flex shrink-0 items-center gap-3 rounded-md px-3 py-2 text-sm";
          if (fase) {
            return (
              <span
                key={href}
                className={cn(clases, "cursor-not-allowed text-muted-foreground/70")}
                title={`Disponible en la fase ${fase}`}
              >
                <Icono className="size-4" />
                {etiqueta}
                <span className="ml-auto hidden rounded bg-muted px-1.5 text-[0.65rem] md:inline">F{fase}</span>
              </span>
            );
          }
          return (
            <Link
              key={href}
              href={href}
              className={cn(clases, activo ? "bg-primary text-primary-foreground" : "hover:bg-muted")}
            >
              <Icono className="size-4" />
              {etiqueta}
            </Link>
          );
        })}
      </nav>
      <div className="hidden border-t p-4 md:block">
        <p className="truncate text-sm font-medium">{usuario.nombre}</p>
        <p className="truncate text-xs text-muted-foreground">{ETIQUETA_ROL[usuario.rol]}</p>
        <div className="mt-3 flex gap-1">
          <Link href="/cambiar-password" className="flex items-center gap-2 rounded-md px-2 py-1.5 text-xs hover:bg-muted">
            <KeyRound className="size-3.5" /> Contraseña
          </Link>
          <button onClick={salir} className="ml-auto flex items-center gap-2 rounded-md px-2 py-1.5 text-xs hover:bg-muted">
            <LogOut className="size-3.5" /> Salir
          </button>
        </div>
      </div>
      <div className="flex items-center justify-between border-t px-4 py-2 md:hidden">
        <span className="truncate text-xs">{usuario.nombre} · {ETIQUETA_ROL[usuario.rol]}</span>
        <button onClick={salir} className="flex items-center gap-1 text-xs">
          <LogOut className="size-3.5" /> Salir
        </button>
      </div>
    </aside>
  );
}
