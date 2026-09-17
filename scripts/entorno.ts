/**
 * En Vercel, migraciones y seed solo corren en el despliegue de producción.
 * Los previews de otras ramas usan la misma base y no deben modificarla.
 */
export function omitirFueraDeProduccion(etiqueta: string): boolean {
  const entorno = process.env.VERCEL_ENV;
  if (entorno && entorno !== "production") {
    console.log(`[${etiqueta}] omitido en despliegue "${entorno}" de Vercel`);
    return true;
  }
  return false;
}
