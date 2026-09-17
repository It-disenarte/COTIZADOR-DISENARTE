import type { Metadata } from "next";
import { Poppins } from "next/font/google";
import "./globals.css";

// next/font descarga Poppins al compilar y la sirve desde la app (sin llamadas a Google en runtime).
const poppins = Poppins({
  variable: "--font-poppins",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Cotizador Diseñarte México",
  description: "Cotizaciones de publicidad y comunicación visual",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es-MX" className={`${poppins.variable} h-full antialiased`}>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
