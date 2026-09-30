"use client";

import { useState } from "react";
import { Button, Card, CardContent, Input, Label, Select } from "@/components/ui";
import { ETIQUETA_ZONA, type Zona, ZONAS } from "@/lib/catalogo/constantes";
import type { BorradorCotizacion } from "@/lib/cotizador/estado";
import type { Lugar } from "@/lib/mapas/osm";
import { CalcularKm } from "./calcular-km";
import { CampoDireccion } from "./campo-direccion";

export type ClienteOpcion = {
  id: string;
  nombreContacto: string;
  puesto: string | null;
  empresa: string | null;
  correo: string | null;
  telefono: string | null;
  direccion: string | null;
  kmDesdeSjr: string | null;
  zona: "local" | "foraneo";
  notas: string | null;
};

/** Lo que el paso Datos edita: igual en publicidad física y en digitalización. */
export type BorradorDatos = Pick<BorradorCotizacion, "titulo" | "solicitante" | "vendedorId" | "cliente">;

type Props<B extends BorradorDatos> = {
  borrador: B;
  cambiar: (cambios: (b: B) => B) => void;
};

// Paso 1 -------------------------------------------------------------------------------------

export function PasoDatos<B extends BorradorDatos>({
  borrador,
  cambiar,
  clientes,
  vendedores,
  puedeElegirVendedor,
  alSincronizarCliente,
  conTraslado = true,
}: Props<B> & {
  clientes: ClienteOpcion[];
  vendedores: { id: string; nombre: string }[];
  puedeElegirVendedor: boolean;
  /** Publicidad física: los km y la zona del cliente pasan a Operación (traslado y viáticos). */
  alSincronizarCliente?: (b: B, datos: { km?: string; zona?: Zona }) => B;
  /** Digitalización no tiene traslado: sin km ni zona. */
  conTraslado?: boolean;
}) {
  const sincronizar = alSincronizarCliente ?? ((b: B) => b);
  const cliente = borrador.cliente;
  // Punto exacto elegido en las sugerencias de dirección (si lo hay).
  const [lugarElegido, setLugarElegido] = useState<Lugar | null>(null);
  const sugerencias = clientes
    .filter((c) => {
      const q = `${cliente.empresa} ${cliente.nombreContacto}`.trim().toLowerCase();
      return q.length >= 2 && `${c.empresa ?? ""} ${c.nombreContacto}`.toLowerCase().includes(q) && c.id !== cliente.id;
    })
    .slice(0, 5);

  const editarCliente = (cambios: Partial<BorradorDatos["cliente"]>) =>
    cambiar((b) => ({ ...b, cliente: { ...b.cliente, ...cambios } }));

  /** Los km se guardan con el cliente y pasan al "Km por trayecto" de Operación. */
  const ponerKm = (valor: string) => cambiar((b) => sincronizar({ ...b, cliente: { ...b.cliente, kmDesdeSjr: valor } }, { km: valor }));

  const usarCliente = (c: ClienteOpcion) =>
    cambiar((b) =>
      sincronizar(
        {
          ...b,
          cliente: {
            id: c.id,
            nombreContacto: c.nombreContacto,
            puesto: c.puesto ?? "",
            empresa: c.empresa ?? "",
            correo: c.correo ?? "",
            telefono: c.telefono ?? "",
            direccion: c.direccion ?? "",
            kmDesdeSjr: c.kmDesdeSjr ?? "",
            zona: c.zona,
            notas: c.notas ?? "",
          },
        },
        // El km se guarda por cliente para no volver a capturarlo; pasa directo al traslado de Operación.
        { km: c.kmDesdeSjr ?? undefined, zona: c.zona },
      ),
    );

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="grid gap-4 pt-6 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="titulo">Título del proyecto</Label>
            <Input
              id="titulo"
              value={borrador.titulo}
              onChange={(e) => cambiar((b) => ({ ...b, titulo: e.target.value }))}
              placeholder="Señalética protección civil"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="solicitante">Solicitante</Label>
            <Input
              id="solicitante"
              value={borrador.solicitante}
              onChange={(e) => cambiar((b) => ({ ...b, solicitante: e.target.value }))}
              placeholder="Quién pide la cotización"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="asesor">Asesor comercial</Label>
            <Select
              id="asesor"
              value={borrador.vendedorId}
              disabled={!puedeElegirVendedor}
              onChange={(e) => cambiar((b) => ({ ...b, vendedorId: e.target.value }))}
            >
              {vendedores.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.nombre}
                </option>
              ))}
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-4 pt-6">
          <div>
            <h3 className="font-medium">Cliente</h3>
            <p className="text-sm text-muted-foreground">
              Se guarda solo. La próxima vez que cotices para él, escribe su nombre y aparece con sus kilómetros.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="empresa">Empresa</Label>
              <Input id="empresa" value={cliente.empresa} onChange={(e) => editarCliente({ empresa: e.target.value, id: null })} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="contacto">Contacto</Label>
              <Input
                id="contacto"
                value={cliente.nombreContacto}
                onChange={(e) => editarCliente({ nombreContacto: e.target.value, id: null })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="puesto">Puesto del contacto</Label>
              <Input
                id="puesto"
                value={cliente.puesto}
                onChange={(e) => editarCliente({ puesto: e.target.value })}
                placeholder="Jefa de Compras"
              />
              <p className="text-xs text-muted-foreground">
                El PNO pide dirigirse al contacto por su nombre y su puesto. Sale en la portada del PDF.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="correo">Correo</Label>
              <Input id="correo" value={cliente.correo} onChange={(e) => editarCliente({ correo: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="telefono">Teléfono</Label>
              <Input
                id="telefono"
                inputMode="tel"
                value={cliente.telefono}
                onChange={(e) => editarCliente({ telefono: e.target.value })}
                placeholder="427 100 41 83"
              />
            </div>
            <div className="sm:col-span-2">
              <CampoDireccion
                valor={cliente.direccion}
                alCambiar={(direccion) => editarCliente({ direccion })}
                alElegirLugar={setLugarElegido}
              />
            </div>
            {conTraslado && (
            <div className="space-y-2">
              <Label htmlFor="km">Km desde San Juan del Río</Label>
              <Input
                id="km"
                inputMode="decimal"
                value={cliente.kmDesdeSjr}
                onChange={(e) => ponerKm(e.target.value)}
                placeholder="58.6"
              />
              <p className="text-xs text-muted-foreground">
                Un solo trayecto (no ida y vuelta). Se guarda con el cliente y pasa solo al campo “Km por trayecto”
                del paso de Operación, donde se usa para calcular la gasolina.
              </p>
              <CalcularKm direccion={cliente.direccion} lugar={lugarElegido} alUsar={ponerKm} />
            </div>
            )}
            {conTraslado && (
            <div className="space-y-2">
              <Label htmlFor="zona">Zona</Label>
              <Select
                id="zona"
                value={cliente.zona}
                onChange={(e) => {
                  const zona = e.target.value as "local" | "foraneo";
                  cambiar((b) => sincronizar({ ...b, cliente: { ...b.cliente, zona } }, { zona }));
                }}
              >
                {ZONAS.map((z) => (
                  <option key={z} value={z}>
                    {ETIQUETA_ZONA[z]}
                  </option>
                ))}
              </Select>
              <p className="text-xs text-muted-foreground">
                Fija el tipo de viáticos ($250 local o $500 foráneo) en Operación. Puedes cambiarlo ahí si este
                proyecto es distinto.
              </p>
            </div>
            )}
          </div>

          {sugerencias.length > 0 && (
            <div className="space-y-2 rounded-md border bg-muted/40 p-3">
              <p className="text-xs text-muted-foreground">¿Es alguno de estos? Se llenan sus datos.</p>
              <div className="flex flex-wrap gap-2">
                {sugerencias.map((c) => (
                  <Button key={c.id} type="button" size="sm" variant="outline" onClick={() => usarCliente(c)}>
                    {c.empresa ?? c.nombreContacto}
                    {c.empresa && <span className="text-muted-foreground"> · {c.nombreContacto}</span>}
                  </Button>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
