"use client";

import { Loader2, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useAvisos } from "@/components/avisos";
import { PantallaCarga } from "@/components/pantalla-carga";
import { Button, Card, CardContent, Checkbox, Input } from "@/components/ui";
import { llamarApi } from "@/lib/utils";

type Sugerencia = { insumoId: string; nombre: string; categoria: string; nombreCliente: string };
type Renglon = Sugerencia & { elegido: boolean };

/**
 * La IA propone cómo se le nombra al cliente cada insumo que todavía no lo tiene (lo que sale en
 * las viñetas del PDF). Nada se guarda sin revisión: se corrige lo que haga falta y se guarda.
 */
export function SugerirNombresCliente({ sinNombre }: { sinNombre: number }) {
  const router = useRouter();
  const avisar = useAvisos();
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [renglones, setRenglones] = useState<Renglon[] | null>(null);
  const [pendientes, setPendientes] = useState(0);

  async function sugerir() {
    setOcupado("La IA está proponiendo los nombres…");
    try {
      const datos = await llamarApi<{ sugerencias: Sugerencia[]; pendientes: number }>("/api/ia/nombres-cliente", "POST", {});
      if (datos.sugerencias.length === 0) {
        avisar({ tipo: "ok", texto: "Todos los insumos ya tienen nombre para el cliente." });
        return;
      }
      setRenglones(datos.sugerencias.map((s) => ({ ...s, elegido: true })));
      setPendientes(datos.pendientes);
    } catch (e) {
      avisar({ tipo: "error", texto: e instanceof Error ? e.message : "No se pudieron proponer los nombres." });
    } finally {
      setOcupado(null);
    }
  }

  async function guardar() {
    if (!renglones) return;
    const cambios = renglones
      .filter((r) => r.elegido && r.nombreCliente.trim())
      .map((r) => ({ id: r.insumoId, nombreCliente: r.nombreCliente.trim() }));
    if (cambios.length === 0) {
      avisar({ tipo: "advertencia", texto: "Marca al menos un nombre para guardar." });
      return;
    }
    setOcupado("Guardando los nombres…");
    try {
      const { guardados } = await llamarApi<{ guardados: number }>("/api/insumos/nombres-cliente", "PUT", { cambios });
      avisar({ tipo: "ok", texto: `Se guardaron ${guardados} nombre${guardados === 1 ? "" : "s"} para el cliente.` });
      setRenglones(null);
      router.refresh();
    } catch (e) {
      avisar({ tipo: "error", texto: e instanceof Error ? e.message : "No se pudieron guardar." });
    } finally {
      setOcupado(null);
    }
  }

  const editar = (id: string, cambios: Partial<Renglon>) =>
    setRenglones((lista) => lista?.map((r) => (r.insumoId === id ? { ...r, ...cambios } : r)) ?? null);

  return (
    <Card>
      <CardContent className="space-y-3 pt-6">
        {ocupado && <PantallaCarga mensaje={ocupado} />}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="max-w-2xl">
            <h3 className="font-medium">Nombres para el cliente</h3>
            <p className="text-sm text-muted-foreground">
              Es como sale cada insumo en la descripción de los conceptos del PDF: “Corte de vinil de color” en lugar
              de “Vinil de corte 1.22”. La IA los propone y tú los revisas antes de guardar.
              {sinNombre > 0 ? ` Faltan ${sinNombre}.` : " Todos los insumos ya tienen uno."}
            </p>
          </div>
          {!renglones && (
            <Button type="button" variant="outline" onClick={sugerir} disabled={ocupado !== null || sinNombre === 0}>
              {ocupado ? <Loader2 className="animate-spin" /> : <Sparkles />} Sugerir con IA
            </Button>
          )}
        </div>

        {renglones && (
          <div className="space-y-3">
            <div className="overflow-x-auto rounded-md border">
              <table className="w-full text-sm">
                <thead className="bg-muted/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="w-10 px-3 py-2" />
                    <th className="px-3 py-2 font-medium">Nombre en el catálogo</th>
                    <th className="px-3 py-2 font-medium">Nombre para el cliente (propuesto)</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {renglones.map((r) => (
                    <tr key={r.insumoId}>
                      <td className="px-3 py-2">
                        <Checkbox
                          checked={r.elegido}
                          onChange={(e) => editar(r.insumoId, { elegido: e.target.checked })}
                          aria-label={`Guardar el nombre de ${r.nombre}`}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <p>{r.nombre}</p>
                        <p className="text-xs text-muted-foreground">{r.categoria}</p>
                      </td>
                      <td className="px-3 py-2">
                        <Input
                          value={r.nombreCliente}
                          onChange={(e) => editar(r.insumoId, { nombreCliente: e.target.value, elegido: true })}
                          aria-label={`Nombre para el cliente de ${r.nombre}`}
                          className="h-9"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-muted-foreground">
              Corrige lo que no te guste y desmarca los que no quieras guardar.
              {pendientes > 0 && ` Quedan ${pendientes} más: al guardar estos, vuelve a presionar “Sugerir con IA”.`}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button type="button" onClick={guardar} disabled={ocupado !== null}>
                Guardar los marcados
              </Button>
              <Button type="button" variant="ghost" onClick={() => setRenglones(null)} disabled={ocupado !== null}>
                Descartar
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
