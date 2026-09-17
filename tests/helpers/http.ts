import { auth } from "@/lib/auth";

/** Inicia sesión con Better Auth y devuelve el header `cookie` listo para reenviar. */
export async function iniciarSesion(email: string, password: string): Promise<string> {
  const res = await auth.api.signInEmail({ body: { email, password }, asResponse: true });
  if (!res.ok) throw new Error(`inicio de sesión falló (${res.status}): ${await res.text()}`);
  return cookiesDe(res);
}

export async function intentarIniciarSesion(email: string, password: string): Promise<Response> {
  return auth.api.signInEmail({ body: { email, password }, asResponse: true });
}

function cookiesDe(res: Response): string {
  return res.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
}

export function peticion(
  url: string,
  { metodo = "GET", cookie, cuerpo }: { metodo?: string; cookie?: string; cuerpo?: unknown } = {},
): Request {
  const headers = new Headers();
  if (cookie) headers.set("cookie", cookie);
  if (cuerpo !== undefined) headers.set("content-type", "application/json");
  return new Request(`http://localhost:3000${url}`, {
    method: metodo,
    headers,
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
  });
}

export const ctxId = (id: string) => ({ params: Promise.resolve({ id }) });
