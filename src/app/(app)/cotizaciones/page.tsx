import { FileDown, FilePlus2 } from "lucide-react";
import { headers } from "next/headers";
import Link from "next/link";
import { Badge, Card } from "@/components/ui";
import { ETIQUETA_ESTADO } from "@/lib/catalogo/constantes";
import { formatoFechaHora, formatoMoneda } from "@/lib/formato";
import { requireSesion } from "@/lib/sesion";
import { listarCotizaciones } from "@/lib/servicios/cotizaciones";

export default async function PaginaCotizaciones() {
  const { usuario } = await requireSesion(await headers());
  const cotizaciones = await listarCotizaciones(usuario);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Mis cotizaciones</h1>
          <p className="text-sm text-muted-foreground">Abre un borrador para seguir donde lo dejaste.</p>
        </div>
        <Link
          href="/cotizaciones/nueva"
          className="inline-flex h-10 items-center gap-2 rounded-md bg-accent px-4 text-sm font-medium text-accent-foreground hover:bg-accent/90"
        >
          <FilePlus2 className="size-4" /> Nueva cotización
        </Link>
      </header>

      {cotizaciones.length === 0 ? (
        <p className="py-12 text-center text-sm text-muted-foreground">Todavía no tienes cotizaciones.</p>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">Folio</th>
                  <th className="px-4 py-3 font-medium">Proyecto</th>
                  <th className="px-4 py-3 font-medium">Estado</th>
                  <th className="px-4 py-3 text-right font-medium">Total</th>
                  <th className="px-4 py-3 text-right font-medium">PDF</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {cotizaciones.map((c) => (
                  <tr key={c.id} className="hover:bg-muted/40">
                    <td className="px-4 py-3 align-top">
                      <Link href={`/cotizaciones/${c.id}`} className="font-mono text-xs hover:underline">
                        {c.folio}
                      </Link>
                      <p className="text-xs text-muted-foreground">{formatoFechaHora(c.actualizadoEn)}</p>
                    </td>
                    <td className="px-4 py-3 align-top">
                      <Link href={`/cotizaciones/${c.id}`} className="font-medium hover:underline">
                        {c.titulo}
                      </Link>
                      {c.cliente && <p className="text-xs text-muted-foreground">{c.cliente}</p>}
                    </td>
                    <td className="px-4 py-3 align-top">
                      <Badge variant={c.estado === "ganada" ? "success" : c.estado === "perdida" ? "destructive" : "default"}>
                        {ETIQUETA_ESTADO[c.estado]}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-right align-top">{c.total ? formatoMoneda(c.total) : "—"}</td>
                    <td className="px-4 py-3 text-right align-top">
                      <a
                        href={`/api/cotizaciones/${c.id}/pdf`}
                        className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs hover:bg-muted"
                        title="Descargar la propuesta"
                      >
                        <FileDown className="size-3.5" /> Descargar
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
