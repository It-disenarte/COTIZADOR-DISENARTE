import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Llama a la API propia y devuelve el JSON, o lanza con el mensaje de error del servidor. */
export async function llamarApi<T = unknown>(url: string, metodo: string, cuerpo?: unknown): Promise<T> {
  const res = await fetch(url, {
    method: metodo,
    headers: cuerpo === undefined ? undefined : { "content-type": "application/json" },
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
  });
  const datos = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detalles = datos?.detalles as Record<string, string[]> | undefined;
    const primero = detalles ? Object.values(detalles).flat()[0] : undefined;
    throw new Error(primero ?? datos?.error ?? `Error ${res.status}`);
  }
  return datos as T;
}
