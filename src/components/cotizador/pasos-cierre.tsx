"use client";

import { Plus, Trash2, TriangleAlert } from "lucide-react";
import { Badge, Button, Card, CardContent, Checkbox, Input, Label, Select, Textarea } from "@/components/ui";
import { type BorradorCotizacion, txt } from "@/lib/cotizador/estado";
import { formatoFraccion, formatoMoneda } from "@/lib/formato";
import type { ResultadoCotizacion } from "@/lib/motor";

type Props = {
  borrador: BorradorCotizacion;
  cambiar: (cambios: (b: BorradorCotizacion) => BorradorCotizacion) => void;
};

// Paso 4 -------------------------------------------------------------------------------------

export function PasoOperacion({ borrador, cambiar }: Props) {
  const op = borrador.entrada.operacion;
  const editarOperacion = (cambios: Partial<typeof op>) =>
    cambiar((b) => ({ ...b, entrada: { ...b.entrada, operacion: { ...b.entrada.operacion, ...cambios } } }));
  const enCasa = op.trabajoEnInstalacionesDisenarte;

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="space-y-4 pt-6">
          <label className="flex items-center gap-2 text-sm font-medium">
            <Checkbox
              checked={enCasa}
              onChange={(e) => editarOperacion({ trabajoEnInstalacionesDisenarte: e.target.checked })}
            />
            El trabajo se hace en instalaciones de Diseñarte
          </label>
          <p className="text-sm text-muted-foreground">
            Si el cliente trae la unidad o recoge la pieza, no hay viáticos, gasolina, casetas ni hospedaje.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="grid gap-4 pt-6 sm:grid-cols-3">
          <Campo
            etiqueta="Días de diseño"
            ayuda="Se multiplica por la tarifa de diseño del día. Si llenas el monto manual, ese lo reemplaza."
            valor={txt(op.diasDiseno)}
            alCambiar={(v) => editarOperacion({ diasDiseno: v })}
          />
          <Campo
            etiqueta="Monto de diseño manual"
            ayuda="Si lo llenas, reemplaza días × tarifa. Úsalo cuando el diseño lleva mucho reacomodo y quieres un monto fijo."
            valor={txt(op.disenoMontoManual ?? "")}
            alCambiar={(v) => editarOperacion({ disenoMontoManual: v })}
          />
          <div />
          <Campo
            etiqueta="Personas en taller"
            ayuda="Mano de obra armando o preparando el material antes de salir. No es la cuadrilla que instala."
            valor={txt(op.produccion.personas)}
            alCambiar={(v) => editarOperacion({ produccion: { ...op.produccion, personas: v } })}
          />
          <Campo
            etiqueta="Días en taller"
            ayuda="Días que se lleva preparar el material, antes de la instalación."
            valor={txt(op.produccion.dias)}
            alCambiar={(v) => editarOperacion({ produccion: { ...op.produccion, dias: v } })}
          />
          <div />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-4 pt-6">
          <label className="flex items-center gap-2 text-sm font-medium">
            <Checkbox
              checked={op.instalacion.incluye}
              onChange={(e) => editarOperacion({ instalacion: { ...op.instalacion, incluye: e.target.checked } })}
            />
            Incluye instalación
          </label>
          <p className="text-sm text-muted-foreground">
            La cuadrilla que va al sitio del cliente a instalar, distinta de las “Personas en taller” que preparan
            el material antes de salir.
          </p>
          {op.instalacion.incluye && (
            <div className="grid gap-4 sm:grid-cols-3">
              <Campo
                etiqueta="Personas en el sitio"
                ayuda="Cuántos van a instalar en las instalaciones del cliente."
                valor={txt(op.instalacion.personas)}
                alCambiar={(v) => editarOperacion({ instalacion: { ...op.instalacion, personas: v } })}
              />
              <Campo
                etiqueta="Días de instalación"
                ayuda="Días que la cuadrilla pasa instalando en el sitio del cliente."
                valor={txt(op.instalacion.dias)}
                alCambiar={(v) => editarOperacion({ instalacion: { ...op.instalacion, dias: v } })}
              />
              <div>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={op.instalacion.escalaPorPieza === true}
                    onChange={(e) => editarOperacion({ instalacion: { ...op.instalacion, escalaPorPieza: e.target.checked } })}
                  />
                  Se repite en cada pieza (rotulación)
                </label>
                <p className="mt-1 text-xs text-muted-foreground">
                  Actívalo cuando cada unidad necesita su propia instalación (p. ej. rotular una flotilla): el costo
                  se multiplica por el número de piezas, en vez de cobrarse una sola vez para todo el proyecto.
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {!enCasa && (
        <Card>
          <CardContent className="grid gap-4 pt-6 sm:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="tipo-viaticos">Viáticos</Label>
              <Select
                id="tipo-viaticos"
                value={op.viaticos.tipo}
                onChange={(e) => editarOperacion({ viaticos: { ...op.viaticos, tipo: e.target.value as "local" | "foraneo" } })}
              >
                <option value="local">Zona Querétaro</option>
                <option value="foraneo">Foráneo</option>
              </Select>
              <p className="text-xs text-muted-foreground">
                Se llena solo según la zona del cliente (paso 1). Cámbialo aquí si este proyecto en particular es
                distinto.
              </p>
            </div>
            <Campo
              etiqueta="Personas"
              valor={txt(op.viaticos.personas)}
              alCambiar={(v) => editarOperacion({ viaticos: { ...op.viaticos, personas: v } })}
            />
            <Campo
              etiqueta="Días"
              ayuda="Normalmente coincide con los días de instalación, pero captúralo aparte si hay un día que es solo de traslado."
              valor={txt(op.viaticos.dias)}
              alCambiar={(v) => editarOperacion({ viaticos: { ...op.viaticos, dias: v } })}
            />
            <Campo
              etiqueta="Monto por día manual"
              ayuda="Si lo llenas, reemplaza el monto por día del parámetro ($250 local o $500 foráneo)."
              valor={txt(op.viaticos.montoDiaManual ?? "")}
              alCambiar={(v) => editarOperacion({ viaticos: { ...op.viaticos, montoDiaManual: v } })}
            />
            <Campo
              etiqueta="Km por trayecto"
              ayuda="Un solo sentido. Se llena solo con el km del cliente (paso 1); ajústalo aquí si este viaje es distinto."
              valor={txt(op.traslado.kmPorTrayecto)}
              alCambiar={(v) => editarOperacion({ traslado: { ...op.traslado, kmPorTrayecto: v } })}
            />
            <div className="space-y-2">
              <Label htmlFor="modo-traslado">Viajes</Label>
              <Select
                id="modo-traslado"
                value={op.traslado.modo}
                onChange={(e) => editarOperacion({ traslado: { ...op.traslado, modo: e.target.value as "diario" | "una_vez" } })}
              >
                <option value="diario">Van y vienen diario</option>
                <option value="una_vez">Se quedan (un viaje redondo)</option>
              </Select>
              <p className="text-xs text-muted-foreground">
                Diario: se cuenta un viaje redondo por cada día de instalación (más gasolina y casetas). Se quedan:
                un solo viaje redondo para todo el proyecto.
              </p>
            </div>
            <Campo
              etiqueta="Viajes redondos"
              ayuda="Vacío = tantos como días de instalación."
              valor={txt(op.traslado.viajesRedondos ?? "")}
              alCambiar={(v) => editarOperacion({ traslado: { ...op.traslado, viajesRedondos: v } })}
            />
            <Campo
              etiqueta="Casetas por viaje"
              ayuda="El costo en pesos de las casetas de un viaje redondo, no la cantidad de casetas."
              valor={txt(op.traslado.casetasPorViaje)}
              alCambiar={(v) => editarOperacion({ traslado: { ...op.traslado, casetasPorViaje: v } })}
            />
            <Campo
              etiqueta="Rendimiento km/L"
              ayuda="Vacío = el del parámetro."
              valor={txt(op.traslado.rendimientoKmL ?? "")}
              alCambiar={(v) => editarOperacion({ traslado: { ...op.traslado, rendimientoKmL: v } })}
            />
            <label className="flex items-center gap-2 pt-8 text-sm sm:col-span-1">
              <Checkbox
                checked={op.hospedaje.incluye}
                onChange={(e) => editarOperacion({ hospedaje: { ...op.hospedaje, incluye: e.target.checked } })}
              />
              Incluye hospedaje
            </label>
            {op.hospedaje.incluye && (
              <>
                <Campo
                  etiqueta="Noches"
                  valor={txt(op.hospedaje.noches)}
                  alCambiar={(v) => editarOperacion({ hospedaje: { ...op.hospedaje, noches: v } })}
                />
                <Campo
                  etiqueta="Costo por noche"
                  valor={txt(op.hospedaje.costoNoche)}
                  alCambiar={(v) => editarOperacion({ hospedaje: { ...op.hospedaje, costoNoche: v } })}
                />
              </>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="space-y-3 pt-6">
          <div className="flex items-center justify-between">
            <h3 className="font-medium">Extras</h3>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => editarOperacion({ extras: [...op.extras, { concepto: "", monto: "0", escala: "una_vez" }] })}
            >
              <Plus /> Agregar
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            “Una vez” se cobra una sola vez para todo el proyecto; “Por pieza” se multiplica por el total de piezas
            del levantamiento.
          </p>
          {op.extras.length === 0 && <p className="text-sm text-muted-foreground">Fletes, maniobras, andamio, lo que aplique.</p>}
          {op.extras.map((extra, i) => (
            <div key={i} className="grid gap-3 sm:grid-cols-[2fr_1fr_1fr_auto]">
              <Input
                value={extra.concepto}
                onChange={(e) => editarOperacion({ extras: op.extras.map((x, k) => (k === i ? { ...x, concepto: e.target.value } : x)) })}
                placeholder="Concepto"
                aria-label={`Concepto del extra ${i + 1}`}
              />
              <Input
                inputMode="decimal"
                value={txt(extra.monto)}
                onChange={(e) => editarOperacion({ extras: op.extras.map((x, k) => (k === i ? { ...x, monto: e.target.value } : x)) })}
                aria-label={`Monto del extra ${i + 1}`}
              />
              <Select
                value={extra.escala}
                onChange={(e) =>
                  editarOperacion({
                    extras: op.extras.map((x, k) => (k === i ? { ...x, escala: e.target.value as "una_vez" | "por_pieza" } : x)),
                  })
                }
                aria-label={`Escala del extra ${i + 1}`}
              >
                <option value="una_vez">Una vez</option>
                <option value="por_pieza">Por pieza</option>
              </Select>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                title="Quitar extra"
                onClick={() => editarOperacion({ extras: op.extras.filter((_, k) => k !== i) })}
              >
                <Trash2 />
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="grid gap-4 pt-6 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="presentacion">Cómo se presenta la operación</Label>
            <Select
              id="presentacion"
              value={borrador.entrada.presentacion.operacionProrrateada ? "prorrateada" : "aparte"}
              onChange={(e) =>
                cambiar((b) => ({
                  ...b,
                  entrada: {
                    ...b.entrada,
                    presentacion: { ...b.entrada.presentacion, operacionProrrateada: e.target.value === "prorrateada" },
                  },
                }))
              }
            >
              <option value="prorrateada">Dentro del precio por pieza</option>
              <option value="aparte">Como fila aparte</option>
            </Select>
            <p className="text-xs text-muted-foreground">
              Dentro del precio por pieza: diseño, envío e instalación se reparten en el unitario (compras lo ve
              como costo negociable). Fila aparte: el PDF muestra una línea extra con ese monto.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="modalidades">Modalidades</Label>
            <Select
              id="modalidades"
              value={borrador.entrada.presentacion.modalidades}
              onChange={(e) =>
                cambiar((b) => ({
                  ...b,
                  entrada: {
                    ...b.entrada,
                    presentacion: { ...b.entrada.presentacion, modalidades: e.target.value as "solo_una" | "A_y_B" },
                  },
                }))
              }
            >
              <option value="solo_una">Una sola</option>
              <option value="A_y_B">A) Suministro y B) Suministro e instalación</option>
            </Select>
            <p className="text-xs text-muted-foreground">
              A y B muestra dos precios en el PDF para que el cliente elija: solo comprar el material, o comprarlo
              con instalación incluida.
            </p>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={borrador.entrada.ajustes.aplicaMargenError}
              onChange={(e) =>
                cambiar((b) => ({ ...b, entrada: { ...b.entrada, ajustes: { ...b.entrada.ajustes, aplicaMargenError: e.target.checked } } }))
              }
            />
            Aplicar margen de error (10%)
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={borrador.entrada.ajustes.aplicaConsumibles}
              onChange={(e) =>
                cambiar((b) => ({ ...b, entrada: { ...b.entrada, ajustes: { ...b.entrada.ajustes, aplicaConsumibles: e.target.checked } } }))
              }
            />
            Aplicar consumibles (5% de materiales)
          </label>
          <Campo
            etiqueta="Margen"
            ayuda="Vacío = el del parámetro (0.30). Fracción: 0.35 = 35%."
            valor={txt(borrador.entrada.ajustes.margen ?? "")}
            alCambiar={(v) => cambiar((b) => ({ ...b, entrada: { ...b.entrada, ajustes: { ...b.entrada.ajustes, margen: v } } }))}
          />
        </CardContent>
      </Card>
    </div>
  );
}

// Paso 5 -------------------------------------------------------------------------------------

export function PasoReventa({ borrador, cambiar }: Props) {
  const items = borrador.entrada.reventa;
  const editar = (nuevos: typeof items) => cambiar((b) => ({ ...b, entrada: { ...b.entrada, reventa: nuevos } }));

  return (
    <div className="space-y-4">
      <div>
        <h3 className="font-medium">Items de reventa</h3>
        <p className="text-sm text-muted-foreground">
          Producto que no fabricamos: extintores, botiquines, detectores. En “Precio de referencia” pones lo que te
          cuesta comprarlo (no lo que le vas a cobrar al cliente); la app le suma el 35% de utilidad sola.
        </p>
      </div>

      {items.map((item, i) => (
        <Card key={i}>
          <CardContent className="grid gap-3 pt-6 sm:grid-cols-[2fr_1fr_1fr_auto]">
            <Input
              value={item.nombre}
              onChange={(e) => editar(items.map((x, k) => (k === i ? { ...x, nombre: e.target.value } : x)))}
              placeholder="Detector de humo autónomo 9V"
              aria-label={`Nombre del artículo ${i + 1}`}
            />
            <Input
              inputMode="decimal"
              value={txt(item.precioReferencia)}
              onChange={(e) => editar(items.map((x, k) => (k === i ? { ...x, precioReferencia: e.target.value } : x)))}
              placeholder="Precio de referencia"
              aria-label={`Precio de referencia del artículo ${i + 1}`}
            />
            <Input
              inputMode="numeric"
              value={txt(item.cantidad)}
              onChange={(e) => editar(items.map((x, k) => (k === i ? { ...x, cantidad: e.target.value } : x)))}
              placeholder="Cantidad"
              aria-label={`Cantidad del artículo ${i + 1}`}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              title="Quitar artículo"
              onClick={() => editar(items.filter((_, k) => k !== i))}
            >
              <Trash2 />
            </Button>
            <Input
              className="sm:col-span-3"
              value={item.link ?? ""}
              onChange={(e) => editar(items.map((x, k) => (k === i ? { ...x, link: e.target.value } : x)))}
              placeholder="Link de la fuente (Mercado Libre, proveedor…)"
              aria-label={`Link del artículo ${i + 1}`}
            />
            <div>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={item.verificado}
                  onChange={(e) => editar(items.map((x, k) => (k === i ? { ...x, verificado: e.target.checked } : x)))}
                />
                Precio verificado
              </label>
              <p className="mt-1 text-xs text-muted-foreground">
                Márcalo cuando confirmaste el precio hoy en la fuente. Si lo dejas sin marcar, sale una alerta antes
                de generar el PDF.
              </p>
            </div>
          </CardContent>
        </Card>
      ))}

      <Button
        type="button"
        variant="outline"
        onClick={() => editar([...items, { nombre: "", precioReferencia: "0", cantidad: "1", link: "", verificado: false }])}
      >
        <Plus /> Agregar item de reventa
      </Button>
    </div>
  );
}

// Paso 6 -------------------------------------------------------------------------------------

export function PasoResumen({
  borrador,
  cambiar,
  resultado,
}: Props & { resultado: ResultadoCotizacion | null }) {
  if (!resultado) {
    return <p className="text-sm text-muted-foreground">Completa los pasos anteriores para ver el resumen.</p>;
  }

  const descuento = borrador.entrada.ajustes.descuentoDecisionRapida;

  return (
    <div className="space-y-6">
      {resultado.alertas.length > 0 && (
        <Card className="border-accent">
          <CardContent className="space-y-2 pt-6">
            <h3 className="flex items-center gap-2 font-medium text-accent">
              <TriangleAlert className="size-4" /> Revisa antes de enviar
            </h3>
            <ul className="space-y-1 text-sm">
              {resultado.alertas.map((a, i) => (
                <li key={i}>· {a.mensaje}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {resultado.opciones.map((opcion) =>
        opcion.variantes.map((v) => (
          <Card key={`${opcion.recetaId}-${v.clave}`}>
            <CardContent className="space-y-4 pt-6">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div>
                  <h3 className="font-medium">{opcion.nombre}</h3>
                  {v.clave !== "unica" && <p className="text-sm text-muted-foreground">{v.etiqueta}</p>}
                </div>
                <div className="text-right">
                  <p className="text-lg font-semibold">{formatoMoneda(v.total)}</p>
                  <p className="text-xs text-muted-foreground">IVA incluido</p>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1 text-sm">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Costo</p>
                  <Renglon etiqueta="Materiales" valor={v.desglose.materiales} />
                  <Renglon etiqueta="Consumibles" valor={v.desglose.consumibles} />
                  <Renglon etiqueta="Producción" valor={v.desglose.produccion} />
                  <Renglon etiqueta="Instalación por pieza" valor={v.desglose.instalacionPorPieza} />
                  <Renglon etiqueta="Extras por pieza" valor={v.desglose.extrasPorPieza} />
                  <Renglon etiqueta="Diseño" valor={v.desglose.diseno} />
                  <Renglon etiqueta="Instalación" valor={v.desglose.instalacion} />
                  <Renglon etiqueta="Viáticos" valor={v.desglose.viaticos} />
                  <Renglon etiqueta="Gasolina" valor={v.desglose.gasolina} />
                  <Renglon etiqueta="Casetas" valor={v.desglose.casetas} />
                  <Renglon etiqueta="Hospedaje" valor={v.desglose.hospedaje} />
                  <Renglon etiqueta="Extras una vez" valor={v.desglose.extrasUnaVez} />
                  <Renglon etiqueta="Costo total" valor={v.desglose.costoTotal} destacado />
                </div>

                <div className="space-y-3">
                  <div className="space-y-1 text-sm">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Precio</p>
                    {v.filas.map((f, i) => (
                      <div key={i} className="flex justify-between gap-2">
                        <span className="text-muted-foreground">
                          {f.cantidad} × {formatoMoneda(f.unitario)}
                        </span>
                        <span>{formatoMoneda(f.subtotal)}</span>
                      </div>
                    ))}
                    <Renglon etiqueta="Subtotal" valor={v.subtotal} />
                    <Renglon etiqueta="IVA" valor={v.iva} />
                    <Renglon etiqueta="Total" valor={v.total} destacado />
                    <p className="pt-1 text-xs text-muted-foreground">Margen real: {formatoFraccion(v.margenReal)}</p>
                  </div>

                  <div className="rounded-md bg-muted/50 p-3 text-xs">
                    <p className="mb-1 font-medium">Escenarios de margen</p>
                    {v.escenarios.map((e) => (
                      <p key={e.margen} className="flex justify-between">
                        <span>{formatoFraccion(e.margen)}</span>
                        <span>
                          {formatoMoneda(e.unitario)} c/u · {formatoMoneda(e.subtotal)}
                        </span>
                      </p>
                    ))}
                  </div>

                  {v.alertas.map((a, i) => (
                    <Badge key={i} variant="accent" className="block w-fit">
                      {a.mensaje}
                    </Badge>
                  ))}
                </div>
              </div>

              <div className="grid gap-3 border-t pt-4 sm:grid-cols-2">
                <Campo
                  etiqueta="Precio unitario manual"
                  ayuda={`Calculado: ${formatoMoneda(v.unitarioCalculado)}`}
                  valor={txt(borrador.entrada.opciones.find((o) => o.recetaId === opcion.recetaId)?.precioUnitarioManual ?? "")}
                  alCambiar={(valor) =>
                    cambiar((b) => ({
                      ...b,
                      entrada: {
                        ...b.entrada,
                        opciones: b.entrada.opciones.map((o) =>
                          o.recetaId === opcion.recetaId ? { ...o, precioUnitarioManual: valor } : o,
                        ),
                      },
                    }))
                  }
                />
              </div>
            </CardContent>
          </Card>
        )),
      )}

      {resultado.reventa.items.length > 0 && (
        <Card>
          <CardContent className="space-y-2 pt-6">
            <h3 className="font-medium">Materiales adicionales</h3>
            {resultado.reventa.items.map((item, i) => (
              <div key={i} className="flex justify-between text-sm">
                <span>
                  {item.cantidad} × {item.nombre}
                </span>
                <span>{formatoMoneda(item.subtotal)}</span>
              </div>
            ))}
            <Renglon etiqueta="Subtotal" valor={resultado.reventa.subtotal} />
            <Renglon etiqueta="Total con IVA" valor={resultado.reventa.total} destacado />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="grid gap-4 pt-6 sm:grid-cols-2">
          <Campo
            etiqueta="Descuento por decisión rápida"
            ayuda="Se resta del subtotal antes del IVA. Bórralo (déjalo vacío) para quitarlo."
            valor={txt(descuento?.monto)}
            alCambiar={(valor) =>
              cambiar((b) => ({
                ...b,
                entrada: {
                  ...b.entrada,
                  ajustes: {
                    ...b.entrada.ajustes,
                    descuentoDecisionRapida: valor.trim() === "" ? null : { monto: valor, nota: descuento?.nota ?? "" },
                  },
                },
              }))
            }
          />
          <div className="space-y-2">
            <Label htmlFor="nota-descuento">Nota del descuento</Label>
            <Textarea
              id="nota-descuento"
              value={descuento?.nota ?? ""}
              onChange={(e) =>
                cambiar((b) => ({
                  ...b,
                  entrada: {
                    ...b.entrada,
                    ajustes: {
                      ...b.entrada.ajustes,
                      descuentoDecisionRapida: descuento ? { ...descuento, nota: e.target.value } : null,
                    },
                  },
                }))
              }
              placeholder="Precio de volumen si decide en 12 horas"
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// Piezas compartidas --------------------------------------------------------------------------

function Campo({
  etiqueta,
  valor,
  alCambiar,
  ayuda,
}: {
  etiqueta: string;
  valor: string;
  alCambiar: (valor: string) => void;
  ayuda?: string;
}) {
  const id = etiqueta.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{etiqueta}</Label>
      <Input id={id} inputMode="decimal" value={valor} onChange={(e) => alCambiar(e.target.value)} />
      {ayuda && <p className="text-xs text-muted-foreground">{ayuda}</p>}
    </div>
  );
}

function Renglon({ etiqueta, valor, destacado = false }: { etiqueta: string; valor: string; destacado?: boolean }) {
  return (
    <div className={`flex justify-between gap-2 ${destacado ? "border-t pt-1 font-medium" : ""}`}>
      <span className={destacado ? "" : "text-muted-foreground"}>{etiqueta}</span>
      <span>{formatoMoneda(valor)}</span>
    </div>
  );
}
