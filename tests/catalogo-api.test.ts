import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { ctxId, iniciarSesion, peticion } from "./helpers/http";

vi.mock("@/lib/db", async () => {
  const { crearDbPrueba } = await import("./helpers/db");
  return { db: await crearDbPrueba() };
});

const { db } = await import("@/lib/db");
const { insumos, parametros, recetaComponentes, recetas } = await import("@/lib/db/schema");
const { crearPrimerAdmin } = await import("@/lib/servicios/configuracion-inicial");
const rutaUsuarios = await import("@/app/api/usuarios/route");
const rutaCuentaPassword = await import("@/app/api/cuenta/password/route");
const rutaInsumos = await import("@/app/api/insumos/route");
const rutaInsumo = await import("@/app/api/insumos/[id]/route");
const rutaParametros = await import("@/app/api/parametros/route");
const rutaParametro = await import("@/app/api/parametros/[clave]/route");
const rutaClientes = await import("@/app/api/clientes/route");
const rutaCliente = await import("@/app/api/clientes/[id]/route");

const ADMIN = { nombre: "Admin", email: "admin@disenartemx.com", password: "Admin-Definitiva-2026" };

let cookieAdmin = "";
let cookieAgente = "";
let cookieVentas = "";

/** Crea la cuenta desde la API de admin, entra y deja lista la contraseña definitiva. */
async function cuentaLista(rol: "ventas" | "agente_admin", email: string) {
  const temporal = "Temporal-1234567";
  const definitiva = "Definitiva-1234567";
  const res = await rutaUsuarios.POST(
    peticion("/api/usuarios", {
      metodo: "POST",
      cookie: cookieAdmin,
      cuerpo: { nombre: `Prueba ${rol}`, email, rol, passwordTemporal: temporal },
    }),
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

const insumoValido = {
  nombre: "Insumo de prueba",
  categoria: "Sustrato",
  unidadCosto: "m2",
  costo: "123.4567",
  anchoUtilM: "",
  areaLaminaM2: "",
  fuente: "Prueba",
  requiereRevision: false,
};

beforeAll(async () => {
  await crearPrimerAdmin(ADMIN);
  cookieAdmin = await iniciarSesion(ADMIN.email, ADMIN.password);
  cookieAgente = await cuentaLista("agente_admin", "agente@disenartemx.com");
  cookieVentas = await cuentaLista("ventas", "ventas@disenartemx.com");
});

describe("Datos semilla de la especificación", () => {
  it("carga insumos, recetas y parámetros en la migración", async () => {
    expect(await db.select().from(insumos)).toHaveLength(39);
    expect(await db.select().from(recetas)).toHaveLength(11);
    // 16 de la semilla original + el rendimiento de cada vehículo (migración 0010).
    const todos = await db.select().from(parametros);
    expect(todos).toHaveLength(18);
    expect(todos.find((p) => p.clave === "rendimiento_hilux")?.valor).toBe("10.0000");
    expect(todos.find((p) => p.clave === "rendimiento_cx30")?.valor).toBe("14.0000");
  });

  it("carga los precios de operación de la ficha de desarrollo", async () => {
    const filas = await db.select().from(insumos);
    const precio = (nombre: string) => filas.find((i) => i.nombre === nombre);

    expect(precio("Corte de vinil")).toMatchObject({ unidadCosto: "m2", costo: "400.0000" });
    expect(precio("Trovicel 3 mm con impresión")).toMatchObject({ unidadCosto: "m2", costo: "1200.0000" });
    expect(precio("Impresión en vinil UV")?.costo).toBe("1700.0000");
    expect(precio("Fotomural Wall Xtreme")?.costo).toBe("580.8000");
    expect(precio("Corte en acrílico 6 mm")?.costo).toBe("2299.0000");
    expect(precio("Chapetón")).toMatchObject({ unidadCosto: "pieza", costo: "65.0000" });
    expect(precio("Contador digital")?.costo).toBe("3000.0000");
    expect(precio("Enmarcado / caja de 15 cm")?.costo).toBe("4500.0000");
    expect(precio("Tablero dinámico 120 × 244 cm")?.costo).toBe("22044.0000");
    expect(precio("Insumos de aplicación en rotulación")).toMatchObject({ costo: "200.0000", requiereRevision: true });
  });

  it("conserva los costos del Excel como referencia interna, separados por categoría", async () => {
    const [trovicel] = await db.select().from(insumos).where(eq(insumos.nombre, "Trovicel 3 mm"));
    expect(trovicel).toMatchObject({ unidadCosto: "lamina", costo: "228.7900", areaLaminaM2: "2.9768" });
    expect(trovicel.categoria.startsWith("Costo primo · ")).toBe(true);

    const [vinil] = await db.select().from(insumos).where(eq(insumos.nombre, "Vinil de corte 1.22"));
    expect(vinil).toMatchObject({ unidadCosto: "ml", costo: "106.1500", anchoUtilM: "1.2200" });
  });

  it("ninguna receta lleva merma explícita", async () => {
    const todas = await db.select().from(recetas);
    expect(todas.every((r) => Number(r.pctMerma) === 0)).toBe(true);
  });

  it("los pendientes quedan marcados para revisión y sin costo inventado", async () => {
    const todos = await db.select().from(insumos);
    const porRevisar = todos.filter((i) => i.requiereRevision);
    expect(porRevisar.length).toBeGreaterThanOrEqual(15);

    const estireno = todos.find((i) => i.nombre === "Estireno cal. 40 blanco");
    expect(estireno).toMatchObject({ costo: null, unidadCosto: null, requiereRevision: true });

    const [gasolina] = await db.select().from(parametros).where(eq(parametros.clave, "precio_gasolina_litro"));
    expect(gasolina.valor).toBeNull();
  });

  it("los parámetros de la casa traen los valores del PNO", async () => {
    const filas = await db.select().from(parametros);
    const valor = (clave: string) => filas.find((p) => p.clave === clave)?.valor;
    expect(valor("margen")).toBe("0.3000");
    expect(valor("pct_margen_error")).toBe("0.1000");
    expect(valor("pct_consumibles")).toBe("0.0500");
    expect(valor("tarifa_instalador_dia")).toBe("700.0000");
    expect(valor("viaticos_local_dia")).toBe("250.0000");
    expect(valor("viaticos_foraneo_dia")).toBe("500.0000");
    expect(valor("pct_reventa")).toBe("0.3500");
    expect(valor("iva")).toBe("0.1600");
  });

});

describe("Criterio de la fase 2: ventas ve todo sin poder editar", () => {
  it("ventas puede consultar las pestañas del catálogo", async () => {
    for (const [ruta, nombre] of [
      [rutaInsumos, "insumos"],
      [rutaParametros, "parametros"],
    ] as const) {
      const res = await ruta.GET(peticion("/api", { cookie: cookieVentas }), undefined);
      expect(res.status).toBe(200);
      expect((await res.json())[nombre].length).toBeGreaterThan(0);
    }
  });

  it("ventas recibe 403 al crear o editar insumos y parámetros", async () => {
    const [{ id: insumoId }] = await db.select({ id: insumos.id }).from(insumos).limit(1);

    const respuestas = await Promise.all([
      rutaInsumos.POST(peticion("/api/insumos", { metodo: "POST", cookie: cookieVentas, cuerpo: insumoValido }), undefined),
      rutaInsumo.PATCH(
        peticion(`/api/insumos/${insumoId}`, { metodo: "PATCH", cookie: cookieVentas, cuerpo: { costo: "1" } }),
        ctxId(insumoId),
      ),
      rutaParametro.PATCH(
        peticion("/api/parametros/margen", { metodo: "PATCH", cookie: cookieVentas, cuerpo: { valor: "0.9" } }),
        { params: Promise.resolve({ clave: "margen" }) },
      ),
    ]);
    expect(respuestas.map((r) => r.status)).toEqual([403, 403, 403]);

    const [margen] = await db.select().from(parametros).where(eq(parametros.clave, "margen"));
    expect(margen.valor).toBe("0.3000");
  });

  it("ventas sí puede consultar clientes (no es parte del catálogo)", async () => {
    const res = await rutaClientes.GET(peticion("/api/clientes", { cookie: cookieVentas }), undefined);
    expect(res.status).toBe(200);
  });
});

describe("Edición del catálogo por agente_admin", () => {
  let insumoId = "";

  it("crea un insumo", async () => {
    const res = await rutaInsumos.POST(
      peticion("/api/insumos", { metodo: "POST", cookie: cookieAgente, cuerpo: insumoValido }),
      undefined,
    );
    expect(res.status).toBe(201);
    const { insumo } = await res.json();
    insumoId = insumo.id;
    expect(insumo).toMatchObject({ costo: "123.4567", unidadCosto: "m2", archivado: false });
  });

  it("un insumo creado desde el cotizador queda listo para cotizar, con su nombre para el cliente", async () => {
    const res = await rutaInsumos.POST(
      peticion("/api/insumos", {
        metodo: "POST",
        cookie: cookieAgente,
        cuerpo: { ...insumoValido, nombre: "Acrílico espejo plata 3 mm", nombreCliente: "Base de acrílico espejo plata" },
      }),
      undefined,
    );
    const { insumo } = await res.json();
    const { obtenerSnapshot } = await import("@/lib/servicios/snapshot");
    const snapshot = await obtenerSnapshot({ id: "x", nombre: "Agente", rol: "agente_admin", activo: true } as never);
    expect(snapshot.insumos[insumo.id]).toMatchObject({ costo: "123.4567", nombreCliente: "Base de acrílico espejo plata" });
  });

  it("edita el costo y archiva el insumo", async () => {
    const edicion = await rutaInsumo.PATCH(
      peticion(`/api/insumos/${insumoId}`, { metodo: "PATCH", cookie: cookieAgente, cuerpo: { costo: "200" } }),
      ctxId(insumoId),
    );
    expect((await edicion.json()).insumo.costo).toBe("200.0000");

    const res = await rutaInsumo.PATCH(
      peticion(`/api/insumos/${insumoId}`, { metodo: "PATCH", cookie: cookieAgente, cuerpo: { archivado: true } }),
      ctxId(insumoId),
    );
    expect(res.status).toBe(200);

    const [fila] = await db.select().from(insumos).where(eq(insumos.id, insumoId));
    expect(fila).toMatchObject({ costo: "200.0000", archivado: true });
  });

  it("rechaza un costo sin unidad y un parámetro de fracción mayor o igual a 1", async () => {
    const sinUnidad = await rutaInsumos.POST(
      peticion("/api/insumos", { metodo: "POST", cookie: cookieAgente, cuerpo: { ...insumoValido, unidadCosto: "" } }),
      undefined,
    );
    expect(sinUnidad.status).toBe(400);

    const fraccion = await rutaParametro.PATCH(
      peticion("/api/parametros/margen", { metodo: "PATCH", cookie: cookieAgente, cuerpo: { valor: "30" } }),
      { params: Promise.resolve({ clave: "margen" }) },
    );
    expect(fraccion.status).toBe(400);
  });

  it("actualiza un parámetro válido", async () => {
    const res = await rutaParametro.PATCH(
      peticion("/api/parametros/precio_gasolina_litro", { metodo: "PATCH", cookie: cookieAgente, cuerpo: { valor: "24.50" } }),
      { params: Promise.resolve({ clave: "precio_gasolina_litro" }) },
    );
    expect(res.status).toBe(200);
    const [gasolina] = await db.select().from(parametros).where(eq(parametros.clave, "precio_gasolina_litro"));
    expect(gasolina.valor).toBe("24.5000");
  });
});

describe("Clientes", () => {
  let clienteId = "";

  it("ventas puede dar de alta y editar clientes", async () => {
    const res = await rutaClientes.POST(
      peticion("/api/clientes", {
        metodo: "POST",
        cookie: cookieVentas,
        cuerpo: {
          nombreContacto: "Claudia P.",
          empresa: "Gandhi",
          correo: "claudia@ejemplo.mx",
          telefono: "427 100 41 83",
          direccion: "",
          kmDesdeSjr: "58",
          zona: "foraneo",
          notas: "",
        },
      }),
      undefined,
    );
    expect(res.status).toBe(201);
    const { cliente } = await res.json();
    clienteId = cliente.id;
    expect(cliente).toMatchObject({ empresa: "Gandhi", zona: "foraneo", kmDesdeSjr: "58.0000", direccion: null });

    const edicion = await rutaCliente.PATCH(
      peticion(`/api/clientes/${clienteId}`, { metodo: "PATCH", cookie: cookieVentas, cuerpo: { kmDesdeSjr: "60" } }),
      ctxId(clienteId),
    );
    expect(edicion.status).toBe(200);
    expect((await edicion.json()).cliente.kmDesdeSjr).toBe("60.0000");
  });

  it("rechaza un correo inválido", async () => {
    const res = await rutaCliente.PATCH(
      peticion(`/api/clientes/${clienteId}`, { metodo: "PATCH", cookie: cookieVentas, cuerpo: { correo: "no-es-correo" } }),
      ctxId(clienteId),
    );
    expect(res.status).toBe(400);
  });
});


describe("Eliminar insumos", () => {
  const rutaCotizaciones = () => import("@/app/api/cotizaciones/route");
  const eliminar = (id: string, cookie: string) =>
    rutaInsumo.DELETE(peticion(`/api/insumos/${id}`, { metodo: "DELETE", cookie }), ctxId(id));
  const crear = async (nombre: string) => {
    const res = await rutaInsumos.POST(
      peticion("/api/insumos", { metodo: "POST", cookie: cookieAgente, cuerpo: { ...insumoValido, nombre } }),
      undefined,
    );
    return (await res.json()).insumo.id as string;
  };

  it("quien edita el catálogo borra un insumo que ninguna cotización usa", async () => {
    const id = await crear("Insumo que sobra");
    expect((await eliminar(id, cookieAgente)).status).toBe(200);
    expect(await db.select().from(insumos).where(eq(insumos.id, id))).toHaveLength(0);
  });

  it("un insumo que solo está en una receta antigua sin cotizaciones también se puede borrar", async () => {
    const [componente] = await db.select().from(recetaComponentes).limit(1);
    expect((await eliminar(componente.insumoId, cookieAgente)).status).toBe(200);
    expect(await db.select().from(recetaComponentes).where(eq(recetaComponentes.insumoId, componente.insumoId))).toHaveLength(0);
  });

  it("ventas no puede eliminar insumos", async () => {
    const id = await crear("Insumo protegido");
    expect((await eliminar(id, cookieVentas)).status).toBe(403);
  });

  it("un insumo que usa una cotización no se borra: el aviso dice cuál y pide archivarlo", async () => {
    const id = await crear("Vinil en uso");
    const { POST } = await rutaCotizaciones();
    const res = await POST(
      peticion("/api/cotizaciones", {
        metodo: "POST",
        cookie: cookieAgente,
        cuerpo: {
          titulo: "Rotulación de vitrina",
          solicitante: "Ana",
          cliente: { nombreContacto: "Ana", puesto: "", empresa: "", correo: "", telefono: "", direccion: "", kmDesdeSjr: "", zona: "local", notas: "" },
          entrada: {
            levantamiento: { areas: ["Cantidad"], filas: [{ id: "f1", concepto: "Vitrina", anchoM: "2", altoM: "1", cantidades: ["1"] }] },
            opciones: [{ id: "op1", nombre: "Opción 1", materiales: { f1: [{ insumoId: id, modo: "por_m2", cantidad: "1" }] } }],
            incluyeEnvio: false,
            operacion: {
              trabajoEnInstalacionesDisenarte: false,
              diasDiseno: "0",
              disenoMontoManual: "",
              produccion: { personas: 0, dias: "0" },
              instalacion: { incluye: false, personas: 0, dias: "0", escalaPorPieza: false },
              viaticos: { tipo: "local", personas: 0, dias: "0", montoDiaManual: "" },
              hospedaje: { incluye: false, noches: 0, costoNoche: "0" },
              traslado: { kmPorTrayecto: "0", modo: "diario", viajesRedondos: "", rendimientoKmL: "", casetasPorViaje: "0" },
              extras: [],
            },
            presentacion: { operacionProrrateada: true, modalidades: "solo_una" },
            ajustes: { aplicaMargenError: true, aplicaConsumibles: true, margen: "", descuentoDecisionRapida: null },
            reventa: [],
          },
        },
      }),
      undefined,
    );
    const { folio } = await res.json();

    const respuesta = await eliminar(id, cookieAgente);
    expect(respuesta.status).toBe(409);
    expect((await respuesta.json()).error).toContain(`lo usa la cotización ${folio}`);
    expect(await db.select().from(insumos).where(eq(insumos.id, id))).toHaveLength(1);
  });
});
