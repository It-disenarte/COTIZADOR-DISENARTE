/**
 * Reduce una foto en el navegador antes de subirla: una foto de celular pesa
 * 3-8 MB y en el PDF se ve igual con 1600 px de lado (~200-400 KB en JPG).
 * Siempre entrega JPG, que es lo que mejor se incrusta en el PDF.
 */
export async function reducirImagen(archivo: File, ladoMaximo = 1600, calidad = 0.85): Promise<Blob> {
  const mapa = await createImageBitmap(archivo);
  try {
    const escala = Math.min(1, ladoMaximo / Math.max(mapa.width, mapa.height));
    const ancho = Math.round(mapa.width * escala);
    const alto = Math.round(mapa.height * escala);

    const lienzo = document.createElement("canvas");
    lienzo.width = ancho;
    lienzo.height = alto;
    const ctx = lienzo.getContext("2d");
    if (!ctx) throw new Error("El navegador no pudo procesar la imagen.");

    // Fondo blanco: un PNG con transparencia saldría negro al pasarlo a JPG.
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, ancho, alto);
    ctx.drawImage(mapa, 0, 0, ancho, alto);

    return await new Promise<Blob>((resolver, rechazar) =>
      lienzo.toBlob((blob) => (blob ? resolver(blob) : rechazar(new Error("No se pudo convertir la imagen."))), "image/jpeg", calidad),
    );
  } finally {
    mapa.close();
  }
}

/** Sube la foto de una opción y devuelve su id. */
export async function subirImagenCotizacion(cotizacionId: string, archivo: File): Promise<string> {
  const reducida = await reducirImagen(archivo);
  const nombre = `${archivo.name.replace(/\.[^.]+$/, "") || "foto"}.jpg`;
  const formulario = new FormData();
  formulario.append("archivo", new File([reducida], nombre, { type: "image/jpeg" }));

  const respuesta = await fetch(`/api/cotizaciones/${cotizacionId}/imagenes`, {
    method: "POST",
    headers: { "x-cotizador": "1" },
    body: formulario,
  });
  const datos = await respuesta.json().catch(() => ({}));
  if (!respuesta.ok) throw new Error(datos.error ?? "No se pudo subir la imagen.");
  return datos.id as string;
}
