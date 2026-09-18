export type EstadoHttp = 400 | 401 | 403 | 404 | 409 | 413 | 415;

export class ErrorHttp extends Error {
  constructor(
    public readonly status: EstadoHttp,
    message: string,
    public readonly codigo?: string,
  ) {
    super(message);
    this.name = "ErrorHttp";
  }
}

export const noAutenticado = () => new ErrorHttp(401, "Inicia sesión para continuar.", "NO_AUTENTICADO");
export const prohibido = (mensaje = "No tienes permiso para esta acción.") => new ErrorHttp(403, mensaje, "PROHIBIDO");
