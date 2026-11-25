import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { ctxId, iniciarSesion, peticion } from "./helpers/http";

vi.mock("@/lib/db", async () => {
  const { crearDbPrueba } = await import("./helpers/db");
  return { db: await crearDbPrueba() };
});

const { db } = await import("@/lib/db");
const { imagenesInsumo, insumos } = await import("@/lib/db/schema");
const { crearPrimerAdmin } = await import("@/lib/servicios/configuracion-inicial");
const { obtenerSnapshot } = await import("@/lib/servicios/snapshot");
const { listarInsumos } = await import("@/lib/servicios/insumos");
const rutaUsuarios = await import("@/app/api/usuarios/route");
const rutaCuentaPassword = await import("@/app/api/cuenta/password/route");
const rutaInsumo = await import("@/app/api/insumos/[id]/route");
const rutaImagen = await import("@/app/api/insumos/[id]/imagen/route");

// La imagen de un insumo sale en su ficha del catálogo del asistente: se sube desde el catálogo, la ve cualquiera que
// vea el catálogo y no pesa en el listado (viaja solo su versión).

const ADMIN = { nombre: "Admin", email: "admin@disenartemx.com", password: "Admin-Definitiva-2026" };
let cookieAgente = "";
let cookieVentas = "";
let insumoId = "";

const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
const JPG = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 9, 9, 9, 9]);

async function cuentaLista(cookieAdmin: string, rol: "ventas" | "agente_admin", email: string) {
  const temporal = "Temporal-1234567";
  const definitiva = "Definitiva-1234567";
  const res = await rutaUsuarios.POST(
    peticion("/api/usuarios", { metodo: "POST", cookie: cookieAdmin, cuerpo: { nombre: `Prueba ${rol}`, email, rol, passwordTemporal: temporal } }),
    undefined,
  );
  expect(res.status).toBe(201);
  const cookie = await iniciarSesion(email, temporal);
  await rutaCuentaPassword.POST(
    peticion("/api/cuenta/password", { metodo: "POST", cookie, cuerpo: { actual: temporal, nueva: definitiva } }),
    undefined,
  );
  return cookie;
}

function subida(cookie: string, bytes: Uint8Array, { cabecera = true, id = insumoId } = {}) {
  const formulario = new FormData();
  formulario.append("archivo", new File([bytes as BlobPart], "insumo.png", { type: "image/png" }));
  const headers = new Headers({ cookie });
  if (cabecera) headers.set("x-cotizador", "1");
  return new Request(`http://localhost:3000/api/insumos/${id}/imagen`, { method: "PUT", headers, body: formulario });
}

const ver = (cookie: string, id = insumoId) => rutaImagen.GET(peticion(`/api/insumos/${id}/imagen`, { cookie }), ctxId(id));

beforeAll(async () => {
  await crearPrimerAdmin(ADMIN);
  const cookieAdmin = await iniciarSesion(ADMIN.email, ADMIN.password);
  cookieAgente = await cuentaLista(cookieAdmin, "agente_admin", "agente@disenartemx.com");
  cookieVentas = await cuentaLista(cookieAdmin, "ventas", "ventas@disenartemx.com");
  const [insumo] = await db.select().from(insumos).limit(1);
  insumoId = insumo.id;
});

describe("Imagen de un insumo", () => {
  it("quien edita el catálogo la sube, y se sirve de vuelta con su tipo", async () => {
    const res = await rutaImagen.PUT(subida(cookieAgente, PNG), ctxId(insumoId));
    expect(res.status).toBe(200);
    expect((await res.json()).version).toMatch(/^\d+$/);

    const vista = await ver(cookieAgente);
    expect(vista.status).toBe(200);
    expect(vista.headers.get("content-type")).toBe("image/png");
    expect(new Uint8Array(await vista.arrayBuffer())).toEqual(PNG);
  });

  it("ventas la ve (ve el catálogo) pero no la puede cambiar ni quitar", async () => {
    expect((await ver(cookieVentas)).status).toBe(200);
    expect((await rutaImagen.PUT(subida(cookieVentas, JPG), ctxId(insumoId))).status).toBe(403);
    const quitar = await rutaImagen.DELETE(
      peticion(`/api/insumos/${insumoId}/imagen`, { metodo: "DELETE", cookie: cookieVentas }),
      ctxId(insumoId),
    );
    expect(quitar.status).toBe(403);
  });

  it("exige la cabecera x-cotizador y rechaza lo que no es JPG o PNG aunque diga que sí", async () => {
    expect((await rutaImagen.PUT(subida(cookieAgente, PNG, { cabecera: false }), ctxId(insumoId))).status).toBe(400);
    const falso = new TextEncoder().encode("<script>alert(1)</script>");
    expect((await rutaImagen.PUT(subida(cookieAgente, falso), ctxId(insumoId))).status).toBe(415);
  });

  it("el catálogo y el snapshot del asistente traen solo la versión, no los bytes", async () => {
    const usuario = { id: "x", nombre: "Agente", rol: "agente_admin", activo: true } as never;
    const snapshot = await obtenerSnapshot(usuario);
    expect(snapshot.insumos[insumoId].imagenVersion).toMatch(/^\d+$/);
    const [conImagen] = (await listarInsumos(usuario)).filter((i) => i.id === insumoId);
    expect(conImagen.imagenVersion).toBe(snapshot.insumos[insumoId].imagenVersion);
    expect(JSON.stringify(snapshot)).not.toContain("datos");
  });

  it("al reemplazarla cambia la versión (así el navegador no enseña la vieja)", async () => {
    const antes = (await obtenerSnapshot({ id: "x", nombre: "A", rol: "agente_admin", activo: true } as never)).insumos[insumoId].imagenVersion;
    await new Promise((r) => setTimeout(r, 5));
    const res = await rutaImagen.PUT(subida(cookieAgente, JPG), ctxId(insumoId));
    const { version } = await res.json();
    expect(version).not.toBe(antes);
    expect((await ver(cookieAgente)).headers.get("content-type")).toBe("image/jpeg");
    expect(await db.select().from(imagenesInsumo).where(eq(imagenesInsumo.insumoId, insumoId))).toHaveLength(1);
  });

  it("un insumo sin imagen no trae versión y su imagen responde 404", async () => {
    const [otro] = (await db.select().from(insumos)).filter((i) => i.id !== insumoId);
    expect((await ver(cookieAgente, otro.id)).status).toBe(404);
    const snapshot = await obtenerSnapshot({ id: "x", nombre: "A", rol: "agente_admin", activo: true } as never);
    expect(snapshot.insumos[otro.id].imagenVersion).toBeNull();
  });

  it("se puede quitar, y al borrar el insumo se va con él", async () => {
    const quitar = await rutaImagen.DELETE(
      peticion(`/api/insumos/${insumoId}/imagen`, { metodo: "DELETE", cookie: cookieAgente }),
      ctxId(insumoId),
    );
    expect(quitar.status).toBe(200);
    expect((await ver(cookieAgente)).status).toBe(404);

    // Un insumo nuevo, sin cotizaciones que lo usen: se puede eliminar y su imagen desaparece.
    const [nuevo] = await db.insert(insumos).values({ nombre: "Temporal", categoria: "Sustrato" }).returning();
    await rutaImagen.PUT(subida(cookieAgente, PNG, { id: nuevo.id }), ctxId(nuevo.id));
    expect(await db.select().from(imagenesInsumo).where(eq(imagenesInsumo.insumoId, nuevo.id))).toHaveLength(1);
    const eliminar = await rutaInsumo.DELETE(
      peticion(`/api/insumos/${nuevo.id}`, { metodo: "DELETE", cookie: cookieAgente }),
      ctxId(nuevo.id),
    );
    expect(eliminar.status).toBe(200);
    expect(await db.select().from(imagenesInsumo).where(eq(imagenesInsumo.insumoId, nuevo.id))).toHaveLength(0);
  });
});
