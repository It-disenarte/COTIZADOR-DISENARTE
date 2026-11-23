"use client";

import { MapPinned } from "lucide-react";
import { Button } from "@/components/ui";
import { enlaceGoogleMaps } from "@/lib/mapas/google";

/**
 * Abre Google Maps con Diseñarte como punto de partida para que la persona vea los km reales y los
 * escriba a mano en el campo de abajo. En escritorio sale en una ventana emergente; si el navegador
 * la bloquea, se abre en una pestaña normal.
 */
export function AbrirGoogleMaps({ direccion }: { direccion: string }) {
  function abrir() {
    const url = enlaceGoogleMaps(direccion);
    const ventana = window.open(url, "_blank", "popup=yes,width=1100,height=800,noopener,noreferrer");
    if (!ventana) window.open(url, "_blank", "noopener,noreferrer");
  }

  return (
    <Button type="button" variant="outline" size="sm" onClick={abrir}>
      <MapPinned /> Abrir Google Maps desde Diseñarte
    </Button>
  );
}
