import { hash, verify } from "@node-rs/argon2";

// @node-rs/argon2 usa argon2id por defecto. Parámetros recomendados por OWASP
// (19 MiB, 2 pasadas, 1 hilo), escritos explícitamente para que no cambien con la librería.
const OPCIONES = { memoryCost: 19456, timeCost: 2, parallelism: 1, outputLen: 32 };

export function hashPassword(password: string): Promise<string> {
  return hash(password, OPCIONES);
}

export async function verifyPassword(hashGuardado: string, password: string): Promise<boolean> {
  try {
    return await verify(hashGuardado, password);
  } catch {
    return false;
  }
}
