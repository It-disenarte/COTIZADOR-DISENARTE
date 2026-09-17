import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { ctxId, iniciarSesion, intentarIniciarSesion, peticion } from "./helpers/http";

// Toda la app usa un Postgres en memoria con las migraciones reales.
vi.mock("@/lib/db", async () => {
  const { crearDbPrueba } = await import("./helpers/db");
  return { db: await crearDbPrueba() };
});

const { db } = await import("@/lib/db");
const { cuentas, sesiones, usuarios } = await import("@/lib/db/schema");
const { crearORecuperarAdmin, requiereConfiguracionInicial } = await import("@/lib/servicios/configuracion-inicial");
const rutaConfiguracion = await import("@/app/api/configuracion-inicial/route");
const rutaUsuarios = await import("@/app/api/usuarios/route");
const rutaUsuario = await import("@/app/api/usuarios/[id]/route");
const rutaReset = await import("@/app/api/usuarios/[id]/password/route");
const rutaCuentaPassword = await import("@/app/api/cuenta/password/route");

const ADMIN = { nombre: "Admin Diseñarte", email: "admin@disenartemx.com", password: "Admin-Definitiva-2026" };

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

const configurar = (cuerpo: unknown) =>
  rutaConfiguracion.POST(peticion("/api/configuracion-inicial", { metodo: "POST", cuerpo }), undefined);

describe("Configuración inicial (primer admin)", () => {
  it("valida los datos", async () => {
    expect((await configurar({ ...ADMIN, password: "corta" })).status).toBe(400);
    expect((await configurar({ ...ADMIN, email: "no-es-correo" })).status).toBe(400);
    expect(await requiereConfiguracionInicial()).toBe(true);
  });

  it("con solicitudes simultáneas solo se crea una cuenta, admin y sin cambio obligatorio", async () => {
    const respuestas = await Promise.all([
      configurar(ADMIN),
      configurar({ nombre: "Intruso", email: "intruso@x.mx", password: "Intruso-123456" }),
    ]);
    expect(respuestas.map((r) => r.status).sort()).toEqual([201, 409]);

    const todos = await db.select().from(usuarios);
    expect(todos).toHaveLength(1);
    expect(todos[0]).toMatchObject({ email: ADMIN.email, rol: "admin", activo: true, debeCambiarPassword: false });

    const [cuenta] = await db.select().from(cuentas).where(eq(cuentas.userId, todos[0].id));
    expect(cuenta.password?.startsWith("$argon2id$")).toBe(true);
    expect(await requiereConfiguracionInicial()).toBe(false);
  });

  it("después ya no se puede usar", async () => {
    expect((await configurar({ nombre: "Otro", email: "otro@x.mx", password: "Otro-Password-123" })).status).toBe(409);
    expect(await db.select().from(usuarios)).toHaveLength(1);
  });

  it("el admin entra directo con la contraseña que eligió", async () => {
    cookieAdmin = await iniciarSesion(ADMIN.email, ADMIN.password);
    const res = await rutaUsuarios.GET(peticion("/api/usuarios", { cookie: cookieAdmin }), undefined);
    expect(res.status).toBe(200);
  });
});

describe("Cambio obligatorio de contraseña", () => {
  const temporal = "Temporal-Admin-2026";
  const nueva = "Otra-Admin-Definitiva-2026";
  let segundoAdmin = "";

  beforeAll(async () => {
    await crearComoAdmin({ nombre: "Segundo admin", email: "admin2@disenartemx.com", rol: "admin", passwordTemporal: temporal });
    segundoAdmin = await iniciarSesion("admin2@disenartemx.com", temporal);
  });

  it("sin sesión la API responde 401", async () => {
    const res = await rutaUsuarios.GET(peticion("/api/usuarios"), undefined);
    expect(res.status).toBe(401);
  });

  it("con contraseña temporal, incluso un admin recibe 403 en el resto de la API", async () => {
    const res = await rutaUsuarios.GET(peticion("/api/usuarios", { cookie: segundoAdmin }), undefined);
    expect(res.status).toBe(403);
  });

  it("rechaza una contraseña actual incorrecta", async () => {
    const res = await rutaCuentaPassword.POST(
      peticion("/api/cuenta/password", { metodo: "POST", cookie: segundoAdmin, cuerpo: { actual: "no-es-esta-123", nueva } }),
      undefined,
    );
    expect(res.status).toBe(400);
  });

  it("al cambiarla se libera la API y la contraseña anterior deja de servir", async () => {
    const res = await rutaCuentaPassword.POST(
      peticion("/api/cuenta/password", { metodo: "POST", cookie: segundoAdmin, cuerpo: { actual: temporal, nueva } }),
      undefined,
    );
    expect(res.status).toBe(200);

    const lista = await rutaUsuarios.GET(peticion("/api/usuarios", { cookie: segundoAdmin }), undefined);
    expect(lista.status).toBe(200);

    expect((await intentarIniciarSesion("admin2@disenartemx.com", temporal)).ok).toBe(false);
    expect((await intentarIniciarSesion("admin2@disenartemx.com", nueva)).ok).toBe(true);
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

  it("la API nunca devuelve contraseñas ni hashes", async () => {
    const res = await rutaUsuarios.GET(peticion("/api/usuarios", { cookie: cookieAdmin }), undefined);
    const texto = JSON.stringify(await res.json());
    expect(texto).not.toContain("$argon2");
    expect(texto).not.toContain("password");
  });

  describe("Comando crear-admin (recuperación de acceso)", () => {
    it("crea un admin nuevo que entra sin cambio obligatorio", async () => {
      expect(
        await crearORecuperarAdmin({ nombre: "Admin CLI", email: "cli@disenartemx.com", password: "Cli-Password-2026" }),
      ).toBe("creado");
      const [fila] = await db.select().from(usuarios).where(eq(usuarios.email, "cli@disenartemx.com"));
      expect(fila).toMatchObject({ rol: "admin", activo: true, debeCambiarPassword: false });
      const cookie = await iniciarSesion("cli@disenartemx.com", "Cli-Password-2026");
      expect((await rutaUsuarios.GET(peticion("/api/usuarios", { cookie }), undefined)).status).toBe(200);
    });

    it("recupera una cuenta existente desactivada: nueva contraseña, admin, activa y sin sesiones", async () => {
      await rutaUsuario.PATCH(
        peticion(`/api/usuarios/${ventas.id}`, { metodo: "PATCH", cookie: cookieAdmin, cuerpo: { activo: false } }),
        ctxId(ventas.id),
      );

      expect(
        await crearORecuperarAdmin({ nombre: "ignorado", email: "VENTAS@disenartemx.com", password: "Recuperada-2026" }),
      ).toBe("recuperado");

      const [fila] = await db.select().from(usuarios).where(eq(usuarios.id, ventas.id));
      expect(fila).toMatchObject({ rol: "admin", activo: true, debeCambiarPassword: false, name: "Prueba ventas" });
      expect(await db.select().from(sesiones).where(eq(sesiones.userId, ventas.id))).toHaveLength(0);
      expect((await rutaUsuarios.GET(peticion("/api/usuarios", { cookie: ventas.cookie }), undefined)).status).toBe(401);

      expect((await intentarIniciarSesion("ventas@disenartemx.com", ventas.password)).ok).toBe(false);
      expect((await intentarIniciarSesion("ventas@disenartemx.com", "Recuperada-2026")).ok).toBe(true);
    });

    it("valida la contraseña", async () => {
      await expect(crearORecuperarAdmin({ nombre: "X", email: "x@disenartemx.com", password: "corta" })).rejects.toThrow();
    });
  });
});
