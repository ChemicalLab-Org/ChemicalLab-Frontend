import { AbstractControl, ValidationErrors } from '@angular/forms';

export const PASSWORD_GUIDANCE = 'Usa entre 15 y 128 caracteres Unicode (máximo 512 bytes UTF-8). Se permiten espacios; evita contraseñas comunes o repetidas.';

/** Count Unicode code points, not UTF-16 units. The server also checks its local blocklist. */
export function passwordPolicyValidator(control: AbstractControl): ValidationErrors | null {
  const value: string = control.value ?? '';
  const points = Array.from(value);
  const malformed = points.some(point => point.length === 1 && /[\uD800-\uDFFF]/.test(point));
  return points.length >= 15 && points.length <= 128 && new TextEncoder().encode(value).length <= 512
    && !malformed && value.trim().length > 0 ? null : { passwordPolicy: true };
}
