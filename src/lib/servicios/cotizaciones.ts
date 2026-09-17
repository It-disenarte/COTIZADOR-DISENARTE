import { and, desc, eq, like, sql } from "drizzle-orm";
import type { EstadoCotizacion } from "@/lib/catalogo/constantes";
import { db } from "@/lib/db";
import { clientes, cotizaciones, cotizacionVersiones, usuarios } from "@/lib/db/schema";
import { ErrorHttp } from "@/lib/errores";
import { calcular, type EntradaCotizacion as EntradaMotor, ErrorMotor, type ResultadoCotizacion, type Snapshot } from "@/lib/motor";
import { requirePermiso, requireVerCotizacion, tienePermiso, type UsuarioSesion } from "@/lib/permisos";
import type { GuardarCotizacion } from "@/lib/validacion/cotizaciones";
import { exigirUuid, noEncontrado } from "./comun";
import { obtenerSnapshot } from "./snapshot";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type CotizacionResumen = {
  id: string;
  folio: string;
  titulo: string;
  estado: EstadoCotizacion;
  version: number;
  cliente: string | null;
  vendedor: string | null;
  vendedorId: string;
  total: string | null;
  actualizadoEn: Date;
};

export type CotizacionDetalle = {
  id: string;
  folio: string;
  titulo: string;
  solicitante: string | null;
  estado: EstadoCotizacion;
  version: number;
  vendedorId: string;
  vendedor: string | null;
  cliente: typeof clientes.$inferSelect | null;
  entrada: unknown;
  resultado: ResultadoCotizacion;
  actualizadoEn: Date;
};

/** Folio consecutivo por día: COT-DDMMYYYY-NN. */
async function generarFolio(tx: Tx, fecha = new Date()): Promise<string> {
  const dia = fecha.toLocaleDateString("es-MX", { timeZone: "America/Mexico_City", day: "2-digit", month: "2-digit", year: "numeric" });
  const prefijo = `COT-${dia.replaceAll("/", "")}`;
  const [{ total }] = await tx
    .select({ total: sql<number>`count(*)::int` })
    .from(cotizaciones)
    .where(like(cotizaciones.folio, `${prefijo}-%`));
  return `${prefijo}-${String(total + 1).padStart(2, "0")}`;
}

function calcularConSnapshot(entrada: unknown, snapshot: Snapshot): ResultadoCotizacion {
  try {
    return calcular(entrada as EntradaMotor, snapshot);
  } catch (error) {
    if (error instanceof ErrorMotor) throw new ErrorHttp(400, error.message, error.codigo);
    throw error;
  }
}

/** Crea o actualiza el cliente capturado dentro de la cotización. */
async function guardarCliente(tx: Tx, datos: GuardarCotizacion["cliente"]): Promise<string> {
  const { id, ...campos } = datos;
  if (id) {
    const [actualizado] = await tx.update(clientes).set(campos).where(eq(clientes.id, id)).returning({ id: clientes.id });
    if (actualizado) return actualizado.id;
  }
  const [nuevo] = await tx.insert(clientes).values(campos).returning({ id: clientes.id });
  return nuevo.id;
}

function exigirEditable(cotizacion: { estado: EstadoCotizacion }) {
  if (cotizacion.estado === "ganada" || cotizacion.estado === "perdida") {
    throw new ErrorHttp(409, "Una cotización cerrada ya no se edita; duplícala para hacer otra.", "COTIZACION_CERRADA");
  }
}

export async function guardarCotizacion(
  actor: UsuarioSesion | null,
  datos: GuardarCotizacion,
  id?: string,
): Promise<{ id: string; folio: string; version: number; resultado: ResultadoCotizacion }> {
  requirePermiso(actor, "cotizaciones.propias");
  const snapshot = await obtenerSnapshot(actor);
  const resultado = calcularConSnapshot(datos.entrada, snapshot);

  // Solo quien ve todas las cotizaciones puede cotizar a nombre de otra persona.
  const vendedorId = datos.vendedorId && tienePermiso(actor, "cotizaciones.ver_todas") ? datos.vendedorId : actor.id;

  return db.transaction(async (tx) => {
    const clienteId = await guardarCliente(tx, datos.cliente);
    const campos = { titulo: datos.titulo, solicitante: datos.solicitante ?? null, clienteId };

    if (!id) {
      const folio = await generarFolio(tx);
      const [cotizacion] = await tx
        .insert(cotizaciones)
        .values({ ...campos, folio, vendedorId, estado: "borrador", versionActual: 1 })
        .returning();
      await tx.insert(cotizacionVersiones).values({
        cotizacionId: cotizacion.id,
        version: 1,
        creadaPor: actor.id,
        entrada: datos.entrada,
        precios: snapshot,
        resultado,
      });
      return { id: cotizacion.id, folio: cotizacion.folio, version: 1, resultado };
    }

    exigirUuid(id, "Cotización");
    const [existente] = await tx.select().from(cotizaciones).where(eq(cotizaciones.id, id));
    if (!existente) noEncontrado("Cotización");
    requireVerCotizacion(actor, { vendedorId: existente.vendedorId });
    exigirEditable(existente);

    await tx.update(cotizaciones).set({ ...campos, vendedorId }).where(eq(cotizaciones.id, id));
    await tx
      .update(cotizacionVersiones)
      .set({ entrada: datos.entrada, precios: snapshot, resultado, creadaPor: actor.id })
      .where(and(eq(cotizacionVersiones.cotizacionId, id), eq(cotizacionVersiones.version, existente.versionActual)));

    return { id, folio: existente.folio, version: existente.versionActual, resultado };
  });
}

export async function obtenerCotizacion(actor: UsuarioSesion | null, id: string): Promise<CotizacionDetalle> {
  requirePermiso(actor, "cotizaciones.propias");
  exigirUuid(id, "Cotización");

  const [fila] = await db
    .select({ cotizacion: cotizaciones, cliente: clientes, vendedor: usuarios.name })
    .from(cotizaciones)
    .leftJoin(clientes, eq(cotizaciones.clienteId, clientes.id))
    .leftJoin(usuarios, eq(cotizaciones.vendedorId, usuarios.id))
    .where(eq(cotizaciones.id, id));
  if (!fila) noEncontrado("Cotización");
  requireVerCotizacion(actor, { vendedorId: fila.cotizacion.vendedorId });

  const [version] = await db
    .select()
    .from(cotizacionVersiones)
    .where(and(eq(cotizacionVersiones.cotizacionId, id), eq(cotizacionVersiones.version, fila.cotizacion.versionActual)));
  if (!version) noEncontrado("Versión de la cotización");

  return {
    id: fila.cotizacion.id,
    folio: fila.cotizacion.folio,
    titulo: fila.cotizacion.titulo,
    solicitante: fila.cotizacion.solicitante,
    estado: fila.cotizacion.estado,
    version: version.version,
    vendedorId: fila.cotizacion.vendedorId,
    vendedor: fila.vendedor,
    cliente: fila.cliente,
    entrada: version.entrada,
    resultado: version.resultado as ResultadoCotizacion,
    actualizadoEn: fila.cotizacion.actualizadoEn,
  };
}

export async function listarCotizaciones(
  actor: UsuarioSesion | null,
  { todas = false }: { todas?: boolean } = {},
): Promise<CotizacionResumen[]> {
  requirePermiso(actor, "cotizaciones.propias");
  const verTodas = todas && tienePermiso(actor, "cotizaciones.ver_todas");

  const filas = await db
    .select({
      cotizacion: cotizaciones,
      cliente: clientes.empresa,
      clienteContacto: clientes.nombreContacto,
      vendedor: usuarios.name,
      resultado: cotizacionVersiones.resultado,
    })
    .from(cotizaciones)
    .leftJoin(clientes, eq(cotizaciones.clienteId, clientes.id))
    .leftJoin(usuarios, eq(cotizaciones.vendedorId, usuarios.id))
    .leftJoin(
      cotizacionVersiones,
      and(eq(cotizacionVersiones.cotizacionId, cotizaciones.id), eq(cotizacionVersiones.version, cotizaciones.versionActual)),
    )
    .where(verTodas ? undefined : eq(cotizaciones.vendedorId, actor.id))
    .orderBy(desc(cotizaciones.actualizadoEn))
    .limit(200);

  return filas.map((f) => ({
    id: f.cotizacion.id,
    folio: f.cotizacion.folio,
    titulo: f.cotizacion.titulo,
    estado: f.cotizacion.estado,
    version: f.cotizacion.versionActual,
    cliente: f.cliente ?? f.clienteContacto ?? null,
    vendedor: f.vendedor,
    vendedorId: f.cotizacion.vendedorId,
    total: totalDe(f.resultado),
    actualizadoEn: f.cotizacion.actualizadoEn,
  }));
}

/** Total de la primera opción: es el número que se muestra en la lista. */
function totalDe(resultado: unknown): string | null {
  const r = resultado as ResultadoCotizacion | null;
  const variante = r?.opciones?.[0]?.variantes?.at(-1);
  return variante?.total ?? null;
}

export async function cambiarEstadoCotizacion(actor: UsuarioSesion | null, id: string, estado: EstadoCotizacion) {
  requirePermiso(actor, "cotizaciones.propias");
  exigirUuid(id, "Cotización");
  const [existente] = await db.select().from(cotizaciones).where(eq(cotizaciones.id, id));
  if (!existente) noEncontrado("Cotización");
  requireVerCotizacion(actor, { vendedorId: existente.vendedorId });

  const [actualizada] = await db.update(cotizaciones).set({ estado }).where(eq(cotizaciones.id, id)).returning();
  return actualizada;
}
