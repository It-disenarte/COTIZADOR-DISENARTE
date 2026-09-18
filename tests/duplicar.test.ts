import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { cotizacionGandhi, PNG_PRUEBA, prepararCatalogo } from "./helpers/cotizacion";
import { ctxId, iniciarSesion, peticion } from "./helpers/http";

vi.mock("@/lib/db", async () => {
  const { crearDbPrueba } = await import("./helpers/db");
  return { db: await crearDbPrueba() };
});

const { db } = await import("@/lib/db");
const { cotizaciones, imagenesCotizacion } = await import("@/lib/db/schema");
const { crearPrimerAdmin } = await import("@/lib/servicios/configuracion-inicial");
const rutaCotizaciones = await import("@/app/api/cotizaciones/route");
const rutaCotizacion = await import("@/app/api/cotizaciones/[id]/route");
const rutaDuplicar = await import("@/app/api/cotizaciones/[id]/duplicar/route");
const rutaImagenes = await import("@/app/api/cotizaciones/[id]/imagenes/route");
const rutaUsuarios = await import("@/app/api/usuarios/route");
const rutaCuentaPassword = await import("@/app/api/cuenta/password/route");

let cookieAdmin = "";
let cookieVentas = "";
let recetaId = "";
let originalId = "";
let imagenOriginal = "";

async function crearVendedor(nombre: string, email: string) {
  await rutaUsuarios.POST(
    peticion("/api/usuarios", {
      metodo: "POST",
      cookie: cookieAdmin,
      cuerpo: { nombre, email, rol: "ventas", passwordTemporal: "Temporal-1234567" },
    }),
    undefined,
  );
  const temporal = await iniciarSesion(email, "Temporal-1234567");
  await rutaCuentaPassword.POST(
    peticion("/api/cuenta/password", {
      metodo: "POST",
      cookie: temporal,
      cuerpo: { actual: "Temporal-1234567", nueva: "Definitiva-1234567" },
    }),
    undefined,
  );
  return iniciarSesion(email, "Definitiva-1234567");
}

const duplicar = (id: string, cookie: string) =>
  rutaDuplicar.POST(peticion(`/api/cotizaciones/${id}/duplicar`, { metodo: "POST", cookie, cuerpo: {} }), ctxId(id));

beforeAll(async () => {
  await crearPrimerAdmin({ nombre: "Admin", email: "admin@disenartemx.com", password: "Admin-Definitiva-2026" });
  cookieAdmin = await iniciarSesion("admin@disenartemx.com", "Admin-Definitiva-2026");
  cookieVentas = await crearVendedor("Vendedora", "ventas@disenartemx.com");
  recetaId = await prepararCatalogo(db);

  const res = await rutaCotizaciones.POST(
    peticion("/api/cotizaciones", { metodo: "POST", cookie: cookieVentas, cuerpo: cotizacionGandhi(recetaId) }),
    undefined,
  );
  originalId = (await res.json()).id;

  // Foto en la opción, para comprobar que también se copia.
  const formulario = new FormData();
  formulario.append("archivo", new File([PNG_PRUEBA as BlobPart], "foto.png", { type: "image/png" }));
  const subida = await rutaImagenes.POST(
    new Request(`http://localhost:3000/api/cotizaciones/${originalId}/imagenes`, {
      method: "POST",
      headers: { cookie: cookieVentas, "x-cotizador": "1" },
      body: formulario,
    }),
    ctxId(originalId),
  );
  imagenOriginal = (await subida.json()).id;
  await rutaCotizacion.PUT(
    peticion(`/api/cotizaciones/${originalId}`, {
      metodo: "PUT",
      cookie: cookieVentas,
      cuerpo: cotizacionGandhi(recetaId, imagenOriginal),
    }),
    ctxId(originalId),
  );
});

describe("Duplicar cotización", () => {
  it("crea un borrador nuevo con folio propio y todo lo capturado", async () => {
    const res = await duplicar(originalId, cookieVentas);
    expect(res.status).toBe(201);
    const copia = await res.json();
    expect(copia.id).not.toBe(originalId);
    expect(copia.folio).toMatch(/^COT-\d{8}-02$/);

    const detalle = await rutaCotizacion.GET(peticion(`/api/cotizaciones/${copia.id}`, { cookie: cookieVentas }), ctxId(copia.id));
    const { cotizacion } = await detalle.json();
    expect(cotizacion.titulo).toBe("Señalética protección civil (copia)");
    expect(cotizacion.estado).toBe("borrador");
    expect(cotizacion.solicitante).toBe("Claudia P.");
    expect(cotizacion.cliente.empresa).toBe("Gandhi");
    expect(cotizacion.entrada.levantamiento.areas).toEqual(["CENDI", "Primaria", "Secundaria"]);
    expect(cotizacion.entrada.reventa[0].nombre).toBe("Detector de humo autónomo 9V");
    expect(cotizacion.entrada.alcance.resumen).toBe("Señalética completa para las 3 áreas.");
    expect(cotizacion.resultado.levantamiento.piezas).toBe("169");
  });

  it("copia la foto como imagen propia de la copia (no comparte la original)", async () => {
    const copia = await (await duplicar(originalId, cookieVentas)).json();
    const detalle = await rutaCotizacion.GET(peticion(`/api/cotizaciones/${copia.id}`, { cookie: cookieVentas }), ctxId(copia.id));
    const { cotizacion } = await detalle.json();
    const imagenCopia = cotizacion.entrada.opciones[0].imagenId;

    expect(imagenCopia).toBeTruthy();
    expect(imagenCopia).not.toBe(imagenOriginal);
    const [fila] = await db.select().from(imagenesCotizacion).where(eq(imagenesCotizacion.id, imagenCopia));
    expect(fila.cotizacionId).toBe(copia.id);
    expect(new Uint8Array(fila.datos)).toEqual(PNG_PRUEBA);
  });

  it("una cotización ganada ya no se edita, pero sí se puede duplicar", async () => {
    await db.update(cotizaciones).set({ estado: "ganada" }).where(eq(cotizaciones.id, originalId));
    const edicion = await rutaCotizacion.PUT(
      peticion(`/api/cotizaciones/${originalId}`, { metodo: "PUT", cookie: cookieVentas, cuerpo: cotizacionGandhi(recetaId) }),
      ctxId(originalId),
    );
    expect(edicion.status).toBe(409);

    const res = await duplicar(originalId, cookieVentas);
    expect(res.status).toBe(201);
    await db.update(cotizaciones).set({ estado: "borrador" }).where(eq(cotizaciones.id, originalId));
  });

  it("otro vendedor no puede duplicar una cotización ajena", async () => {
    const cookieOtro = await crearVendedor("Otro", "otro@disenartemx.com");
    expect((await duplicar(originalId, cookieOtro)).status).toBe(403);
  });

  it("el admin puede duplicar la de cualquiera y la copia queda a su nombre", async () => {
    const copia = await (await duplicar(originalId, cookieAdmin)).json();
    const [fila] = await db.select().from(cotizaciones).where(eq(cotizaciones.id, copia.id));
    const [original] = await db.select().from(cotizaciones).where(eq(cotizaciones.id, originalId));
    expect(fila.vendedorId).not.toBe(original.vendedorId);
  });

  it("exige JSON (un formulario de otro sitio no puede disparar la copia)", async () => {
    const res = await rutaDuplicar.POST(
      new Request(`http://localhost:3000/api/cotizaciones/${originalId}/duplicar`, {
        method: "POST",
        headers: { cookie: cookieVentas },
      }),
      ctxId(originalId),
    );
    expect(res.status).toBe(415);
  });
});
