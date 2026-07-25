/**
 * Reglas compartidas por los formularios institucionales.
 *
 * Las expresiones regulares validan el valor final. Los sanitizadores se usan mientras
 * se escribe para impedir que queden caracteres no permitidos en el control.
 */
export const PERSON_NAME_PATTERN =
  /^\s*[\p{L}\p{M}]+(?:(?:\s+|['\u2019-])[\p{L}\p{M}]+)*\s*$/u;

export const INSTITUTIONAL_IDENTIFIER_PATTERN = /^[A-Za-z0-9]+$/;

export const WHITEBOARD_TITLE_PATTERN =
  /^\s*[\p{L}\p{M}\p{N}]+(?:\s+[\p{L}\p{M}\p{N}]+)*\s*$/u;

export function sanitizePersonNameInput(value: string): string {
  return value.replace(/[^\p{L}\p{M} '\u2019-]/gu, '');
}

export function sanitizeInstitutionalIdentifierInput(value: string): string {
  return value.replace(/[^A-Za-z0-9]/g, '');
}

export function sanitizeWhiteboardTitleInput(value: string): string {
  return value.replace(/[^\p{L}\p{M}\p{N} ]/gu, '');
}

export function normalizePersonName(value: string): string {
  return value.trim().replace(/\s+/g, ' ').normalize('NFC');
}

export function normalizeInstitutionalIdentifier(value: string): string {
  return value.trim();
}

export function normalizeStudentCode(value: string): string {
  return normalizeInstitutionalIdentifier(value).toUpperCase();
}

export function normalizeWhiteboardTitle(value: string): string {
  return value.trim().replace(/\s+/g, ' ').normalize('NFC');
}
