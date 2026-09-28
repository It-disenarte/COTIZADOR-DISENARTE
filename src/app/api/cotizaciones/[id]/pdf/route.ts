import { manejador } from "@/lib/api";
import { requireSesion } from "@/lib/sesion";
import { pdfDeCotizacion } from "@/lib/servicios/pdf";

type Ctx = { params: Promise<{ id: string }> };

// Genera la propuesta al momento y la devuelve para descargar. No se guarda en disco.
const generar = manejador<Ctx>(async (req, { params }) => {
  const { usuario } = await requireSesion(req.headers);
  const { id } = await params;
  const { archivo, nombre } = await pdfDeCotizacion(usuario, id);

  // ?ver=1 lo muestra en el navegador (vista previa); sin eso se descarga.
  const verEnLinea = new URL(req.url).searchParams.get("ver") === "1";

  return new Response(archivo as BodyInit, {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `${verEnLinea ? "inline" : "attachment"}; filename="${nombre}"`,
      "content-length": String(archivo.byteLength),
      "cache-control": "no-store",
    },
  });
});

/**
 * La vista previa se abre en otra pestaña: si algo falla, ahí se ve una página con el motivo en
 * lugar del JSON del error. Las descargas desde la pantalla siguen recibiendo JSON.
 */
export async function GET(req: Request, ctx: Ctx): Promise<Response> {
  const respuesta = await generar(req, ctx);
  const verEnLinea = new URL(req.url).searchParams.get("ver") === "1";
  if (!verEnLinea || respuesta.ok) return respuesta;

  const { error } = (await respuesta.json().catch(() => ({}))) as { error?: string };
  return new Response(paginaDeError(error ?? "No se pudo generar la propuesta."), {
    status: respuesta.status,
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
  });
}

const escapar = (texto: string) =>
  texto.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c);

function paginaDeError(mensaje: string): string {
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>No se pudo generar la propuesta</title>
<style>
  body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #fafafb; color: #1d1b22;
         font-family: Poppins, ui-sans-serif, system-ui, sans-serif; padding: 16px; box-sizing: border-box; }
  main { max-width: 32rem; background: #fff; border: 1px solid #e4e1e8; border-radius: 12px; padding: 24px; }
  h1 { color: #7c07a6; font-size: 20px; margin: 0 0 8px; }
  p { margin: 8px 0; line-height: 1.5; }
  .nota { color: #62606a; font-size: 14px; }
</style>
</head>
<body>
<main>
  <h1>No se pudo generar la propuesta</h1>
  <p>${escapar(mensaje)}</p>
  <p class="nota">Cierra esta pestaña y vuelve al asistente para resolverlo.</p>
</main>
</body>
</html>`;
}
