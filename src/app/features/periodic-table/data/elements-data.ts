/**
 * Datos de los 118 elementos de la tabla periódica.
 *
 * Los campos provienen directamente del diseño de referencia: solo se
 * incluye la información que existe realmente (número atómico, símbolo,
 * nombre, categoría y posición en la cuadrícula). No se añaden propiedades
 * químicas inventadas.
 */

/** Categoría del elemento, usada para el color de la celda. */
export type ElementCategory =
  | 'metal'
  | 'transition'
  | 'lanthanide'
  | 'actinide'
  | 'metalloid'
  | 'nonmetal'
  | 'halogen'
  | 'noble';

/**
 * Fila visual del elemento. Es el período (1-7) para la tabla principal,
 * o 'lan' / 'act' para las series de lantánidos y actínidos que se dibujan
 * en dos filas inferiores separadas.
 */
export type ElementRow = number | 'lan' | 'act';

/** Elemento químico tal como se representa en la tabla periódica. */
export interface PeriodicElement {
  /** Número atómico. */
  readonly atomicNumber: number;
  /** Símbolo químico. */
  readonly symbol: string;
  /** Nombre en español. */
  readonly name: string;
  /** Categoría que determina el color de la celda. */
  readonly category: ElementCategory;
  /** Columna (1-18) dentro de la cuadrícula. */
  readonly gridColumn: number;
  /** Fila visual: período numérico o serie ('lan' / 'act'). */
  readonly gridRow: ElementRow;
}

export const PERIODIC_ELEMENTS: readonly PeriodicElement[] = [
  // Período 1
  { atomicNumber: 1, symbol: 'H', name: 'Hidrógeno', gridRow: 1, gridColumn: 1, category: 'nonmetal' },
  { atomicNumber: 2, symbol: 'He', name: 'Helio', gridRow: 1, gridColumn: 18, category: 'noble' },

  // Período 2
  { atomicNumber: 3, symbol: 'Li', name: 'Litio', gridRow: 2, gridColumn: 1, category: 'metal' },
  { atomicNumber: 4, symbol: 'Be', name: 'Berilio', gridRow: 2, gridColumn: 2, category: 'metal' },
  { atomicNumber: 5, symbol: 'B', name: 'Boro', gridRow: 2, gridColumn: 13, category: 'metalloid' },
  { atomicNumber: 6, symbol: 'C', name: 'Carbono', gridRow: 2, gridColumn: 14, category: 'nonmetal' },
  { atomicNumber: 7, symbol: 'N', name: 'Nitrógeno', gridRow: 2, gridColumn: 15, category: 'nonmetal' },
  { atomicNumber: 8, symbol: 'O', name: 'Oxígeno', gridRow: 2, gridColumn: 16, category: 'nonmetal' },
  { atomicNumber: 9, symbol: 'F', name: 'Flúor', gridRow: 2, gridColumn: 17, category: 'halogen' },
  { atomicNumber: 10, symbol: 'Ne', name: 'Neón', gridRow: 2, gridColumn: 18, category: 'noble' },

  // Período 3
  { atomicNumber: 11, symbol: 'Na', name: 'Sodio', gridRow: 3, gridColumn: 1, category: 'metal' },
  { atomicNumber: 12, symbol: 'Mg', name: 'Magnesio', gridRow: 3, gridColumn: 2, category: 'metal' },
  { atomicNumber: 13, symbol: 'Al', name: 'Aluminio', gridRow: 3, gridColumn: 13, category: 'metal' },
  { atomicNumber: 14, symbol: 'Si', name: 'Silicio', gridRow: 3, gridColumn: 14, category: 'metalloid' },
  { atomicNumber: 15, symbol: 'P', name: 'Fósforo', gridRow: 3, gridColumn: 15, category: 'nonmetal' },
  { atomicNumber: 16, symbol: 'S', name: 'Azufre', gridRow: 3, gridColumn: 16, category: 'nonmetal' },
  { atomicNumber: 17, symbol: 'Cl', name: 'Cloro', gridRow: 3, gridColumn: 17, category: 'halogen' },
  { atomicNumber: 18, symbol: 'Ar', name: 'Argón', gridRow: 3, gridColumn: 18, category: 'noble' },

  // Período 4
  { atomicNumber: 19, symbol: 'K', name: 'Potasio', gridRow: 4, gridColumn: 1, category: 'metal' },
  { atomicNumber: 20, symbol: 'Ca', name: 'Calcio', gridRow: 4, gridColumn: 2, category: 'metal' },
  { atomicNumber: 21, symbol: 'Sc', name: 'Escandio', gridRow: 4, gridColumn: 3, category: 'transition' },
  { atomicNumber: 22, symbol: 'Ti', name: 'Titanio', gridRow: 4, gridColumn: 4, category: 'transition' },
  { atomicNumber: 23, symbol: 'V', name: 'Vanadio', gridRow: 4, gridColumn: 5, category: 'transition' },
  { atomicNumber: 24, symbol: 'Cr', name: 'Cromo', gridRow: 4, gridColumn: 6, category: 'transition' },
  { atomicNumber: 25, symbol: 'Mn', name: 'Manganeso', gridRow: 4, gridColumn: 7, category: 'transition' },
  { atomicNumber: 26, symbol: 'Fe', name: 'Hierro', gridRow: 4, gridColumn: 8, category: 'transition' },
  { atomicNumber: 27, symbol: 'Co', name: 'Cobalto', gridRow: 4, gridColumn: 9, category: 'transition' },
  { atomicNumber: 28, symbol: 'Ni', name: 'Níquel', gridRow: 4, gridColumn: 10, category: 'transition' },
  { atomicNumber: 29, symbol: 'Cu', name: 'Cobre', gridRow: 4, gridColumn: 11, category: 'transition' },
  { atomicNumber: 30, symbol: 'Zn', name: 'Zinc', gridRow: 4, gridColumn: 12, category: 'transition' },
  { atomicNumber: 31, symbol: 'Ga', name: 'Galio', gridRow: 4, gridColumn: 13, category: 'metal' },
  { atomicNumber: 32, symbol: 'Ge', name: 'Germanio', gridRow: 4, gridColumn: 14, category: 'metalloid' },
  { atomicNumber: 33, symbol: 'As', name: 'Arsénico', gridRow: 4, gridColumn: 15, category: 'metalloid' },
  { atomicNumber: 34, symbol: 'Se', name: 'Selenio', gridRow: 4, gridColumn: 16, category: 'nonmetal' },
  { atomicNumber: 35, symbol: 'Br', name: 'Bromo', gridRow: 4, gridColumn: 17, category: 'halogen' },
  { atomicNumber: 36, symbol: 'Kr', name: 'Kriptón', gridRow: 4, gridColumn: 18, category: 'noble' },

  // Período 5
  { atomicNumber: 37, symbol: 'Rb', name: 'Rubidio', gridRow: 5, gridColumn: 1, category: 'metal' },
  { atomicNumber: 38, symbol: 'Sr', name: 'Estroncio', gridRow: 5, gridColumn: 2, category: 'metal' },
  { atomicNumber: 39, symbol: 'Y', name: 'Itrio', gridRow: 5, gridColumn: 3, category: 'transition' },
  { atomicNumber: 40, symbol: 'Zr', name: 'Zirconio', gridRow: 5, gridColumn: 4, category: 'transition' },
  { atomicNumber: 41, symbol: 'Nb', name: 'Niobio', gridRow: 5, gridColumn: 5, category: 'transition' },
  { atomicNumber: 42, symbol: 'Mo', name: 'Molibdeno', gridRow: 5, gridColumn: 6, category: 'transition' },
  { atomicNumber: 43, symbol: 'Tc', name: 'Tecnecio', gridRow: 5, gridColumn: 7, category: 'transition' },
  { atomicNumber: 44, symbol: 'Ru', name: 'Rutenio', gridRow: 5, gridColumn: 8, category: 'transition' },
  { atomicNumber: 45, symbol: 'Rh', name: 'Rodio', gridRow: 5, gridColumn: 9, category: 'transition' },
  { atomicNumber: 46, symbol: 'Pd', name: 'Paladio', gridRow: 5, gridColumn: 10, category: 'transition' },
  { atomicNumber: 47, symbol: 'Ag', name: 'Plata', gridRow: 5, gridColumn: 11, category: 'transition' },
  { atomicNumber: 48, symbol: 'Cd', name: 'Cadmio', gridRow: 5, gridColumn: 12, category: 'transition' },
  { atomicNumber: 49, symbol: 'In', name: 'Indio', gridRow: 5, gridColumn: 13, category: 'metal' },
  { atomicNumber: 50, symbol: 'Sn', name: 'Estaño', gridRow: 5, gridColumn: 14, category: 'metal' },
  { atomicNumber: 51, symbol: 'Sb', name: 'Antimonio', gridRow: 5, gridColumn: 15, category: 'metalloid' },
  { atomicNumber: 52, symbol: 'Te', name: 'Telurio', gridRow: 5, gridColumn: 16, category: 'metalloid' },
  { atomicNumber: 53, symbol: 'I', name: 'Yodo', gridRow: 5, gridColumn: 17, category: 'halogen' },
  { atomicNumber: 54, symbol: 'Xe', name: 'Xenón', gridRow: 5, gridColumn: 18, category: 'noble' },

  // Período 6
  { atomicNumber: 55, symbol: 'Cs', name: 'Cesio', gridRow: 6, gridColumn: 1, category: 'metal' },
  { atomicNumber: 56, symbol: 'Ba', name: 'Bario', gridRow: 6, gridColumn: 2, category: 'metal' },
  { atomicNumber: 57, symbol: 'La', name: 'Lantano', gridRow: 6, gridColumn: 3, category: 'lanthanide' },
  { atomicNumber: 72, symbol: 'Hf', name: 'Hafnio', gridRow: 6, gridColumn: 4, category: 'transition' },
  { atomicNumber: 73, symbol: 'Ta', name: 'Tantalio', gridRow: 6, gridColumn: 5, category: 'transition' },
  { atomicNumber: 74, symbol: 'W', name: 'Wolframio', gridRow: 6, gridColumn: 6, category: 'transition' },
  { atomicNumber: 75, symbol: 'Re', name: 'Renio', gridRow: 6, gridColumn: 7, category: 'transition' },
  { atomicNumber: 76, symbol: 'Os', name: 'Osmio', gridRow: 6, gridColumn: 8, category: 'transition' },
  { atomicNumber: 77, symbol: 'Ir', name: 'Iridio', gridRow: 6, gridColumn: 9, category: 'transition' },
  { atomicNumber: 78, symbol: 'Pt', name: 'Platino', gridRow: 6, gridColumn: 10, category: 'transition' },
  { atomicNumber: 79, symbol: 'Au', name: 'Oro', gridRow: 6, gridColumn: 11, category: 'transition' },
  { atomicNumber: 80, symbol: 'Hg', name: 'Mercurio', gridRow: 6, gridColumn: 12, category: 'transition' },
  { atomicNumber: 81, symbol: 'Tl', name: 'Talio', gridRow: 6, gridColumn: 13, category: 'metal' },
  { atomicNumber: 82, symbol: 'Pb', name: 'Plomo', gridRow: 6, gridColumn: 14, category: 'metal' },
  { atomicNumber: 83, symbol: 'Bi', name: 'Bismuto', gridRow: 6, gridColumn: 15, category: 'metal' },
  { atomicNumber: 84, symbol: 'Po', name: 'Polonio', gridRow: 6, gridColumn: 16, category: 'metalloid' },
  { atomicNumber: 85, symbol: 'At', name: 'Astato', gridRow: 6, gridColumn: 17, category: 'halogen' },
  { atomicNumber: 86, symbol: 'Rn', name: 'Radón', gridRow: 6, gridColumn: 18, category: 'noble' },

  // Período 7
  { atomicNumber: 87, symbol: 'Fr', name: 'Francio', gridRow: 7, gridColumn: 1, category: 'metal' },
  { atomicNumber: 88, symbol: 'Ra', name: 'Radio', gridRow: 7, gridColumn: 2, category: 'metal' },
  { atomicNumber: 89, symbol: 'Ac', name: 'Actinio', gridRow: 7, gridColumn: 3, category: 'actinide' },
  { atomicNumber: 104, symbol: 'Rf', name: 'Rutherfordio', gridRow: 7, gridColumn: 4, category: 'transition' },
  { atomicNumber: 105, symbol: 'Db', name: 'Dubnio', gridRow: 7, gridColumn: 5, category: 'transition' },
  { atomicNumber: 106, symbol: 'Sg', name: 'Seaborgio', gridRow: 7, gridColumn: 6, category: 'transition' },
  { atomicNumber: 107, symbol: 'Bh', name: 'Bohrio', gridRow: 7, gridColumn: 7, category: 'transition' },
  { atomicNumber: 108, symbol: 'Hs', name: 'Hasio', gridRow: 7, gridColumn: 8, category: 'transition' },
  { atomicNumber: 109, symbol: 'Mt', name: 'Meitnerio', gridRow: 7, gridColumn: 9, category: 'transition' },
  { atomicNumber: 110, symbol: 'Ds', name: 'Darmstadtio', gridRow: 7, gridColumn: 10, category: 'transition' },
  { atomicNumber: 111, symbol: 'Rg', name: 'Roentgenio', gridRow: 7, gridColumn: 11, category: 'transition' },
  { atomicNumber: 112, symbol: 'Cn', name: 'Copernicio', gridRow: 7, gridColumn: 12, category: 'transition' },
  { atomicNumber: 113, symbol: 'Nh', name: 'Nihonio', gridRow: 7, gridColumn: 13, category: 'metal' },
  { atomicNumber: 114, symbol: 'Fl', name: 'Flerovio', gridRow: 7, gridColumn: 14, category: 'metal' },
  { atomicNumber: 115, symbol: 'Mc', name: 'Moscovio', gridRow: 7, gridColumn: 15, category: 'metal' },
  { atomicNumber: 116, symbol: 'Lv', name: 'Livermorio', gridRow: 7, gridColumn: 16, category: 'metal' },
  { atomicNumber: 117, symbol: 'Ts', name: 'Teneso', gridRow: 7, gridColumn: 17, category: 'halogen' },
  { atomicNumber: 118, symbol: 'Og', name: 'Oganesón', gridRow: 7, gridColumn: 18, category: 'noble' },

  // Lantánidos (serie inferior, fila 'lan')
  { atomicNumber: 58, symbol: 'Ce', name: 'Cerio', gridRow: 'lan', gridColumn: 4, category: 'lanthanide' },
  { atomicNumber: 59, symbol: 'Pr', name: 'Praseodimio', gridRow: 'lan', gridColumn: 5, category: 'lanthanide' },
  { atomicNumber: 60, symbol: 'Nd', name: 'Neodimio', gridRow: 'lan', gridColumn: 6, category: 'lanthanide' },
  { atomicNumber: 61, symbol: 'Pm', name: 'Prometio', gridRow: 'lan', gridColumn: 7, category: 'lanthanide' },
  { atomicNumber: 62, symbol: 'Sm', name: 'Samario', gridRow: 'lan', gridColumn: 8, category: 'lanthanide' },
  { atomicNumber: 63, symbol: 'Eu', name: 'Europio', gridRow: 'lan', gridColumn: 9, category: 'lanthanide' },
  { atomicNumber: 64, symbol: 'Gd', name: 'Gadolinio', gridRow: 'lan', gridColumn: 10, category: 'lanthanide' },
  { atomicNumber: 65, symbol: 'Tb', name: 'Terbio', gridRow: 'lan', gridColumn: 11, category: 'lanthanide' },
  { atomicNumber: 66, symbol: 'Dy', name: 'Disprosio', gridRow: 'lan', gridColumn: 12, category: 'lanthanide' },
  { atomicNumber: 67, symbol: 'Ho', name: 'Holmio', gridRow: 'lan', gridColumn: 13, category: 'lanthanide' },
  { atomicNumber: 68, symbol: 'Er', name: 'Erbio', gridRow: 'lan', gridColumn: 14, category: 'lanthanide' },
  { atomicNumber: 69, symbol: 'Tm', name: 'Tulio', gridRow: 'lan', gridColumn: 15, category: 'lanthanide' },
  { atomicNumber: 70, symbol: 'Yb', name: 'Iterbio', gridRow: 'lan', gridColumn: 16, category: 'lanthanide' },
  { atomicNumber: 71, symbol: 'Lu', name: 'Lutecio', gridRow: 'lan', gridColumn: 17, category: 'lanthanide' },

  // Actínidos (serie inferior, fila 'act')
  { atomicNumber: 90, symbol: 'Th', name: 'Torio', gridRow: 'act', gridColumn: 4, category: 'actinide' },
  { atomicNumber: 91, symbol: 'Pa', name: 'Protactinio', gridRow: 'act', gridColumn: 5, category: 'actinide' },
  { atomicNumber: 92, symbol: 'U', name: 'Uranio', gridRow: 'act', gridColumn: 6, category: 'actinide' },
  { atomicNumber: 93, symbol: 'Np', name: 'Neptunio', gridRow: 'act', gridColumn: 7, category: 'actinide' },
  { atomicNumber: 94, symbol: 'Pu', name: 'Plutonio', gridRow: 'act', gridColumn: 8, category: 'actinide' },
  { atomicNumber: 95, symbol: 'Am', name: 'Americio', gridRow: 'act', gridColumn: 9, category: 'actinide' },
  { atomicNumber: 96, symbol: 'Cm', name: 'Curio', gridRow: 'act', gridColumn: 10, category: 'actinide' },
  { atomicNumber: 97, symbol: 'Bk', name: 'Berkelio', gridRow: 'act', gridColumn: 11, category: 'actinide' },
  { atomicNumber: 98, symbol: 'Cf', name: 'Californio', gridRow: 'act', gridColumn: 12, category: 'actinide' },
  { atomicNumber: 99, symbol: 'Es', name: 'Einstenio', gridRow: 'act', gridColumn: 13, category: 'actinide' },
  { atomicNumber: 100, symbol: 'Fm', name: 'Fermio', gridRow: 'act', gridColumn: 14, category: 'actinide' },
  { atomicNumber: 101, symbol: 'Md', name: 'Mendelevio', gridRow: 'act', gridColumn: 15, category: 'actinide' },
  { atomicNumber: 102, symbol: 'No', name: 'Nobelio', gridRow: 'act', gridColumn: 16, category: 'actinide' },
  { atomicNumber: 103, symbol: 'Lr', name: 'Laurencio', gridRow: 'act', gridColumn: 17, category: 'actinide' },
];

/** Etiqueta legible de cada categoría, usada en leyenda y badges. */
export const CATEGORY_LABELS: Readonly<Record<ElementCategory, string>> = {
  metal: 'Metal',
  transition: 'Metal de transición',
  lanthanide: 'Lantánido',
  actinide: 'Actínido',
  metalloid: 'Metaloide',
  nonmetal: 'No metal',
  halogen: 'Halógeno',
  noble: 'Gas noble',
};

/** Orden en que se muestran las categorías en la leyenda. */
export const LEGEND_CATEGORIES: readonly ElementCategory[] = [
  'metal',
  'transition',
  'lanthanide',
  'actinide',
  'metalloid',
  'nonmetal',
  'halogen',
  'noble',
];

/** Filtro tipo pill. `categories` en null equivale a "mostrar todos". */
export interface ElementFilter {
  readonly id: string;
  readonly label: string;
  readonly categories: readonly ElementCategory[] | null;
}

export const ELEMENT_FILTERS: readonly ElementFilter[] = [
  { id: 'all', label: 'Todos', categories: null },
  { id: 'metal', label: 'Metales', categories: ['metal', 'lanthanide', 'actinide'] },
  { id: 'nonmetal', label: 'No metales', categories: ['nonmetal'] },
  { id: 'metalloid', label: 'Metaloides', categories: ['metalloid'] },
  { id: 'noble', label: 'Gases nobles', categories: ['noble'] },
  { id: 'halogen', label: 'Halógenos', categories: ['halogen'] },
  { id: 'transition', label: 'Metales de transición', categories: ['transition'] },
];

/**
 * Detalle ampliado de un elemento para el panel lateral.
 *
 * Solo se incluye la información que existe en el diseño de referencia.
 * Las propiedades opcionales se omiten cuando no hay un dato real.
 */
export interface ElementDetail {
  /** Etiqueta de tipo más específica que la categoría (p. ej. "Metal alcalino"). */
  readonly typeLabel?: string;
  readonly atomicMass?: string;
  readonly state?: string;
  readonly valence?: string;
  readonly electronegativity?: string;
  readonly description?: string;
  /** Distribución de electrones por capa (p. ej. [2, 8, 1] para el sodio). */
  readonly shells?: readonly number[];
}

/**
 * Detalles disponibles por número atómico. El diseño de referencia solo
 * incluye datos completos para el sodio; el resto se muestra con los campos
 * que se pueden derivar de la posición (grupo, período) y un texto de
 * descripción pendiente. No se inventan datos químicos.
 */
export const ELEMENT_DETAILS: Readonly<Record<number, ElementDetail>> = {
  11: {
    typeLabel: 'Metal alcalino',
    atomicMass: '22.990 u',
    state: 'Sólido',
    valence: '+1',
    electronegativity: '0.93',
    shells: [2, 8, 1],
    description:
      'El sodio es un metal alcalino muy reactivo, suave y de color plateado. Se encuentra en la sal común (NaCl) y es esencial para la vida. En el laboratorio se conserva sumergido en aceite porque reacciona con el agua y el aire.',
  },
};

/** Valencia disponible de un elemento, lista para mostrarse y enviarse. */
export interface ValenceOption {
  /** Etiqueta tal como aparece en los datos (p. ej. "+1", "-2"). */
  readonly label: string;
  /** Valor absoluto numérico que espera el motor químico (p. ej. 1, 2). */
  readonly value: number;
}

/**
 * Valencias registradas para un elemento, derivadas del campo `valence` de
 * `ELEMENT_DETAILS`. El campo es un texto como "+1" o "+2,+3"; aquí se separa
 * en opciones individuales. Si el elemento no tiene valencias registradas
 * devuelve una lista vacía. No se inventan valencias: solo se usan los datos
 * existentes.
 */
export function valencesForElement(atomicNumber: number): readonly ValenceOption[] {
  const raw = ELEMENT_DETAILS[atomicNumber]?.valence;
  if (!raw) {
    return [];
  }
  return raw
    .split(',')
    .map((token) => token.trim())
    .filter((token) => token.length > 0)
    .map((token) => {
      const digits = token.replace(/[^0-9]/g, '');
      const value = digits === '' ? 0 : Number.parseInt(digits, 10);
      return { label: token, value } satisfies ValenceOption;
    })
    .filter((option) => option.value > 0);
}

/**
 * Capacidad máxima de electrones por nivel de energía (regla 2n²): K, L, M…
 * Se usa solo para una representación visual esquemática del átomo.
 */
const SHELL_CAPACITY: readonly number[] = [2, 8, 18, 32, 32, 18, 8];

/**
 * Distribución esquemática de electrones por capa a partir del número
 * atómico, llenando cada nivel hasta su capacidad. No es la configuración
 * electrónica real (no contempla subniveles ni excepciones); sirve únicamente
 * como apoyo visual para el modelo atómico.
 */
export function schematicShells(atomicNumber: number): readonly number[] {
  const shells: number[] = [];
  let remaining = atomicNumber;
  for (const capacity of SHELL_CAPACITY) {
    if (remaining <= 0) {
      break;
    }
    const electrons = Math.min(capacity, remaining);
    shells.push(electrons);
    remaining -= electrons;
  }
  return shells;
}

/** Período visual (1-7) derivado de la fila. Las series se ubican en 6 y 7. */
export function periodOf(element: PeriodicElement): number {
  if (typeof element.gridRow === 'number') {
    return element.gridRow;
  }
  return element.gridRow === 'lan' ? 6 : 7;
}

/**
 * Grupo derivado de la columna para la tabla principal. Las series de
 * lantánidos y actínidos no tienen un grupo simple, por lo que devuelve null.
 */
export function groupOf(element: PeriodicElement): number | null {
  return typeof element.gridRow === 'number' ? element.gridColumn : null;
}
