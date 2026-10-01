"use client";

import { FilePlus2, FolderClock, House, KeyRound, LogOut, Package, PanelLeftClose, PanelLeftOpen, Users } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { BotonInstalar } from "@/components/boton-instalar";
import { Isotipo, Marca, TresPuntos } from "@/components/marca";
import { PantallaCarga } from "@/components/pantalla-carga";
import { authClient } from "@/lib/auth-client";
import { COOKIE_MENU_OCULTO } from "@/lib/menu";
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

const claseAccion = "flex items-center gap-2 rounded-md px-2 py-1.5 text-xs text-white/85 hover:bg-white/10 hover:text-white";

/**
 * Barra lateral en el morado corporativo (#7C07A6) con el ícono de la app en su versión
 * positivo (blanco), para que se distinga sobre el fondo de color. En computadora se puede
 * esconder a una franja de íconos, para dar más espacio al asistente.
 */
export function Navegacion({ usuario, inicialOculto = false }: { usuario: UsuarioSesion; inicialOculto?: boolean }) {
  const ruta = usePathname();
  const router = useRouter();
  const [oculto, setOculto] = useState(inicialOculto);
  const [saliendo, setSaliendo] = useState(false);

  function alternarMenu() {
    const nuevo = !oculto;
    setOculto(nuevo);
    document.cookie = `${COOKIE_MENU_OCULTO}=${nuevo ? "1" : "0"}; path=/; max-age=31536000; samesite=lax`;
  }

  // La pantalla de carga se queda hasta que abre el login (la barra desaparece con la sesión).
  async function salir() {
    setSaliendo(true);
    try {
      await authClient.signOut();
      router.replace("/login");
      router.refresh();
    } catch {
      setSaliendo(false);
    }
  }

  const visibles = ELEMENTOS.filter((e) => !e.permiso || tienePermiso(usuario, e.permiso));

  return (
    <aside
      className={cn(
        "flex flex-col bg-morado text-white transition-[width] duration-200 md:sticky md:top-0 md:h-screen",
        oculto ? "md:w-16" : "md:w-64",
      )}
    >
      {saliendo && <PantallaCarga mensaje="Cerrando sesión…" />}

      {/* Escritorio: ícono y nombre (o solo el ícono si está escondido). Celular: más chicos. */}
      <div className={cn("hidden md:flex", oculto ? "flex-col items-center gap-3 px-2 pt-6 pb-4" : "items-start justify-between gap-2 px-6 pt-8 pb-6")}>
        {oculto ? <Isotipo variante="positivo" tamano={36} /> : <Marca variante="positivo" tamano={44} />}
        <button
          type="button"
          onClick={alternarMenu}
          title={oculto ? "Mostrar el menú" : "Esconder el menú para tener más espacio"}
          aria-label={oculto ? "Mostrar el menú" : "Esconder el menú"}
          className="rounded-md p-1.5 text-white/80 hover:bg-white/10 hover:text-white"
        >
          {oculto ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
        </button>
      </div>
      <div className="flex items-center gap-3 px-4 py-3 md:hidden">
        <Isotipo variante="positivo" tamano={32} />
        <span className="text-sm font-semibold">Cotizador</span>
      </div>
      <div className={cn("filete-marca hidden h-0.5 rounded-full md:block", oculto ? "mx-3" : "mx-6")} />

      <nav
        className={cn(
          "flex gap-1 overflow-x-auto px-3 pb-3 md:flex-1 md:flex-col md:overflow-visible md:pt-5",
          oculto && "md:px-2",
        )}
      >
        {visibles.map(({ href, etiqueta, icono: Icono }) => {
          const activo = ruta === href || (href !== "/inicio" && ruta.startsWith(`${href}/`));
          return (
            <Link
              key={href}
              href={href}
              title={oculto ? etiqueta : undefined}
              aria-current={activo ? "page" : undefined}
              className={cn(
                "flex shrink-0 items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                oculto && "md:justify-center md:px-0",
                activo ? "bg-white font-medium text-morado shadow-sm" : "text-white/85 hover:bg-white/10 hover:text-white",
              )}
            >
              <Icono className="size-4 shrink-0" />
              <span className={cn(oculto && "md:sr-only")}>{etiqueta}</span>
            </Link>
          );
        })}
      </nav>

      {/* Escritorio: usuario y una acción por renglón (no se cortan con nombres largos). */}
      <div className={cn("hidden border-t border-white/15 md:block", oculto ? "px-2 py-3" : "p-4")}>
        {!oculto && (
          <div className="mb-2 flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium" title={usuario.nombre}>
                {usuario.nombre}
              </p>
              <p className="truncate text-xs text-white/70">{ETIQUETA_ROL[usuario.rol]}</p>
            </div>
            <TresPuntos className="mt-1.5 shrink-0 text-turquesa" />
          </div>
        )}
        <div className={cn("flex flex-col gap-0.5", oculto && "items-center")}>
          <Link
            href="/cambiar-password"
            title={oculto ? "Cambiar contraseña" : undefined}
            className={cn(claseAccion, oculto && "justify-center")}
          >
            <KeyRound className="size-3.5 shrink-0" />
            <span className={cn(oculto && "sr-only")}>Contraseña</span>
          </Link>
          <BotonInstalar className={cn(claseAccion, oculto && "justify-center")} soloIcono={oculto} />
          <button
            type="button"
            onClick={salir}
            title={oculto ? `Salir (${usuario.nombre})` : undefined}
            className={cn(claseAccion, oculto && "justify-center")}
          >
            <LogOut className="size-3.5 shrink-0" />
            <span className={cn(oculto && "sr-only")}>Salir</span>
          </button>
        </div>
      </div>

      <div className="flex items-center gap-2 border-t border-white/15 px-4 py-2 md:hidden">
        <span className="min-w-0 flex-1 truncate text-xs text-white/85">
          {usuario.nombre} · {ETIQUETA_ROL[usuario.rol]}
        </span>
        <BotonInstalar className="flex shrink-0 items-center gap-1 text-xs" />
        <button type="button" onClick={salir} className="flex shrink-0 items-center gap-1 text-xs">
          <LogOut className="size-3.5" /> Salir
        </button>
      </div>
    </aside>
  );
}
