import type { MetadataRoute } from "next";

/**
 * Hace la app instalable (computadora, Android e iPhone): se abre en su propia ventana, sin barra del
 * navegador, con el ícono del cotizador. No guarda nada sin conexión: cotizar necesita el servidor.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Cotizador Diseñarte México",
    short_name: "Cotizador",
    description: "Cotizaciones de publicidad física y digitalización de Diseñarte México",
    id: "/",
    start_url: "/inicio",
    scope: "/",
    display: "standalone",
    orientation: "any",
    lang: "es-MX",
    background_color: "#ffffff",
    theme_color: "#7c07a6",
    icons: [
      { src: "/icono-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icono-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icono-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
