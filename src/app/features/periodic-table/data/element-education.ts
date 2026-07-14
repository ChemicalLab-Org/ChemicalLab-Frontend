/**
 * Modelo y helpers de datos educativos de la tabla periódica (sesión 18.4).
 *
 * Este archivo contiene SOLO tipos y funciones ligeras (derivaciones y lectura
 * del catálogo de valencias). El dataset con el contenido de los 118 elementos
 * vive en `element-education-data.ts` y se carga por importación dinámica desde
 * el componente, para no aumentar el bundle inicial.
 *
 * Reglas seguidas:
 * - Las valencias comunes mostradas al estudiante se DERIVAN del catálogo del
 *   módulo de compuestos (`COMMON_VALENCES_BY_SYMBOL`) para no contradecirlo
 *   (ver `schoolValencesLabel`).
 * - Campos derivables de la posición (grupo, período, bloque, metal/no metal)
 *   se calculan con helpers y no se almacenan por elemento.
 */

import { COMMON_VALENCES_BY_SYMBOL } from '../../compounds/data/common-valences';
import { PeriodicElement, groupOf, periodOf } from './elements-data';

/** Estado físico aproximado a temperatura ambiente. */
export type MatterState = 'Sólido' | 'Líquido' | 'Gas' | 'Sintético';

/** Clasificación general para el estudiante. */
export type MetalClass = 'Metal' | 'No metal' | 'Metaloide';

/** Estado de validación química del dato educativo. */
export type ValidationStatus = 'validated' | 'pending' | 'needs-review';

/**
 * Información educativa opcional de un elemento. Todos los campos de texto son
 * opcionales salvo `validationStatus`; la UI oculta las secciones vacías y
 * muestra "No disponible" solo en los datos clave importantes.
 */
export interface ElementEducation {
  /** Masa atómica con unidad (p. ej. "1.008 u"). Entre corchetes si es del isótopo más estable. */
  readonly atomicMass?: string;
  /** Estado físico aproximado a temperatura ambiente. */
  readonly state?: MatterState;
  /** Familia específica cuando conviene precisar más que la categoría de color. */
  readonly family?: string;
  /** Electronegatividad (escala de Pauling) como texto, cuando es un valor escolar estándar. */
  readonly electronegativity?: string;
  /** Estados de oxidación frecuentes cuando aportan más que las valencias comunes. */
  readonly commonOxidationStates?: string;
  /** Descripción breve de una línea. */
  readonly shortDescription?: string;
  /** Explicación educativa un poco más amplia (2-3 frases cortas). */
  readonly educationalDescription?: string;
  /** Usos cotidianos, como lista corta de etiquetas. */
  readonly everydayUses?: readonly string[];
  /** Usos en química o en la industria, como lista corta. */
  readonly chemistryUses?: readonly string[];
  /** Compuestos comunes de nivel escolar, como lista corta. */
  readonly commonCompounds?: readonly string[];
  /** Consejo para recordar o entender el elemento. */
  readonly learningTip?: string;
  /** Precaución básica; se muestra solo si el elemento la requiere. */
  readonly safetyNote?: string;
  /** Nota específica para el nivel de secundaria. */
  readonly secondaryLevelNote?: string;
  /** Estado de validación química del dato (interno). */
  readonly validationStatus: ValidationStatus;
}

/**
 * Bloque de la tabla (s, p, d, f) derivado de la categoría y la posición.
 * No es un dato almacenado: se calcula para evitar contradicciones.
 */
export function blockOf(element: PeriodicElement): 's' | 'p' | 'd' | 'f' {
  if (element.category === 'lanthanide' || element.category === 'actinide') {
    return 'f';
  }
  if (element.symbol === 'He') {
    return 's';
  }
  const group = groupOf(element);
  if (group === null) {
    return 'd';
  }
  if (group <= 2) {
    return 's';
  }
  if (group >= 13) {
    return 'p';
  }
  return 'd';
}

/**
 * Clasificación general (metal / no metal / metaloide) derivada de la categoría.
 * El hidrógeno se trata como no metal para el nivel escolar.
 */
export function metalClassOf(element: PeriodicElement): MetalClass {
  switch (element.category) {
    case 'metalloid':
      return 'Metaloide';
    case 'nonmetal':
    case 'halogen':
    case 'noble':
      return 'No metal';
    default:
      return 'Metal';
  }
}

/**
 * Familia del elemento. Usa la familia explícita del dato educativo si se pasa;
 * si no, la deriva de la categoría y el grupo. Nunca devuelve valores vacíos.
 */
export function familyOf(element: PeriodicElement, education?: ElementEducation): string {
  if (education?.family) {
    return education.family;
  }
  switch (element.category) {
    case 'noble':
      return 'Gas noble';
    case 'halogen':
      return 'Halógeno';
    case 'lanthanide':
      return 'Lantánido';
    case 'actinide':
      return 'Actínido';
    case 'transition':
      return 'Metal de transición';
    case 'metalloid':
      return 'Metaloide';
    case 'nonmetal':
      return 'No metal';
    case 'metal': {
      const group = groupOf(element);
      if (group === 1) {
        return 'Metal alcalino';
      }
      if (group === 2) {
        return 'Metal alcalinotérreo';
      }
      return 'Metal representativo';
    }
    default:
      return 'Elemento';
  }
}

/** Nombre legible del bloque para mostrar como chip. */
export function blockLabel(element: PeriodicElement): string {
  return `Bloque ${blockOf(element)}`;
}

/**
 * Etiqueta de valencias comunes tomada del catálogo del motor de compuestos
 * (`COMMON_VALENCES_BY_SYMBOL`). Es la fuente principal para no contradecir a
 * Formación de compuestos. Devuelve null si el símbolo no está en el catálogo.
 */
export function schoolValencesLabel(symbol: string): string | null {
  const list = COMMON_VALENCES_BY_SYMBOL[symbol];
  if (!list || list.length === 0) {
    return null;
  }
  return list.map((option) => option.label).join(', ');
}

/** Mapa de contenido educativo por número atómico (cargado de forma diferida). */
export type ElementEducationMap = Readonly<Record<number, ElementEducation>>;
