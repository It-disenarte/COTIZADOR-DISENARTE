"use client";

import { RefreshCw, TriangleAlert } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Aviso, Badge, Button, Card, Input } from "@/components/ui";
import { diasDesde, formatoFechaHora } from "@/lib/formato";
import type { Parametro } from "@/lib/servicios/parametros";
import { llamarApi } from "@/lib/utils";

const DIAS_AVISO_GASOLINA = 7;

export function TablaParametros({ parametros, puedeEditar }: { parametros: Parametro[]; puedeEditar: boolean }) {
  const router = useRouter();
  const [actualizando, iniciarTransicion] = useTransition();
  const [valores, setValores] = useState<Record<string, string>>({});
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState<{ tipo: "ok" | "error"; texto: string } | null>(null);

  const valorDe = (p: Parametro) => valores[p.clave] ?? p.valor ?? "";
  const cambiado = (p: Parametro) => valorDe(p) !== (p.valor ?? "");

  async function guardar(p: Parametro) {
    setOcupado(p.clave);
    setMensaje(null);
    try {
      await llamarApi(`/api/parametros/${p.clave}`, "PATCH", { valor: valorDe(p) });
      setValores((v) => {
        const copia = { ...v };
        delete copia[p.clave];
        return copia;
      });
      setMensaje({ tipo: "ok", texto: `Parámetro "${p.clave}" actualizado.` });
      iniciarTransicion(() => router.refresh());
    } catch (e) {
      setMensaje({ tipo: "error", texto: e instanceof Error ? e.message : "No se pudo guardar." });
    } finally {
      setOcupado(null);
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Los porcentajes se guardan como fracción: 0.30 significa 30%. Las claves las usa el motor de cálculo, por eso
        no se pueden cambiar ni agregar desde aquí.
      </p>
      {mensaje && <Aviso tipo={mensaje.tipo}>{mensaje.texto}</Aviso>}
      {actualizando && <RefreshCw className="size-4 animate-spin text-muted-foreground" aria-label="Actualizando" />}

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Parámetro</th>
                <th className="px-4 py-3 font-medium">Valor</th>
                <th className="px-4 py-3 font-medium">Última actualización</th>
                {puedeEditar && <th className="px-4 py-3" />}
              </tr>
            </thead>
            <tbody className="divide-y">
              {parametros.map((p) => {
                const desactualizado =
                  p.clave === "precio_gasolina_litro" && (p.valor == null || diasDesde(p.actualizadoEn) > DIAS_AVISO_GASOLINA);
                return (
                  <tr key={p.clave}>
                    <td className="px-4 py-3 align-top">
                      <p className="font-mono text-xs">{p.clave}</p>
                      <p className="mt-1 max-w-md text-xs text-muted-foreground">{p.descripcion}</p>
                    </td>
                    <td className="px-4 py-3 align-top">
                      <div className="flex items-center gap-2">
                        {puedeEditar ? (
                          <Input
                            className="h-9 w-32"
                            inputMode="decimal"
                            aria-label={`Valor de ${p.clave}`}
                            value={valorDe(p)}
                            onChange={(e) => setValores((v) => ({ ...v, [p.clave]: e.target.value }))}
                          />
                        ) : (
                          <span className={p.valor == null ? "text-accent" : ""}>{p.valor ?? "Por capturar"}</span>
                        )}
                        <span className="text-xs text-muted-foreground">{p.unidad}</span>
                      </div>
                      {desactualizado && (
                        <p className="mt-1 flex items-center gap-1 text-xs text-accent">
                          <TriangleAlert className="size-3.5" />
                          {p.valor == null ? "Falta capturar el precio" : `Tiene más de ${DIAS_AVISO_GASOLINA} días sin actualizar`}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3 align-top text-xs text-muted-foreground">
                      {formatoFechaHora(p.actualizadoEn)}
                    </td>
                    {puedeEditar && (
                      <td className="px-4 py-3 text-right align-top">
                        {cambiado(p) ? (
                          <Button size="sm" disabled={ocupado === p.clave} onClick={() => guardar(p)}>
                            Guardar
                          </Button>
                        ) : (
                          <Badge>Sin cambios</Badge>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
