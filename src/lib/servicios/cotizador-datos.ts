import { asc, eq } from "drizzle-orm";
import type { ClienteOpcion, RecetaOpcion } from "@/components/cotizador/pasos-captura";
import { db } from "@/lib/db";
import { clientes, usuarios } from "@/lib/db/schema";
import { tienePermiso, type UsuarioSesion } from "@/lib/permisos";
import { listarRecetas } from "./recetas";

/** Una receta solo se puede cotizar si todos sus insumos tienen costo y se pueden llevar a m². */
function revisarReceta(componentes: Awaited<ReturnType<typeof listarRecetas>>[number]["componentes"]): string | null {
  for (const c of componentes) {
    const { nombre, costo, unidadCosto, archivado } = c.insumo;
    if (costo == null) return `Falta capturar el costo de "${nombre}".`;
    if (c.modo === "por_m2") {
      if (unidadCosto === "ml" && !c.insumo.anchoUtilM) return `Falta el ancho útil de "${nombre}".`;
      if (unidadCosto === "lamina" && !c.insumo.areaLaminaM2) return `Falta el área de lámina de "${nombre}".`;
      if (unidadCosto === "pieza") return `"${nombre}" se cobra por pieza y está puesto por m².`;
    }
    if (archivado) return `El insumo "${nombre}" está archivado.`;
  }
  return null;
}

export async function datosDelAsistente(usuario: UsuarioSesion) {
  const [recetasCompletas, listaClientes, listaVendedores] = await Promise.all([
    listarRecetas(usuario),
    db.select().from(clientes).orderBy(asc(clientes.empresa), asc(clientes.nombreContacto)).limit(500),
    tienePermiso(usuario, "cotizaciones.ver_todas")
      ? db.select({ id: usuarios.id, nombre: usuarios.name }).from(usuarios).where(eq(usuarios.activo, true)).orderBy(asc(usuarios.name))
      : Promise.resolve([{ id: usuario.id, nombre: usuario.nombre }]),
  ]);

  const recetas: RecetaOpcion[] = recetasCompletas
    .filter((r) => !r.archivado)
    .map((r) => {
      const motivo = r.componentes.length === 0 ? "La receta no tiene componentes." : revisarReceta(r.componentes);
      return {
        id: r.id,
        nombre: r.nombre,
        familia: r.familia,
        descripcionPdf: r.descripcionPdf,
        cotizable: motivo === null,
        motivo,
      };
    });

  const opcionesCliente: ClienteOpcion[] = listaClientes.map((c) => ({
    id: c.id,
    nombreContacto: c.nombreContacto,
    puesto: c.puesto,
    empresa: c.empresa,
    correo: c.correo,
    telefono: c.telefono,
    direccion: c.direccion,
    kmDesdeSjr: c.kmDesdeSjr,
    zona: c.zona,
    notas: c.notas,
  }));

  return { recetas, clientes: opcionesCliente, vendedores: listaVendedores };
}
