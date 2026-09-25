import { eq } from "drizzle-orm";
import type { DB } from "@/lib/db";
import { insumos, parametros, recetas } from "@/lib/db/schema";

/** Completa los precios que la semilla deja pendientes y devuelve la receta de estireno. */
export async function prepararCatalogo(db: DB): Promise<string> {
  await db.update(parametros).set({ valor: "24.50" }).where(eq(parametros.clave, "precio_gasolina_litro"));
  await db.update(insumos).set({ costo: "95", unidadCosto: "m2" }).where(eq(insumos.nombre, "Estireno cal. 40 blanco"));
  await db.update(insumos).set({ anchoUtilM: "1.52" }).where(eq(insumos.nombre, "Impresión JV33 vinil blanco"));
  const [receta] = await db.select().from(recetas).where(eq(recetas.nombre, "Estireno cal. 40 + impresión"));
  return receta.id;
}

/** La cotización de Gandhi: 169 piezas en tres áreas, con un item de reventa. */
export function cotizacionGandhi(recetaId: string, imagenId: string | null = null) {
  return {
    titulo: "Señalética protección civil",
    solicitante: "Claudia P.",
    cliente: {
      nombreContacto: "Claudia P.",
      puesto: "",
      empresa: "Gandhi",
      correo: "claudia@ejemplo.mx",
      telefono: "",
      direccion: "",
      kmDesdeSjr: "58.6",
      zona: "foraneo",
      notas: "",
    },
    entrada: {
      levantamiento: {
        areas: ["CENDI", "Primaria", "Secundaria"],
        filas: [
          { concepto: "Señalamiento 20 × 30 cm", anchoM: "0.20", altoM: "0.30", cantidades: ["30", "40", "39"] },
          { concepto: "Señalamiento 30 × 40 cm", anchoM: "0.30", altoM: "0.40", cantidades: ["20", "20", "20"] },
        ],
      },
      opciones: [{ recetaId, precioUnitarioManual: "", imagenId }],
      tiempoEstimado: "5-7 días",
      alcance: { concepto: "Señalética para protección civil", resumen: "Señalética completa para las 3 áreas." },
      // Condiciones que exige el PNO-COM-01 (7.3); cada prueba las cambia si lo necesita.
      propuesta: { noIncluye: "", supuestos: "", vigenciaDias: "", peticionAccion: "" as "" | "visita" | "piloto" | "orden_compra" },
      incluyeEnvio: true,
      sitio: { retiroGraficosPrevios: false, notasSuperficie: "" },
      operacion: {
        trabajoEnInstalacionesDisenarte: false,
        diasDiseno: "2",
        disenoMontoManual: "",
        produccion: { personas: 2, dias: "3" },
        instalacion: { incluye: false, personas: 0, dias: "0", escalaPorPieza: false },
        viaticos: { tipo: "foraneo", personas: 2, dias: "1", montoDiaManual: "" },
        hospedaje: { incluye: false, noches: 0, costoNoche: "0" },
        traslado: { kmPorTrayecto: "58.6", modo: "una_vez", viajesRedondos: "", rendimientoKmL: "", casetasPorViaje: "120" },
        extras: [],
      },
      presentacion: { operacionProrrateada: true, modalidades: "solo_una" },
      ajustes: { aplicaMargenError: true, aplicaConsumibles: true, margen: "", descuentoDecisionRapida: null },
      reventa: [{ nombre: "Detector de humo autónomo 9V", precioReferencia: "180", cantidad: "66", link: "", verificado: true }],
    },
  };
}

/** PNG de 3 × 2 px. */
export const PNG_PRUEBA = Uint8Array.from(
  atob("iVBORw0KGgoAAAANSUhEUgAAAAMAAAACCAIAAAASFvFNAAAAEklEQVR4nGP4z8DAwMDAwMAAAB7gAv+pMnULAAAAAElFTkSuQmCC"),
  (c) => c.charCodeAt(0),
);
