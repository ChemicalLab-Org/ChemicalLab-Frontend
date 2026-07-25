import { describe, expect, it } from 'vitest';
import {
  INSTITUTIONAL_IDENTIFIER_PATTERN,
  PERSON_NAME_PATTERN,
  WHITEBOARD_TITLE_PATTERN,
  normalizePersonName,
  normalizeStudentCode,
  normalizeWhiteboardTitle,
  sanitizeInstitutionalIdentifierInput,
  sanitizePersonNameInput,
  sanitizeWhiteboardTitleInput,
} from './institutional-input.util';

describe('institutional input rules', () => {
  it('accepts institutional identifiers made only of letters and numbers', () => {
    expect(INSTITUTIONAL_IDENTIFIER_PATTERN.test('docente01')).toBe(true);
    expect(INSTITUTIONAL_IDENTIFIER_PATTERN.test('EST0001')).toBe(true);
    expect(INSTITUTIONAL_IDENTIFIER_PATTERN.test('docente.01')).toBe(false);
    expect(INSTITUTIONAL_IDENTIFIER_PATTERN.test('docente_01')).toBe(false);
  });

  it('accepts real person names and rejects digits or symbols', () => {
    expect(PERSON_NAME_PATTERN.test('Ana Lucía')).toBe(true);
    expect(PERSON_NAME_PATTERN.test("María-José O'Connor")).toBe(true);
    expect(PERSON_NAME_PATTERN.test('Ana123')).toBe(false);
    expect(PERSON_NAME_PATTERN.test('José@')).toBe(false);
  });

  it('accepts whiteboard titles with letters, numbers and spaces only', () => {
    expect(WHITEBOARD_TITLE_PATTERN.test('Óxidos 3 B')).toBe(true);
    expect(WHITEBOARD_TITLE_PATTERN.test('Fe2O3')).toBe(true);
    expect(WHITEBOARD_TITLE_PATTERN.test('Clase @')).toBe(false);
    expect(WHITEBOARD_TITLE_PATTERN.test('Repaso - final')).toBe(false);
  });

  it('sanitizes and normalizes values consistently', () => {
    expect(sanitizeInstitutionalIdentifierInput('docente.01')).toBe('docente01');
    expect(sanitizePersonNameInput('Ana123 Lucía@')).toBe('Ana Lucía');
    expect(sanitizeWhiteboardTitleInput('Clase #1')).toBe('Clase 1');
    expect(normalizePersonName('  Ana   Lucía  ')).toBe('Ana Lucía');
    expect(normalizeStudentCode(' est0001 ')).toBe('EST0001');
    expect(normalizeWhiteboardTitle('  Óxidos   3 B  ')).toBe('Óxidos 3 B');
  });
});
