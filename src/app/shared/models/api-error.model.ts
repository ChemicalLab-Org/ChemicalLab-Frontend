/** Estructura estándar de error devuelta por el backend en respuestas 4xx/5xx. */
export interface ApiError {
  readonly timestamp: string;
  readonly status: number;
  readonly error: string;
  readonly message: string;
  readonly path: string;
  /** Mapa de campo → mensaje de validación, presente en errores 400. */
  readonly details?: Record<string, string>;
}
