/**
 * Datos de referencia para los selectores de la pantalla de formación de
 * compuestos. Son grupos y aniones de uso escolar habitual; cada uno aporta
 * los campos que el backend necesita (fórmula, nombre y carga). No describen
 * la fórmula final del compuesto: de eso se encarga el motor químico.
 */

/** Anión de un hidrácido (ácido) o de una sal binaria. */
export interface AnionOption {
  /** Símbolo o fórmula del no metal (p. ej. "Cl", "S"). */
  readonly symbol: string;
  /** Nombre del anión usado en el nombre del compuesto (p. ej. "cloruro"). */
  readonly anionName: string;
  /** Carga (valor absoluto) con la que trabaja el anión. */
  readonly charge: number;
  /** Nombre del ácido resultante al combinarse con hidrógeno. */
  readonly acidName: string;
}

/** Grupo oxácido (radical poliatómico) para formar oxisales. */
export interface OxacidGroupOption {
  /** Fórmula del grupo (p. ej. "SO4"). */
  readonly formula: string;
  /** Nombre del grupo usado en el nombre del compuesto (p. ej. "sulfato"). */
  readonly name: string;
  /** Carga (valor absoluto) del grupo. */
  readonly charge: number;
}

/**
 * Aniones de no metales habituales para sales binarias e hidrácidos.
 * Son no metales que forman hidrácidos válidos (halógenos con carga -1 y
 * anfígenos con carga -2), por lo que sirven tanto para el selector de ácidos
 * como para el de sales binarias.
 */
export const ANION_OPTIONS: readonly AnionOption[] = [
  { symbol: 'Cl', anionName: 'cloruro', charge: 1, acidName: 'ácido clorhídrico' },
  { symbol: 'F', anionName: 'fluoruro', charge: 1, acidName: 'ácido fluorhídrico' },
  { symbol: 'Br', anionName: 'bromuro', charge: 1, acidName: 'ácido bromhídrico' },
  { symbol: 'I', anionName: 'yoduro', charge: 1, acidName: 'ácido yodhídrico' },
  { symbol: 'S', anionName: 'sulfuro', charge: 2, acidName: 'ácido sulfhídrico' },
  { symbol: 'Se', anionName: 'seleniuro', charge: 2, acidName: 'ácido selenhídrico' },
];

/** Grupos oxácidos habituales (oxisales). */
export const OXACID_GROUP_OPTIONS: readonly OxacidGroupOption[] = [
  { formula: 'SO4', name: 'sulfato', charge: 2 },
  { formula: 'NO3', name: 'nitrato', charge: 1 },
  { formula: 'CO3', name: 'carbonato', charge: 2 },
  { formula: 'PO4', name: 'fosfato', charge: 3 },
];
