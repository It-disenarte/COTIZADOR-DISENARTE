import { manejador } from "@/lib/api";
import { requireSesion } from "@/lib/sesion";
import { pdfDeCotizacion } from "@/lib/servicios/pdf";

type Ctx = { params: Promise<{ id: string }> };

// Genera la propuesta al momento y la devuelve para descargar. No se guarda en disco.
export const GET = manejador<Ctx>(async (req, { params }) => {
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
