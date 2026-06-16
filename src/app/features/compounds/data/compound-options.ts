/**
 * Datos de referencia para los selectores de la pantalla de formación de
 * compuestos. Son aniones y grupos de uso escolar habitual; cada uno aporta
 * los campos que el backend necesita (fórmula/símbolo, nombre y carga). No
 * describen la fórmula final del compuesto: de eso se encarga el motor químico,
 * que cruza las cargas.
 *
 * Estos catálogos están alineados con el catálogo del backend
 * (`ChemistryCatalogService` / endpoints `/api/chemistry/catalog/*`). Si se
 * amplía uno, conviene reflejar el cambio en el otro.
 */

/** Anión monoatómico de una sal binaria (no metal con carga negativa). */
export interface BinaryAnionOption {
  /** Símbolo del no metal (p. ej. "Cl", "S"). */
  readonly symbol: string;
  /** Nombre del anión usado en el nombre del compuesto (p. ej. "cloruro"). */
  readonly anionName: string;
  /** Carga (valor absoluto) con la que trabaja el anión. */
  readonly charge: number;
}

/**
 * Anión que además forma un hidrácido al combinarse con hidrógeno. Solo los no
 * metales que forman ácido válido (halógenos -1 y anfígenos -2) llevan este
 * campo extra, por eso se usa para el selector de ácidos.
 */
export interface AnionOption extends BinaryAnionOption {
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
 * Aniones que forman hidrácidos (selector de ácidos): halógenos con carga -1 y
 * anfígenos con carga -2. Son un subconjunto de los aniones de sal binaria.
 */
export const ANION_OPTIONS: readonly AnionOption[] = [
  { symbol: 'Cl', anionName: 'cloruro', charge: 1, acidName: 'ácido clorhídrico' },
  { symbol: 'F', anionName: 'fluoruro', charge: 1, acidName: 'ácido fluorhídrico' },
  { symbol: 'Br', anionName: 'bromuro', charge: 1, acidName: 'ácido bromhídrico' },
  { symbol: 'I', anionName: 'yoduro', charge: 1, acidName: 'ácido yodhídrico' },
  { symbol: 'S', anionName: 'sulfuro', charge: 2, acidName: 'ácido sulfhídrico' },
  { symbol: 'Se', anionName: 'seleniuro', charge: 2, acidName: 'ácido selenhídrico' },
];

/**
 * Aniones monoatómicos para sales binarias. Amplía a los aniones de ácido con
 * no metales que forman sal pero no hidrácido habitual (nitruro, fosfuro,
 * carburo). El motor químico cruza las cargas para equilibrar la fórmula.
 */
export const BINARY_ANION_OPTIONS: readonly BinaryAnionOption[] = [
  { symbol: 'F', anionName: 'fluoruro', charge: 1 },
  { symbol: 'Cl', anionName: 'cloruro', charge: 1 },
  { symbol: 'Br', anionName: 'bromuro', charge: 1 },
  { symbol: 'I', anionName: 'yoduro', charge: 1 },
  { symbol: 'S', anionName: 'sulfuro', charge: 2 },
  { symbol: 'Se', anionName: 'seleniuro', charge: 2 },
  { symbol: 'N', anionName: 'nitruro', charge: 3 },
  { symbol: 'P', anionName: 'fosfuro', charge: 3 },
  { symbol: 'C', anionName: 'carburo', charge: 4 },
];

/** Grupos oxácidos (oxisales) de uso escolar habitual. */
export const OXACID_GROUP_OPTIONS: readonly OxacidGroupOption[] = [
  { formula: 'SO4', name: 'sulfato', charge: 2 },
  { formula: 'SO3', name: 'sulfito', charge: 2 },
  { formula: 'NO3', name: 'nitrato', charge: 1 },
  { formula: 'NO2', name: 'nitrito', charge: 1 },
  { formula: 'CO3', name: 'carbonato', charge: 2 },
  { formula: 'PO4', name: 'fosfato', charge: 3 },
  { formula: 'PO3', name: 'fosfito', charge: 3 },
  { formula: 'ClO3', name: 'clorato', charge: 1 },
  { formula: 'ClO2', name: 'clorito', charge: 1 },
  { formula: 'ClO', name: 'hipoclorito', charge: 1 },
  { formula: 'ClO4', name: 'perclorato', charge: 1 },
  { formula: 'BrO3', name: 'bromato', charge: 1 },
  { formula: 'IO3', name: 'yodato', charge: 1 },
  { formula: 'MnO4', name: 'permanganato', charge: 1 },
  { formula: 'CrO4', name: 'cromato', charge: 2 },
  { formula: 'Cr2O7', name: 'dicromato', charge: 2 },
];
