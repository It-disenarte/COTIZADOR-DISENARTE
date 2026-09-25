import { describe, expect, it } from "vitest";
import { ErrorHttp } from "@/lib/errores";
import { type Permiso, requirePermiso, requireVerCotizacion, tienePermiso, type UsuarioSesion } from "@/lib/permisos";
import type { Rol } from "@/lib/roles";

const usuario = (rol: Rol, extra: Partial<UsuarioSesion> = {}): UsuarioSesion => ({
  id: `id-${rol}`,
  nombre: rol,
  email: `${rol}@prueba.mx`,
  rol,
  activo: true,
  debeCambiarPassword: false,
  ...extra,
});

function estadoDe(fn: () => void): number | "ok" {
  try {
    fn();
    return "ok";
  } catch (e) {
    if (e instanceof ErrorHttp) return e.status;
    throw e;
  }
}

// Matriz de la sección 3 de la especificación.
const MATRIZ: Record<Permiso, Record<Rol, boolean>> = {
  "cotizaciones.propias": { admin: true, agente_admin: true, ventas: true },
  "cotizaciones.ver_todas": { admin: true, agente_admin: true, ventas: false },
  "cotizaciones.autorizar": { admin: true, agente_admin: true, ventas: false },
  "catalogo.ver": { admin: true, agente_admin: true, ventas: true },
  "catalogo.editar": { admin: true, agente_admin: true, ventas: false },
  "clientes.gestionar": { admin: true, agente_admin: true, ventas: true },
  "usuarios.gestionar": { admin: true, agente_admin: false, ventas: false },
};

describe("requirePermiso — matriz de roles", () => {
  for (const [permiso, porRol] of Object.entries(MATRIZ) as [Permiso, Record<Rol, boolean>][]) {
    for (const [rol, permitido] of Object.entries(porRol) as [Rol, boolean][]) {
      it(`${rol} ${permitido ? "puede" : "NO puede"} ${permiso}`, () => {
        expect(tienePermiso(usuario(rol), permiso)).toBe(permitido);
        expect(estadoDe(() => requirePermiso(usuario(rol), permiso))).toBe(permitido ? "ok" : 403);
      });
    }
  }

  it("sin sesión responde 401", () => {
    expect(estadoDe(() => requirePermiso(null, "catalogo.ver"))).toBe(401);
  });

  it("una cuenta desactivada no tiene ningún permiso, aunque sea admin", () => {
    const inactivo = usuario("admin", { activo: false });
    for (const permiso of Object.keys(MATRIZ) as Permiso[]) {
      expect(estadoDe(() => requirePermiso(inactivo, permiso))).toBe(403);
    }
  });
});

describe("Caso 5 — permisos a nivel de helper", () => {
  const ventas = usuario("ventas");
  const agente = usuario("agente_admin");
  const cotizacionAjena = { vendedorId: "otro-vendedor" };

  it("ventas recibe 403 al editar un insumo", () => {
    expect(estadoDe(() => requirePermiso(ventas, "catalogo.editar"))).toBe(403);
  });

  it("ventas recibe 403 al ver la cotización de otro vendedor, y puede ver la suya", () => {
    expect(estadoDe(() => requireVerCotizacion(ventas, cotizacionAjena))).toBe(403);
    expect(estadoDe(() => requireVerCotizacion(ventas, { vendedorId: ventas.id }))).toBe("ok");
  });

  it("ventas recibe 403 al crear usuario", () => {
    expect(estadoDe(() => requirePermiso(ventas, "usuarios.gestionar"))).toBe(403);
  });

  it("agente_admin puede editar insumo y ver cotizaciones ajenas", () => {
    expect(estadoDe(() => requirePermiso(agente, "catalogo.editar"))).toBe("ok");
    expect(estadoDe(() => requireVerCotizacion(agente, cotizacionAjena))).toBe("ok");
  });

  it("agente_admin recibe 403 al crear usuario", () => {
    expect(estadoDe(() => requirePermiso(agente, "usuarios.gestionar"))).toBe(403);
  });
});
