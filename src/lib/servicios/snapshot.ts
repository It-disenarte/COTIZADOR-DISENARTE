import { asc, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { insumos, parametros, recetaComponentes, recetas } from "@/lib/db/schema";
import { ErrorHttp } from "@/lib/errores";
import type { InsumoSnapshot, ParametrosMotor, RecetaSnapshot, Snapshot } from "@/lib/motor";
import { requirePermiso, type UsuarioSesion } from "@/lib/permisos";

/**
 * Foto del catálogo con la que se calcula una cotización. Se guarda con cada versión:
 * si mañana cambia un precio, la cotización vieja sigue mostrando sus números.
 */
export async function obtenerSnapshot(actor: UsuarioSesion | null): Promise<Snapshot> {
  requirePermiso(actor, "catalogo.ver");

  const [filasInsumos, filasRecetas, filasParametros] = await Promise.all([
    db.select().from(insumos),
    db.select().from(recetas).orderBy(asc(recetas.nombre)),
    db.select().from(parametros),
  ]);

  const componentes = await db
    .select()
    .from(recetaComponentes)
    .where(
      filasRecetas.length
        ? inArray(
            recetaComponentes.recetaId,
            filasRecetas.map((r) => r.id),
          )
        : eq(recetaComponentes.recetaId, "00000000-0000-0000-0000-000000000000"),
    )
    .orderBy(asc(recetaComponentes.creadoEn));

  const insumosPorId: Record<string, InsumoSnapshot> = {};
  for (const i of filasInsumos) {
    insumosPorId[i.id] = {
      id: i.id,
      nombre: i.nombre,
      unidadCosto: i.unidadCosto,
      costo: i.costo,
      anchoUtilM: i.anchoUtilM,
      areaLaminaM2: i.areaLaminaM2,
      requiereRevision: i.requiereRevision,
    };
  }

  const recetasPorId: Record<string, RecetaSnapshot> = {};
  for (const r of filasRecetas) {
    recetasPorId[r.id] = {
      id: r.id,
      nombre: r.nombre,
      familia: r.familia,
      descripcionPdf: r.descripcionPdf,
      pctMerma: r.pctMerma,
      componentes: componentes
        .filter((c) => c.recetaId === r.id)
        .map((c) => ({ insumoId: c.insumoId, modo: c.modo, cantidad: c.cantidad })),
    };
  }

  return {
    insumos: insumosPorId,
    recetas: recetasPorId,
    parametros: armarParametros(filasParametros),
    vehiculos: armarVehiculos(filasParametros),
  };
}

/** Vehículos de la casa, tomados de los parámetros (editables en Catálogo → Parámetros). */
const VEHICULOS = [
  { clave: "hilux", etiqueta: "Toyota Hilux", parametro: "rendimiento_hilux" },
  { clave: "cx30", etiqueta: "Mazda CX-30", parametro: "rendimiento_cx30" },
];

function armarVehiculos(filas: FilaParametro[]) {
  const porClave = new Map(filas.map((p) => [p.clave, p]));
  return VEHICULOS.flatMap((v) => {
    const valor = porClave.get(v.parametro)?.valor;
    return valor ? [{ clave: v.clave, etiqueta: v.etiqueta, rendimientoKmL: valor }] : [];
  });
}

type FilaParametro = typeof parametros.$inferSelect;

function armarParametros(filas: FilaParametro[]): ParametrosMotor {
  const porClave = new Map(filas.map((p) => [p.clave, p]));

  const exigir = (clave: string): string => {
    const valor = porClave.get(clave)?.valor;
    if (valor == null) {
      throw new ErrorHttp(400, `Falta capturar el parámetro "${clave}" en el catálogo.`, "PARAMETRO_FALTANTE");
    }
    return valor;
  };

  const escenarios = ["escenario_margen_1", "escenario_margen_2", "escenario_margen_3"]
    .map((clave) => porClave.get(clave)?.valor)
    .filter((v): v is string => v != null);

  return {
    margen: exigir("margen"),
    pctMargenError: exigir("pct_margen_error"),
    pctConsumibles: exigir("pct_consumibles"),
    tarifaInstaladorDia: exigir("tarifa_instalador_dia"),
    tarifaDisenoDia: exigir("tarifa_diseno_dia"),
    viaticosLocalDia: exigir("viaticos_local_dia"),
    viaticosForaneoDia: exigir("viaticos_foraneo_dia"),
    rendimientoKmL: exigir("rendimiento_km_l"),
    // Puede estar vacío: el motor solo lo exige si la cotización lleva traslado.
    precioGasolinaLitro: porClave.get("precio_gasolina_litro")?.valor ?? null,
    precioGasolinaActualizadoEn: porClave.get("precio_gasolina_litro")?.actualizadoEn ?? null,
    pctReventa: exigir("pct_reventa"),
    iva: exigir("iva"),
    alertaMargenMinimo: exigir("alerta_margen_minimo"),
    alertaDesvioPrecio: exigir("alerta_desvio_precio"),
    escenariosMargen: escenarios,
  };
}
