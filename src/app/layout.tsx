import type { Metadata, Viewport } from "next";
import { Poppins } from "next/font/google";
import textura from "@/assets/marca/textura.jpg";
import "./globals.css";

// next/font descarga Poppins al compilar y la sirve desde la app (sin llamadas a Google en runtime).
// Es la tipografía de las propuestas y del texto del manual.
const poppins = Poppins({
  variable: "--font-poppins",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Cotizador Diseñarte México",
  description: "Cotizaciones de publicidad y comunicación visual",
};

export const viewport: Viewport = {
  themeColor: "#7c07a6",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es-MX" className={`${poppins.variable} h-full antialiased`}>
      <body
        className="fondo-textura min-h-full"
        style={{ "--textura": `url(${textura.src})` } as React.CSSProperties}
      >
        {children}
      </body>
    </html>
  );
}
