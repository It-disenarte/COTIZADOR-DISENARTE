import { headers } from "next/headers";
import Link from "next/link";
import { Badge, Button, Card, CardDescription, CardHeader, CardTitle, Select } from "@/components/ui";
import { ENTIDADES_BITACORA } from "@/lib/catalogo/constantes";
import { formatoFechaHora } from "@/lib/formato";
import { tienePermiso } from "@/lib/permisos";
import { autoresBitacora, FiltrosBitacora, listarBitacora } from "@/lib/servicios/bitacora";
import { requireSesion } from "@/lib/sesion";

const ETIQUETA_ACCION = { crear: "Creó", editar: "Editó", archivar: "Archivó" } as const;

/** Campos que cambiaron entre antes y después. */
function cambios(antes: unknown, despues: unknown): { campo: string; antes: string; despues: string }[] {
  const a = (antes ?? {}) as Record<string, unknown>;
  const d = (despues ?? {}) as Record<string, unknown>;
  const texto = (v: unknown) => (v === null || v === undefined || v === "" ? "—" : typeof v === "object" ? JSON.stringify(v) : String(v));
  return [...new Set([...Object.keys(a), ...Object.keys(d)])]
    .filter((k) => k !== "id" && JSON.stringify(a[k]) !== JSON.stringify(d[k]))
    .map((campo) => ({ campo, antes: texto(a[campo]), despues: texto(d[campo]) }));
}

export default async function PaginaBitacora({ searchParams }: PageProps<"/bitacora">) {
  const { usuario } = await requireSesion(await headers());

  if (!tienePermiso(usuario, "bitacora.ver")) {
    return (
      <Card className="mx-auto max-w-md">
        <CardHeader>
          <CardTitle>Sin acceso</CardTitle>
          <CardDescription>La bitácora la consultan el Admin total y el Agente administrador.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const parametros = await searchParams;
  const filtros = FiltrosBitacora.parse(parametros);
  const [{ registros, total, pagina, paginas }, autores] = await Promise.all([
    listarBitacora(usuario, filtros),
    autoresBitacora(usuario),
  ]);

  const enlacePagina = (n: number) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(parametros)) if (typeof v === "string" && v && k !== "pagina") p.set(k, v);
    p.set("pagina", String(n));
    return `/bitacora?${p}`;
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">Bitácora</h1>
        <p className="text-sm text-muted-foreground">Quién cambió qué, con el antes y el después. {total} registros.</p>
      </header>

      <form className="flex flex-wrap items-end gap-3 rounded-lg border bg-card p-4">
        <div className="space-y-1">
          <label htmlFor="entidad" className="text-xs text-muted-foreground">
            Entidad
          </label>
          <Select id="entidad" name="entidad" defaultValue={filtros.entidad ?? ""} className="h-9 w-44">
            <option value="">Todas</option>
            {Object.entries(ENTIDADES_BITACORA).map(([clave, etiqueta]) => (
              <option key={clave} value={clave}>
                {etiqueta}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1">
          <label htmlFor="usuarioId" className="text-xs text-muted-foreground">
            Usuario
          </label>
          <Select id="usuarioId" name="usuarioId" defaultValue={filtros.usuarioId ?? ""} className="h-9 w-48">
            <option value="">Todos</option>
            {autores.map((a) => (
              <option key={a.id} value={a.id}>
                {a.nombre}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1">
          <label htmlFor="desde" className="text-xs text-muted-foreground">
            Desde
          </label>
          <input
            id="desde"
            name="desde"
            type="date"
            defaultValue={filtros.desde ?? ""}
            className="h-9 rounded-md border border-input bg-card px-3 text-sm"
          />
        </div>
        <div className="space-y-1">
          <label htmlFor="hasta" className="text-xs text-muted-foreground">
            Hasta
          </label>
          <input
            id="hasta"
            name="hasta"
            type="date"
            defaultValue={filtros.hasta ?? ""}
            className="h-9 rounded-md border border-input bg-card px-3 text-sm"
          />
        </div>
        <Button type="submit" size="sm">
          Filtrar
        </Button>
        <Link href="/bitacora" className="text-sm text-muted-foreground hover:underline">
          Limpiar
        </Link>
      </form>

      <div className="space-y-3">
        {registros.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">Sin movimientos.</p>}
        {registros.map((r) => {
          const lista = cambios(r.antes, r.despues);
          return (
            <Card key={r.id}>
              <div className="space-y-2 p-4">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <Badge variant={r.accion === "crear" ? "success" : r.accion === "archivar" ? "destructive" : "default"}>
                    {ETIQUETA_ACCION[r.accion]}
                  </Badge>
                  <span className="font-medium">
                    {ENTIDADES_BITACORA[r.entidad as keyof typeof ENTIDADES_BITACORA] ?? r.entidad}
                  </span>
                  <span className="text-muted-foreground">
                    · {r.usuarioNombre ?? "Sistema"} · {formatoFechaHora(r.creadoEn)}
                  </span>
                </div>
                {lista.length > 0 && (
                  <details>
                    <summary className="cursor-pointer text-xs text-muted-foreground">
                      {lista.length} campo{lista.length === 1 ? "" : "s"}
                    </summary>
                    <ul className="mt-2 space-y-1 text-xs">
                      {lista.map((c) => (
                        <li key={c.campo} className="flex flex-wrap gap-2">
                          <span className="font-mono">{c.campo}</span>
                          <span className="text-muted-foreground line-through">{c.antes}</span>
                          <span>→</span>
                          <span>{c.despues}</span>
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </div>
            </Card>
          );
        })}
      </div>

      {paginas > 1 && (
        <div className="flex items-center justify-between text-sm">
          {pagina > 1 ? (
            <Link href={enlacePagina(pagina - 1)} className="hover:underline">
              ← Anteriores
            </Link>
          ) : (
            <span />
          )}
          <span className="text-muted-foreground">
            Página {pagina} de {paginas}
          </span>
          {pagina < paginas ? (
            <Link href={enlacePagina(pagina + 1)} className="hover:underline">
              Siguientes →
            </Link>
          ) : (
            <span />
          )}
        </div>
      )}
    </div>
  );
}
