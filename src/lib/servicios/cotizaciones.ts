import { and, desc, eq, inArray, like, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { EstadoCotizacion } from "@/lib/catalogo/constantes";
import { db } from "@/lib/db";
import { clientes, cotizaciones, cotizacionVersiones, imagenesCotizacion, usuarios } from "@/lib/db/schema";
import { ErrorHttp } from "@/lib/errores";
import {
  calcular,
  type EntradaCotizacion as EntradaMotor,
  ErrorMotor,
  normalizarEntrada,
  type ResultadoCotizacion,
  type Snapshot,
} from "@/lib/motor";
import { requirePermiso, requireVerCotizacion, tienePermiso, type UsuarioSesion } from "@/lib/permisos";
import { pasoDeErrorMotor, textoPendiente } from "@/lib/cotizador/pasos";
import { EntradaCotizacion, pendienteDeEntrada } from "@/lib/validacion/cotizacion";
import type { GuardarCotizacion } from "@/lib/validacion/cotizaciones";
import { exigirUuid, noEncontrado } from "./comun";
import { obtenerSnapshot } from "./snapshot";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Segundo alias de usuarios: quien autorizó, distinto del vendedor. */
const autorizador = alias(usuarios, "autorizador");

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
  /** null mientras el borrador está incompleto. */
  resultado: ResultadoCotizacion | null;
  actualizadoEn: Date;
  /** Fecha en que se autorizó el análisis de costos (PNO Fase 1). null = sin autorizar. */
  autorizadaEn: Date | null;
  autorizadaPor: string | null;
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

type Calculo = { resultado: ResultadoCotizacion | null; pendiente: string | null };

/**
 * Calcula solo si la entrada está completa. Un borrador se guarda aunque falten datos (o aunque
 * al catálogo le falte un costo); mientras tanto no tiene resultado y `pendiente` dice qué falta.
 */
function intentarCalcular(entrada: unknown, snapshot: Snapshot): Calculo {
  const completa = EntradaCotizacion.safeParse(entrada);
  if (!completa.success) return { resultado: null, pendiente: pendienteDeEntrada(entrada) };
  try {
    return { resultado: calcular(completa.data as EntradaMotor, snapshot), pendiente: null };
  } catch (error) {
    if (error instanceof ErrorMotor) {
      return { resultado: null, pendiente: textoPendiente({ paso: pasoDeErrorMotor(error.codigo), mensaje: error.message }) };
    }
    throw error;
  }
}

/** Lo que va al cliente (PDF, mensajes) necesita la cotización completa y calculada. */
export function exigirResultado(cotizacion: { resultado: ResultadoCotizacion | null }): ResultadoCotizacion {
  if (!cotizacion.resultado) {
    throw new ErrorHttp(409, "La cotización todavía está incompleta. Termina de capturarla en el asistente.", "COTIZACION_INCOMPLETA");
  }
  return cotizacion.resultado;
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

export function exigirEditable(cotizacion: { estado: EstadoCotizacion }) {
  if (cotizacion.estado === "ganada" || cotizacion.estado === "perdida") {
    throw new ErrorHttp(409, "Una cotización cerrada ya no se edita; duplícala para hacer otra.", "COTIZACION_CERRADA");
  }
}

export async function guardarCotizacion(
  actor: UsuarioSesion | null,
  datos: GuardarCotizacion,
  id?: string,
): Promise<{ id: string; folio: string; version: number } & Calculo> {
  requirePermiso(actor, "cotizaciones.propias");
  const snapshot = await obtenerSnapshot(actor);
  // Siempre se guarda en la forma actual, aunque llegue en la anterior (pestaña abierta de antes).
  const entrada = normalizarEntrada(datos.entrada as EntradaMotor, snapshot);
  const { resultado, pendiente } = intentarCalcular(entrada, snapshot);

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
        entrada,
        precios: snapshot,
        resultado,
      });
      return { id: cotizacion.id, folio: cotizacion.folio, version: 1, resultado, pendiente };
    }

    exigirUuid(id, "Cotización");
    const [existente] = await tx.select().from(cotizaciones).where(eq(cotizaciones.id, id));
    if (!existente) noEncontrado("Cotización");
    requireVerCotizacion(actor, { vendedorId: existente.vendedorId });
    exigirEditable(existente);

    // Cualquier cambio invalida la autorización anterior: los precios ya no son los revisados.
    await tx
      .update(cotizaciones)
      .set({ ...campos, vendedorId, autorizadaPor: null, autorizadaEn: null })
      .where(eq(cotizaciones.id, id));
    await tx
      .update(cotizacionVersiones)
      .set({ entrada, precios: snapshot, resultado, creadaPor: actor.id })
      .where(and(eq(cotizacionVersiones.cotizacionId, id), eq(cotizacionVersiones.version, existente.versionActual)));

    return { id, folio: existente.folio, version: existente.versionActual, resultado, pendiente };
  });
}

export async function obtenerCotizacion(actor: UsuarioSesion | null, id: string): Promise<CotizacionDetalle> {
  requirePermiso(actor, "cotizaciones.propias");
  exigirUuid(id, "Cotización");

  const [fila] = await db
    .select({ cotizacion: cotizaciones, cliente: clientes, vendedor: usuarios.name, autorizadaPor: autorizador.name })
    .from(cotizaciones)
    .leftJoin(clientes, eq(cotizaciones.clienteId, clientes.id))
    .leftJoin(usuarios, eq(cotizaciones.vendedorId, usuarios.id))
    .leftJoin(autorizador, eq(cotizaciones.autorizadaPor, autorizador.id))
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
    resultado: (version.resultado as ResultadoCotizacion | null) ?? null,
    actualizadoEn: fila.cotizacion.actualizadoEn,
    autorizadaEn: fila.cotizacion.autorizadaEn,
    autorizadaPor: fila.autorizadaPor,
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

/**
 * Copia una cotización como borrador nuevo: folio nuevo, a nombre de quien la duplica,
 * con el mismo cliente, levantamiento, materiales, operación, reventa y fotos.
 * Se recalcula con los precios de hoy; si ya no se puede (p. ej. una receta dejó de
 * ser cotizable), se conserva el cálculo original y el asistente mostrará el aviso.
 */
export async function duplicarCotizacion(actor: UsuarioSesion | null, id: string): Promise<{ id: string; folio: string }> {
  requirePermiso(actor, "cotizaciones.propias");
  exigirUuid(id, "Cotización");

  const [original] = await db.select().from(cotizaciones).where(eq(cotizaciones.id, id));
  if (!original) noEncontrado("Cotización");
  requireVerCotizacion(actor, { vendedorId: original.vendedorId });

  const [version] = await db
    .select()
    .from(cotizacionVersiones)
    .where(and(eq(cotizacionVersiones.cotizacionId, id), eq(cotizacionVersiones.version, original.versionActual)));
  if (!version) noEncontrado("Versión de la cotización");

  const snapshot = await obtenerSnapshot(actor);
  // Las anteriores se copian ya en la forma actual: cada concepto con los insumos de su receta.
  const entrada = normalizarEntrada(version.entrada as EntradaMotor, snapshot);
  const recalculo = intentarCalcular(entrada, snapshot);
  const resultado: unknown = recalculo.resultado ?? version.resultado;
  const precios: unknown = recalculo.resultado ? snapshot : version.precios;

  const sufijo = " (copia)";
  const titulo = `${original.titulo.slice(0, 200 - sufijo.length)}${sufijo}`;

  return db.transaction(async (tx) => {
    const folio = await generarFolio(tx);
    const [nueva] = await tx
      .insert(cotizaciones)
      .values({
        folio,
        titulo,
        solicitante: original.solicitante,
        clienteId: original.clienteId,
        vendedorId: actor.id,
        estado: "borrador",
        versionActual: 1,
      })
      .returning({ id: cotizaciones.id, folio: cotizaciones.folio });

    // Las fotos se copian: así borrar la original no deja a la copia sin ellas.
    const idsImagenes = entrada.opciones.map((o) => o.imagenId).filter((i): i is string => !!i);
    const mapaImagenes = new Map<string, string>();
    if (idsImagenes.length) {
      const imagenes = await tx
        .select()
        .from(imagenesCotizacion)
        .where(and(eq(imagenesCotizacion.cotizacionId, id), inArray(imagenesCotizacion.id, idsImagenes)));
      for (const imagen of imagenes) {
        const [copia] = await tx
          .insert(imagenesCotizacion)
          .values({
            cotizacionId: nueva.id,
            nombre: imagen.nombre,
            tipo: imagen.tipo,
            tamano: imagen.tamano,
            datos: imagen.datos,
            subidaPor: actor.id,
          })
          .returning({ id: imagenesCotizacion.id });
        mapaImagenes.set(imagen.id, copia.id);
      }
    }

    const entradaCopia = {
      ...entrada,
      opciones: entrada.opciones.map((o) => ({ ...o, imagenId: o.imagenId ? (mapaImagenes.get(o.imagenId) ?? null) : null })),
    };
    await tx.insert(cotizacionVersiones).values({
      cotizacionId: nueva.id,
      version: 1,
      creadaPor: actor.id,
      entrada: entradaCopia,
      precios,
      resultado,
    });

    return nueva;
  });
}

/**
 * Autoriza el análisis de costos (PNO-COM-01, punto de control de la Fase 1). Hasta aquí
 * la cotización no se puede comunicar al cliente. Quien autoriza no puede ser quien cotiza:
 * el PNO lo encarga al responsable inmediato.
 */
export async function autorizarCotizacion(actor: UsuarioSesion | null, id: string) {
  requirePermiso(actor, "cotizaciones.autorizar");
  exigirUuid(id, "Cotización");

  const [existente] = await db.select().from(cotizaciones).where(eq(cotizaciones.id, id));
  if (!existente) noEncontrado("Cotización");
  exigirEditable(existente);
  if (existente.autorizadaEn) return existente;

  // Solo se autoriza un análisis completo: un borrador a medias todavía no tiene precios.
  const [version] = await db
    .select({ entrada: cotizacionVersiones.entrada, precios: cotizacionVersiones.precios, resultado: cotizacionVersiones.resultado })
    .from(cotizacionVersiones)
    .where(and(eq(cotizacionVersiones.cotizacionId, id), eq(cotizacionVersiones.version, existente.versionActual)));
  if (!version) noEncontrado("Versión de la cotización");
  if (!version.resultado) {
    const { pendiente } = intentarCalcular(version.entrada, version.precios as Snapshot);
    throw new ErrorHttp(
      409,
      `La cotización todavía está incompleta y no se puede autorizar. ${pendiente ?? "Termina de capturarla."}`,
      "COTIZACION_INCOMPLETA",
    );
  }

  const [autorizada] = await db
    .update(cotizaciones)
    .set({ autorizadaPor: actor.id, autorizadaEn: new Date() })
    .where(eq(cotizaciones.id, id))
    .returning();
  return autorizada;
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

/**
 * Borra una cotización para siempre, con sus datos y sus fotos (la base las borra en cascada).
 * Solo quien la hizo, o quien puede ver las de todo el equipo. El cliente se conserva: puede
 * estar en otras cotizaciones.
 */
export async function eliminarCotizacion(actor: UsuarioSesion | null, id: string) {
  requirePermiso(actor, "cotizaciones.propias");
  exigirUuid(id, "Cotización");
  const [existente] = await db.select().from(cotizaciones).where(eq(cotizaciones.id, id));
  if (!existente) noEncontrado("Cotización");
  requireVerCotizacion(actor, { vendedorId: existente.vendedorId });
  await db.delete(cotizaciones).where(eq(cotizaciones.id, id));
}
