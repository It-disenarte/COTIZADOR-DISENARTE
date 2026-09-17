import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { ctxId, iniciarSesion, intentarIniciarSesion, peticion } from "./helpers/http";

// Toda la app usa un Postgres en memoria con las migraciones reales.
vi.mock("@/lib/db", async () => {
  const { crearDbPrueba } = await import("./helpers/db");
  return { db: await crearDbPrueba() };
});

const { db } = await import("@/lib/db");
const { bitacora, cuentas, usuarios } = await import("@/lib/db/schema");
const { sembrarAdmin } = await import("@/lib/seed");
const rutaUsuarios = await import("@/app/api/usuarios/route");
const rutaUsuario = await import("@/app/api/usuarios/[id]/route");
const rutaReset = await import("@/app/api/usuarios/[id]/password/route");
const rutaCuentaPassword = await import("@/app/api/cuenta/password/route");

const ADMIN = { email: "admin@disenartemx.com", password: "Temporal-Admin-2026" };
const ADMIN_NUEVA = "Admin-Definitiva-2026";

let cookieAdmin = "";

async function crearComoAdmin(datos: { nombre: string; email: string; rol: string; passwordTemporal: string }) {
  const res = await rutaUsuarios.POST(peticion("/api/usuarios", { metodo: "POST", cookie: cookieAdmin, cuerpo: datos }), undefined);
  expect(res.status).toBe(201);
  return (await res.json()).usuario as { id: string };
}

/** Crea la cuenta, la entra, cambia la contraseña temporal y devuelve la cookie ya habilitada. */
async function cuentaLista(rol: "ventas" | "agente_admin", email: string) {
  const temporal = "Temporal-1234567";
  const definitiva = "Definitiva-1234567";
  const { id } = await crearComoAdmin({ nombre: `Prueba ${rol}`, email, rol, passwordTemporal: temporal });
  const cookie = await iniciarSesion(email, temporal);
  const res = await rutaCuentaPassword.POST(
    peticion("/api/cuenta/password", { metodo: "POST", cookie, cuerpo: { actual: temporal, nueva: definitiva } }),
    undefined,
  );
  expect(res.status).toBe(200);
  return { id, cookie, password: definitiva };
}

describe("Seed de la cuenta admin", () => {
  it("crea la cuenta una sola vez, con argon2id y cambio obligatorio", async () => {
    expect(await sembrarAdmin(db, ADMIN)).toBe("creado");
    expect(await sembrarAdmin(db, { ...ADMIN, password: "Otra-Password-9999" })).toBe("ya_existia");

    const filas = await db.select().from(usuarios).where(eq(usuarios.email, ADMIN.email));
    expect(filas).toHaveLength(1);
    expect(filas[0]).toMatchObject({ rol: "admin", activo: true, debeCambiarPassword: true });

    const [cuenta] = await db.select().from(cuentas).where(eq(cuentas.userId, filas[0].id));
    expect(cuenta.password?.startsWith("$argon2id$")).toBe(true);
  });

  it("rechaza contraseñas cortas y variables faltantes", async () => {
    await expect(sembrarAdmin(db, { email: "x@y.mx", password: "corta" })).rejects.toThrow();
    await expect(sembrarAdmin(db, { email: undefined, password: undefined })).rejects.toThrow();
  });
});

describe("Cambio obligatorio de contraseña", () => {
  beforeAll(async () => {
    cookieAdmin = await iniciarSesion(ADMIN.email, ADMIN.password);
  });

  it("sin sesión la API responde 401", async () => {
    const res = await rutaUsuarios.GET(peticion("/api/usuarios"), undefined);
    expect(res.status).toBe(401);
  });

  it("mientras no cambie la contraseña, el admin recibe 403 en el resto de la API", async () => {
    const res = await rutaUsuarios.GET(peticion("/api/usuarios", { cookie: cookieAdmin }), undefined);
    expect(res.status).toBe(403);
  });

  it("rechaza una contraseña actual incorrecta", async () => {
    const res = await rutaCuentaPassword.POST(
      peticion("/api/cuenta/password", { metodo: "POST", cookie: cookieAdmin, cuerpo: { actual: "no-es-esta-123", nueva: ADMIN_NUEVA } }),
      undefined,
    );
    expect(res.status).toBe(400);
  });

  it("al cambiarla se libera la API y la contraseña anterior deja de servir", async () => {
    const res = await rutaCuentaPassword.POST(
      peticion("/api/cuenta/password", { metodo: "POST", cookie: cookieAdmin, cuerpo: { actual: ADMIN.password, nueva: ADMIN_NUEVA } }),
      undefined,
    );
    expect(res.status).toBe(200);

    const lista = await rutaUsuarios.GET(peticion("/api/usuarios", { cookie: cookieAdmin }), undefined);
    expect(lista.status).toBe(200);

    expect((await intentarIniciarSesion(ADMIN.email, ADMIN.password)).ok).toBe(false);
    expect((await intentarIniciarSesion(ADMIN.email, ADMIN_NUEVA)).ok).toBe(true);
  });

  it("el registro público está deshabilitado", async () => {
    const { auth } = await import("@/lib/auth");
    const res = await auth.handler(
      new Request("http://localhost:3000/api/auth/sign-up/email", {
        method: "POST",
        headers: { "content-type": "application/json", origin: "http://localhost:3000" },
        body: JSON.stringify({ email: "intruso@x.mx", password: "Intruso-123456", name: "Intruso" }),
      }),
    );
    expect(res.ok).toBe(false);
    const [intruso] = await db.select().from(usuarios).where(eq(usuarios.email, "intruso@x.mx"));
    expect(intruso).toBeUndefined();
  });
});

describe("Caso 5 — permisos por rol en la API", () => {
  let ventas: Awaited<ReturnType<typeof cuentaLista>>;
  let agente: Awaited<ReturnType<typeof cuentaLista>>;

  const nuevoUsuario = { nombre: "No debería", email: "nodeberia@x.mx", rol: "ventas", passwordTemporal: "Temporal-1234567" };

  beforeAll(async () => {
    ventas = await cuentaLista("ventas", "ventas@disenartemx.com");
    agente = await cuentaLista("agente_admin", "agente@disenartemx.com");
  });

  it("ventas recibe 403 al crear usuario", async () => {
    const res = await rutaUsuarios.POST(peticion("/api/usuarios", { metodo: "POST", cookie: ventas.cookie, cuerpo: nuevoUsuario }), undefined);
    expect(res.status).toBe(403);
  });

  it("ventas recibe 403 al listar, editar o restablecer usuarios", async () => {
    expect((await rutaUsuarios.GET(peticion("/api/usuarios", { cookie: ventas.cookie }), undefined)).status).toBe(403);
    const editar = await rutaUsuario.PATCH(
      peticion(`/api/usuarios/${ventas.id}`, { metodo: "PATCH", cookie: ventas.cookie, cuerpo: { rol: "admin" } }),
      ctxId(ventas.id),
    );
    expect(editar.status).toBe(403);
    const reset = await rutaReset.POST(
      peticion(`/api/usuarios/${agente.id}/password`, { metodo: "POST", cookie: ventas.cookie, cuerpo: { passwordTemporal: "Temporal-1234567" } }),
      ctxId(agente.id),
    );
    expect(reset.status).toBe(403);
  });

  it("agente_admin recibe 403 al crear usuario o cambiar roles", async () => {
    const crear = await rutaUsuarios.POST(peticion("/api/usuarios", { metodo: "POST", cookie: agente.cookie, cuerpo: nuevoUsuario }), undefined);
    expect(crear.status).toBe(403);
    const rol = await rutaUsuario.PATCH(
      peticion(`/api/usuarios/${agente.id}`, { metodo: "PATCH", cookie: agente.cookie, cuerpo: { rol: "admin" } }),
      ctxId(agente.id),
    );
    expect(rol.status).toBe(403);

    const [sinCambio] = await db.select().from(usuarios).where(eq(usuarios.id, agente.id));
    expect(sinCambio.rol).toBe("agente_admin");
    const [noCreado] = await db.select().from(usuarios).where(eq(usuarios.email, nuevoUsuario.email));
    expect(noCreado).toBeUndefined();
  });

  it("admin puede cambiar rol; el cambio aplica en la siguiente petición", async () => {
    const res = await rutaUsuario.PATCH(
      peticion(`/api/usuarios/${ventas.id}`, { metodo: "PATCH", cookie: cookieAdmin, cuerpo: { rol: "admin" } }),
      ctxId(ventas.id),
    );
    expect(res.status).toBe(200);
    expect((await rutaUsuarios.GET(peticion("/api/usuarios", { cookie: ventas.cookie }), undefined)).status).toBe(200);

    await rutaUsuario.PATCH(
      peticion(`/api/usuarios/${ventas.id}`, { metodo: "PATCH", cookie: cookieAdmin, cuerpo: { rol: "ventas" } }),
      ctxId(ventas.id),
    );
    expect((await rutaUsuarios.GET(peticion("/api/usuarios", { cookie: ventas.cookie }), undefined)).status).toBe(403);
  });

  it("valida datos y rechaza correos duplicados", async () => {
    const invalido = await rutaUsuarios.POST(
      peticion("/api/usuarios", { metodo: "POST", cookie: cookieAdmin, cuerpo: { ...nuevoUsuario, passwordTemporal: "corta" } }),
      undefined,
    );
    expect(invalido.status).toBe(400);
    const duplicado = await rutaUsuarios.POST(
      peticion("/api/usuarios", { metodo: "POST", cookie: cookieAdmin, cuerpo: { ...nuevoUsuario, email: "VENTAS@disenartemx.com" } }),
      undefined,
    );
    expect(duplicado.status).toBe(409);
  });

  it("el admin no puede desactivarse ni quitarse el rol a sí mismo", async () => {
    const [admin] = await db.select().from(usuarios).where(eq(usuarios.email, ADMIN.email));
    const desactivar = await rutaUsuario.PATCH(
      peticion(`/api/usuarios/${admin.id}`, { metodo: "PATCH", cookie: cookieAdmin, cuerpo: { activo: false } }),
      ctxId(admin.id),
    );
    expect(desactivar.status).toBe(400);
    const degradar = await rutaUsuario.PATCH(
      peticion(`/api/usuarios/${admin.id}`, { metodo: "PATCH", cookie: cookieAdmin, cuerpo: { rol: "ventas" } }),
      ctxId(admin.id),
    );
    expect(degradar.status).toBe(400);
  });

  it("restablecer contraseña cierra sesiones y vuelve a exigir el cambio", async () => {
    const res = await rutaReset.POST(
      peticion(`/api/usuarios/${agente.id}/password`, { metodo: "POST", cookie: cookieAdmin, cuerpo: { passwordTemporal: "Reset-Temporal-99" } }),
      ctxId(agente.id),
    );
    expect(res.status).toBe(200);
    expect((await rutaUsuarios.GET(peticion("/api/usuarios", { cookie: agente.cookie }), undefined)).status).toBe(401);

    const nuevaCookie = await iniciarSesion("agente@disenartemx.com", "Reset-Temporal-99");
    const bloqueado = await rutaCuentaPassword.POST(
      peticion("/api/cuenta/password", { metodo: "POST", cookie: nuevaCookie, cuerpo: { actual: "Reset-Temporal-99", nueva: "Otra-Definitiva-99" } }),
      undefined,
    );
    expect(bloqueado.status).toBe(200);
  });

  it("una cuenta desactivada pierde su sesión, no puede entrar y conserva sus datos", async () => {
    const res = await rutaUsuario.PATCH(
      peticion(`/api/usuarios/${ventas.id}`, { metodo: "PATCH", cookie: cookieAdmin, cuerpo: { activo: false } }),
      ctxId(ventas.id),
    );
    expect(res.status).toBe(200);

    expect((await rutaCuentaPassword.POST(
      peticion("/api/cuenta/password", { metodo: "POST", cookie: ventas.cookie, cuerpo: { actual: ventas.password, nueva: "Cualquier-123456" } }),
      undefined,
    )).status).toBe(401);

    const intento = await intentarIniciarSesion("ventas@disenartemx.com", ventas.password);
    expect(intento.ok).toBe(false);
    expect(intento.status).toBe(403);

    const [conservado] = await db.select().from(usuarios).where(eq(usuarios.id, ventas.id));
    expect(conservado).toMatchObject({ activo: false, email: "ventas@disenartemx.com" });

    // Reactivar permite volver a entrar.
    await rutaUsuario.PATCH(
      peticion(`/api/usuarios/${ventas.id}`, { metodo: "PATCH", cookie: cookieAdmin, cuerpo: { activo: true } }),
      ctxId(ventas.id),
    );
    expect((await intentarIniciarSesion("ventas@disenartemx.com", ventas.password)).ok).toBe(true);
  });

  it("la bitácora registra los cambios de usuarios sin guardar contraseñas", async () => {
    const filas = await db.select().from(bitacora).where(eq(bitacora.entidad, "usuarios"));
    expect(filas.some((f) => f.accion === "crear" && f.entidadId === ventas.id)).toBe(true);
    expect(filas.some((f) => f.accion === "editar" && f.entidadId === ventas.id)).toBe(true);
    const texto = JSON.stringify(filas);
    expect(texto).not.toContain("$argon2");
    expect(texto).not.toContain("Temporal-1234567");
  });
});
