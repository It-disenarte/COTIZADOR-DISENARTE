import { beforeAll, describe, expect, it, vi } from "vitest";
import { ctxId, iniciarSesion, peticion } from "./helpers/http";

vi.mock("@/lib/db", async () => {
  const { crearDbPrueba } = await import("./helpers/db");
  return { db: await crearDbPrueba() };
});

const { db } = await import("@/lib/db");
const { insumos } = await import("@/lib/db/schema");
const { crearPrimerAdmin } = await import("@/lib/servicios/configuracion-inicial");
const { obtenerSnapshot } = await import("@/lib/servicios/snapshot");
const { listarInsumos } = await import("@/lib/servicios/insumos");
const rutaUsuarios = await import("@/app/api/usuarios/route");
const rutaCuentaPassword = await import("@/app/api/cuenta/password/route");
const rutaVinculo = await import("@/app/api/proveedores/[id]/insumos/[insumoId]/route");
const rutaProveedores = await import("@/app/api/proveedores/route");
const rutaProveedor = await import("@/app/api/proveedores/[id]/route");

// Los proveedores son a quien se le compra: un proveedor surte varios insumos y un insumo puede venir de varios.

const ADMIN = { nombre: "Admin", email: "admin@disenartemx.com", password: "Admin-Definitiva-2026" };
let cookieAdmin = "";
let cookieVentas = "";
let insumoId = "";

const actor = { id: "x", nombre: "Agente", rol: "agente_admin", activo: true } as never;

async function crear(cuerpo: Record<string, unknown>, cookie = cookieAdmin) {
  return rutaProveedores.POST(peticion("/api/proveedores", { metodo: "POST", cookie, cuerpo }), undefined);
}
function vincular(proveedorId: string, metodo: "PUT" | "DELETE" = "PUT", cookie = cookieAdmin, insumo = insumoId) {
  const manejar = metodo === "PUT" ? rutaVinculo.PUT : rutaVinculo.DELETE;
  return manejar(peticion(`/api/proveedores/${proveedorId}/insumos/${insumo}`, { metodo, cookie }), {
    params: Promise.resolve({ id: proveedorId, insumoId: insumo }),
  });
}

const proveedoresDe = async (id: string) =>
  (await listarInsumos(actor)).find((i) => i.id === id)!.proveedores!.map((p) => p.nombre);

const totales = async () => {
  const lista = await (await rutaProveedores.GET(peticion("/api/proveedores", { cookie: cookieAdmin }), undefined)).json();
  return Object.fromEntries(lista.proveedores.map((p: { nombre: string; totalInsumos: number }) => [p.nombre, p.totalInsumos]));
};

beforeAll(async () => {
  await crearPrimerAdmin(ADMIN);
  cookieAdmin = await iniciarSesion(ADMIN.email, ADMIN.password);
  const temporal = "Temporal-1234567";
  const definitiva = "Definitiva-1234567";
  await rutaUsuarios.POST(
    peticion("/api/usuarios", {
      metodo: "POST",
      cookie: cookieAdmin,
      cuerpo: { nombre: "Ventas", email: "ventas@disenartemx.com", rol: "ventas", passwordTemporal: temporal },
    }),
    undefined,
  );
  cookieVentas = await iniciarSesion("ventas@disenartemx.com", temporal);
  await rutaCuentaPassword.POST(
    peticion("/api/cuenta/password", { metodo: "POST", cookie: cookieVentas, cuerpo: { actual: temporal, nueva: definitiva } }),
    undefined,
  );
  const [insumo] = await db.select().from(insumos).limit(1);
  insumoId = insumo.id;
});

describe("Proveedores", () => {
  let proveedorId = "";

  it("se crea con contacto, ubicación, etiqueta de confianza y comentario", async () => {
    const res = await crear({
      nombre: "Vinilos del Bajío",
      contacto: "Laura · 427 000 0000",
      ubicacion: "Querétaro",
      confiable: true,
      comentario: "Entrega en 24 h",
    });
    expect(res.status).toBe(201);
    const { proveedor } = await res.json();
    proveedorId = proveedor.id;
    expect(proveedor).toMatchObject({ nombre: "Vinilos del Bajío", confiable: true, totalInsumos: 0 });
  });

  it("pide el nombre", async () => {
    expect((await crear({ nombre: "  ", confiable: true })).status).toBe(400);
  });

  it("ventas lo ve pero no lo crea, cambia ni borra", async () => {
    const lista = await rutaProveedores.GET(peticion("/api/proveedores", { cookie: cookieVentas }), undefined);
    expect(lista.status).toBe(200);
    expect((await crear({ nombre: "Otro", confiable: true }, cookieVentas)).status).toBe(403);
    const cambio = await rutaProveedor.PATCH(
      peticion(`/api/proveedores/${proveedorId}`, { metodo: "PATCH", cookie: cookieVentas, cuerpo: { confiable: false } }),
      ctxId(proveedorId),
    );
    expect(cambio.status).toBe(403);
    const borrar = await rutaProveedor.DELETE(
      peticion(`/api/proveedores/${proveedorId}`, { metodo: "DELETE", cookie: cookieVentas }),
      ctxId(proveedorId),
    );
    expect(borrar.status).toBe(403);
  });

  it("la etiqueta de confianza y el comentario se pueden cambiar", async () => {
    const res = await rutaProveedor.PATCH(
      peticion(`/api/proveedores/${proveedorId}`, {
        metodo: "PATCH",
        cookie: cookieAdmin,
        cuerpo: { confiable: false, comentario: "Se atrasó dos veces" },
      }),
      ctxId(proveedorId),
    );
    expect(res.status).toBe(200);
    expect((await res.json()).proveedor).toMatchObject({ confiable: false, comentario: "Se atrasó dos veces" });
  });

  it("un insumo puede venir de varios proveedores y un proveedor surtir varios insumos", async () => {
    const { proveedor: otro } = await (await crear({ nombre: "Acrílicos MX", confiable: true })).json();
    const [, segundo] = await db.select().from(insumos).limit(2);

    expect((await vincular(proveedorId)).status).toBe(200);
    expect((await vincular(otro.id)).status).toBe(200);
    expect((await vincular(proveedorId, "PUT", cookieAdmin, segundo.id)).status).toBe(200);
    // Arrastrarlo dos veces al mismo no lo duplica.
    expect((await vincular(proveedorId)).status).toBe(200);

    expect(await proveedoresDe(insumoId)).toEqual(["Acrílicos MX", "Vinilos del Bajío"]);
    expect(await totales()).toEqual({ "Acrílicos MX": 1, "Vinilos del Bajío": 2 });
    expect((await obtenerSnapshot(actor)).insumos[insumoId].proveedores).toEqual(["Acrílicos MX", "Vinilos del Bajío"]);
  });

  it("quitar un proveedor de un insumo no toca a los demás", async () => {
    expect((await vincular(proveedorId, "DELETE")).status).toBe(200);
    expect(await proveedoresDe(insumoId)).toEqual(["Acrílicos MX"]);
  });

  it("no se asigna un proveedor que no existe, y ventas no asigna ni quita", async () => {
    expect((await vincular("00000000-0000-4000-8000-000000000000")).status).toBe(404);
    expect((await vincular(proveedorId, "PUT", cookieVentas)).status).toBe(403);
    expect((await vincular(proveedorId, "DELETE", cookieVentas)).status).toBe(403);
  });

  it("al borrar al proveedor, sus insumos se quedan (solo dejan de tenerlo)", async () => {
    await vincular(proveedorId);
    const res = await rutaProveedor.DELETE(
      peticion(`/api/proveedores/${proveedorId}`, { metodo: "DELETE", cookie: cookieAdmin }),
      ctxId(proveedorId),
    );
    expect(res.status).toBe(200);
    expect(await proveedoresDe(insumoId)).toEqual(["Acrílicos MX"]);
  });
});
