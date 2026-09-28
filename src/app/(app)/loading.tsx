import { PantallaCarga } from "@/components/pantalla-carga";

// Mientras el servidor arma la siguiente pantalla (lista, cotización, catálogo…).
export default function Cargando() {
  return <PantallaCarga mensaje="Cargando…" />;
}
