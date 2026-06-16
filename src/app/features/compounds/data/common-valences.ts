import { valencesForElement as datasetValencesForElement } from '../../periodic-table/data/elements-data';

/**
 * Valencia disponible de un elemento, lista para mostrarse como pill y para
 * enviarse al motor químico.
 */
export interface ValenceOption {
  /** Etiqueta que ve el usuario, con signo (p. ej. "+2", "-1"). */
  readonly label: string;
  /** Valor absoluto positivo que espera el backend (`@Min(1)`). */
  readonly value: number;
  /** Valor con signo, solo para referencia visual o lógica de UI. */
  readonly signedValue: number;
}

/** Construye una opción de valencia a partir de su valor con signo. */
function v(signedValue: number): ValenceOption {
  const sign = signedValue >= 0 ? '+' : '-';
  return {
    label: `${sign}${Math.abs(signedValue)}`,
    value: Math.abs(signedValue),
    signedValue,
  };
}

/**
 * Catálogo local de valencias comunes de nivel escolar/secundaria para la
 * formación de compuestos del MVP educativo. No pretende cubrir química
 * avanzada ni estados de oxidación poco usuales; es un catálogo claro y fácil
 * de ampliar. La clave es el símbolo del elemento.
 */
export const COMMON_VALENCES_BY_SYMBOL: Record<string, readonly ValenceOption[]> = {
  // Metales alcalinos
  Li: [v(1)],
  Na: [v(1)],
  K: [v(1)],
  Rb: [v(1)],
  Cs: [v(1)],

  // Metales alcalinotérreos
  Be: [v(2)],
  Mg: [v(2)],
  Ca: [v(2)],
  Sr: [v(2)],
  Ba: [v(2)],

  // Metales comunes
  Al: [v(3)],
  Zn: [v(2)],
  Ag: [v(1)],
  Fe: [v(2), v(3)],
  Cu: [v(1), v(2)],
  Hg: [v(1), v(2)],
  Sn: [v(2), v(4)],
  Pb: [v(2), v(4)],
  Ni: [v(2), v(3)],
  Co: [v(2), v(3)],
  Cr: [v(2), v(3), v(6)],
  Mn: [v(2), v(4), v(7)],
  Au: [v(1), v(3)],
  Pt: [v(2), v(4)],

  // No metales y halógenos comunes
  H: [v(1)],
  F: [v(-1)],
  Cl: [v(-1), v(1), v(3), v(5), v(7)],
  Br: [v(-1), v(1), v(3), v(5), v(7)],
  I: [v(-1), v(1), v(3), v(5), v(7)],
  O: [v(-2)],
  S: [v(-2), v(4), v(6)],
  Se: [v(-2), v(4), v(6)],
  N: [v(-3), v(3), v(5)],
  P: [v(-3), v(3), v(5)],
  C: [v(-4), v(2), v(4)],
  Si: [v(4)],
  B: [v(3)],
};

/**
 * Devuelve las valencias disponibles de un elemento aplicando esta prioridad:
 *
 * 1. Catálogo local de valencias comunes (`COMMON_VALENCES_BY_SYMBOL`).
 * 2. Campo `valence` del dataset de elementos, si existe.
 * 3. Lista vacía → la UI mostrará el input manual de respaldo.
 *
 * Si ambas fuentes aportan valencias se combinan eliminando duplicados por su
 * valor con signo, conservando el orden natural (catálogo primero).
 */
export function valenceOptionsFor(
  symbol: string,
  atomicNumber: number
): readonly ValenceOption[] {
  const fromCatalog = COMMON_VALENCES_BY_SYMBOL[symbol] ?? [];

  const fromDataset: ValenceOption[] = datasetValencesForElement(atomicNumber).map((option) => ({
    label: option.label,
    value: option.value,
    signedValue: option.label.trim().startsWith('-') ? -option.value : option.value,
  }));

  const merged: ValenceOption[] = [];
  const seen = new Set<number>();
  for (const option of [...fromCatalog, ...fromDataset]) {
    if (!seen.has(option.signedValue)) {
      seen.add(option.signedValue);
      merged.push(option);
    }
  }
  return merged;
}
