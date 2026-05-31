export type PeriodicElementCategory =
  | 'metal'
  | 'transition'
  | 'lanthanide'
  | 'actinide'
  | 'metalloid'
  | 'nonmetal'
  | 'halogen'
  | 'noble';

export type PeriodicElementRow = number | 'lan' | 'act';

export interface PeriodicElement {
  readonly atomicNumber: number;
  readonly symbol: string;
  readonly name: string;
  readonly category: PeriodicElementCategory;
  readonly group: number;
  readonly period: number | 'lantanidos' | 'actinidos';
  readonly gridColumn: number;
  readonly gridRow: PeriodicElementRow;
}

export interface PeriodicCategoryMeta {
  readonly id: PeriodicElementCategory;
  readonly label: string;
  readonly className: string;
}

export const PERIODIC_CATEGORIES: readonly PeriodicCategoryMeta[] = [
  { id: 'metal', label: 'Metal', className: 'category-metal' },
  { id: 'transition', label: 'Metal de transición', className: 'category-transition' },
  { id: 'lanthanide', label: 'Lantánido', className: 'category-lanthanide' },
  { id: 'actinide', label: 'Actínido', className: 'category-actinide' },
  { id: 'metalloid', label: 'Metaloide', className: 'category-metalloid' },
  { id: 'nonmetal', label: 'No metal', className: 'category-nonmetal' },
  { id: 'halogen', label: 'Halógeno', className: 'category-halogen' },
  { id: 'noble', label: 'Gas noble', className: 'category-noble-gas' },
];

export const PERIODIC_ELEMENTS: readonly PeriodicElement[] = [
  { atomicNumber: 1, symbol: 'H', name: 'Hidrógeno', gridRow: 1, gridColumn: 1, group: 1, period: 1, category: 'nonmetal' },
  { atomicNumber: 2, symbol: 'He', name: 'Helio', gridRow: 1, gridColumn: 18, group: 18, period: 1, category: 'noble' },
  { atomicNumber: 3, symbol: 'Li', name: 'Litio', gridRow: 2, gridColumn: 1, group: 1, period: 2, category: 'metal' },
  { atomicNumber: 4, symbol: 'Be', name: 'Berilio', gridRow: 2, gridColumn: 2, group: 2, period: 2, category: 'metal' },
  { atomicNumber: 5, symbol: 'B', name: 'Boro', gridRow: 2, gridColumn: 13, group: 13, period: 2, category: 'metalloid' },
  { atomicNumber: 6, symbol: 'C', name: 'Carbono', gridRow: 2, gridColumn: 14, group: 14, period: 2, category: 'nonmetal' },
  { atomicNumber: 7, symbol: 'N', name: 'Nitrógeno', gridRow: 2, gridColumn: 15, group: 15, period: 2, category: 'nonmetal' },
  { atomicNumber: 8, symbol: 'O', name: 'Oxígeno', gridRow: 2, gridColumn: 16, group: 16, period: 2, category: 'nonmetal' },
  { atomicNumber: 9, symbol: 'F', name: 'Flúor', gridRow: 2, gridColumn: 17, group: 17, period: 2, category: 'halogen' },
  { atomicNumber: 10, symbol: 'Ne', name: 'Neón', gridRow: 2, gridColumn: 18, group: 18, period: 2, category: 'noble' },
  { atomicNumber: 11, symbol: 'Na', name: 'Sodio', gridRow: 3, gridColumn: 1, group: 1, period: 3, category: 'metal' },
  { atomicNumber: 12, symbol: 'Mg', name: 'Magnesio', gridRow: 3, gridColumn: 2, group: 2, period: 3, category: 'metal' },
  { atomicNumber: 13, symbol: 'Al', name: 'Aluminio', gridRow: 3, gridColumn: 13, group: 13, period: 3, category: 'metal' },
  { atomicNumber: 14, symbol: 'Si', name: 'Silicio', gridRow: 3, gridColumn: 14, group: 14, period: 3, category: 'metalloid' },
  { atomicNumber: 15, symbol: 'P', name: 'Fósforo', gridRow: 3, gridColumn: 15, group: 15, period: 3, category: 'nonmetal' },
  { atomicNumber: 16, symbol: 'S', name: 'Azufre', gridRow: 3, gridColumn: 16, group: 16, period: 3, category: 'nonmetal' },
  { atomicNumber: 17, symbol: 'Cl', name: 'Cloro', gridRow: 3, gridColumn: 17, group: 17, period: 3, category: 'halogen' },
  { atomicNumber: 18, symbol: 'Ar', name: 'Argón', gridRow: 3, gridColumn: 18, group: 18, period: 3, category: 'noble' },
  { atomicNumber: 19, symbol: 'K', name: 'Potasio', gridRow: 4, gridColumn: 1, group: 1, period: 4, category: 'metal' },
  { atomicNumber: 20, symbol: 'Ca', name: 'Calcio', gridRow: 4, gridColumn: 2, group: 2, period: 4, category: 'metal' },
  { atomicNumber: 21, symbol: 'Sc', name: 'Escandio', gridRow: 4, gridColumn: 3, group: 3, period: 4, category: 'transition' },
  { atomicNumber: 22, symbol: 'Ti', name: 'Titanio', gridRow: 4, gridColumn: 4, group: 4, period: 4, category: 'transition' },
  { atomicNumber: 23, symbol: 'V', name: 'Vanadio', gridRow: 4, gridColumn: 5, group: 5, period: 4, category: 'transition' },
  { atomicNumber: 24, symbol: 'Cr', name: 'Cromo', gridRow: 4, gridColumn: 6, group: 6, period: 4, category: 'transition' },
  { atomicNumber: 25, symbol: 'Mn', name: 'Manganeso', gridRow: 4, gridColumn: 7, group: 7, period: 4, category: 'transition' },
  { atomicNumber: 26, symbol: 'Fe', name: 'Hierro', gridRow: 4, gridColumn: 8, group: 8, period: 4, category: 'transition' },
  { atomicNumber: 27, symbol: 'Co', name: 'Cobalto', gridRow: 4, gridColumn: 9, group: 9, period: 4, category: 'transition' },
  { atomicNumber: 28, symbol: 'Ni', name: 'Níquel', gridRow: 4, gridColumn: 10, group: 10, period: 4, category: 'transition' },
  { atomicNumber: 29, symbol: 'Cu', name: 'Cobre', gridRow: 4, gridColumn: 11, group: 11, period: 4, category: 'transition' },
  { atomicNumber: 30, symbol: 'Zn', name: 'Zinc', gridRow: 4, gridColumn: 12, group: 12, period: 4, category: 'transition' },
  { atomicNumber: 31, symbol: 'Ga', name: 'Galio', gridRow: 4, gridColumn: 13, group: 13, period: 4, category: 'metal' },
  { atomicNumber: 32, symbol: 'Ge', name: 'Germanio', gridRow: 4, gridColumn: 14, group: 14, period: 4, category: 'metalloid' },
  { atomicNumber: 33, symbol: 'As', name: 'Arsénico', gridRow: 4, gridColumn: 15, group: 15, period: 4, category: 'metalloid' },
  { atomicNumber: 34, symbol: 'Se', name: 'Selenio', gridRow: 4, gridColumn: 16, group: 16, period: 4, category: 'nonmetal' },
  { atomicNumber: 35, symbol: 'Br', name: 'Bromo', gridRow: 4, gridColumn: 17, group: 17, period: 4, category: 'halogen' },
  { atomicNumber: 36, symbol: 'Kr', name: 'Kriptón', gridRow: 4, gridColumn: 18, group: 18, period: 4, category: 'noble' },
  { atomicNumber: 37, symbol: 'Rb', name: 'Rubidio', gridRow: 5, gridColumn: 1, group: 1, period: 5, category: 'metal' },
  { atomicNumber: 38, symbol: 'Sr', name: 'Estroncio', gridRow: 5, gridColumn: 2, group: 2, period: 5, category: 'metal' },
  { atomicNumber: 39, symbol: 'Y', name: 'Itrio', gridRow: 5, gridColumn: 3, group: 3, period: 5, category: 'transition' },
  { atomicNumber: 40, symbol: 'Zr', name: 'Zirconio', gridRow: 5, gridColumn: 4, group: 4, period: 5, category: 'transition' },
  { atomicNumber: 41, symbol: 'Nb', name: 'Niobio', gridRow: 5, gridColumn: 5, group: 5, period: 5, category: 'transition' },
  { atomicNumber: 42, symbol: 'Mo', name: 'Molibdeno', gridRow: 5, gridColumn: 6, group: 6, period: 5, category: 'transition' },
  { atomicNumber: 43, symbol: 'Tc', name: 'Tecnecio', gridRow: 5, gridColumn: 7, group: 7, period: 5, category: 'transition' },
  { atomicNumber: 44, symbol: 'Ru', name: 'Rutenio', gridRow: 5, gridColumn: 8, group: 8, period: 5, category: 'transition' },
  { atomicNumber: 45, symbol: 'Rh', name: 'Rodio', gridRow: 5, gridColumn: 9, group: 9, period: 5, category: 'transition' },
  { atomicNumber: 46, symbol: 'Pd', name: 'Paladio', gridRow: 5, gridColumn: 10, group: 10, period: 5, category: 'transition' },
  { atomicNumber: 47, symbol: 'Ag', name: 'Plata', gridRow: 5, gridColumn: 11, group: 11, period: 5, category: 'transition' },
  { atomicNumber: 48, symbol: 'Cd', name: 'Cadmio', gridRow: 5, gridColumn: 12, group: 12, period: 5, category: 'transition' },
  { atomicNumber: 49, symbol: 'In', name: 'Indio', gridRow: 5, gridColumn: 13, group: 13, period: 5, category: 'metal' },
  { atomicNumber: 50, symbol: 'Sn', name: 'Estaño', gridRow: 5, gridColumn: 14, group: 14, period: 5, category: 'metal' },
  { atomicNumber: 51, symbol: 'Sb', name: 'Antimonio', gridRow: 5, gridColumn: 15, group: 15, period: 5, category: 'metalloid' },
  { atomicNumber: 52, symbol: 'Te', name: 'Telurio', gridRow: 5, gridColumn: 16, group: 16, period: 5, category: 'metalloid' },
  { atomicNumber: 53, symbol: 'I', name: 'Yodo', gridRow: 5, gridColumn: 17, group: 17, period: 5, category: 'halogen' },
  { atomicNumber: 54, symbol: 'Xe', name: 'Xenón', gridRow: 5, gridColumn: 18, group: 18, period: 5, category: 'noble' },
  { atomicNumber: 55, symbol: 'Cs', name: 'Cesio', gridRow: 6, gridColumn: 1, group: 1, period: 6, category: 'metal' },
  { atomicNumber: 56, symbol: 'Ba', name: 'Bario', gridRow: 6, gridColumn: 2, group: 2, period: 6, category: 'metal' },
  { atomicNumber: 57, symbol: 'La', name: 'Lantano', gridRow: 6, gridColumn: 3, group: 3, period: 6, category: 'lanthanide' },
  { atomicNumber: 72, symbol: 'Hf', name: 'Hafnio', gridRow: 6, gridColumn: 4, group: 4, period: 6, category: 'transition' },
  { atomicNumber: 73, symbol: 'Ta', name: 'Tantalio', gridRow: 6, gridColumn: 5, group: 5, period: 6, category: 'transition' },
  { atomicNumber: 74, symbol: 'W', name: 'Wolframio', gridRow: 6, gridColumn: 6, group: 6, period: 6, category: 'transition' },
  { atomicNumber: 75, symbol: 'Re', name: 'Renio', gridRow: 6, gridColumn: 7, group: 7, period: 6, category: 'transition' },
  { atomicNumber: 76, symbol: 'Os', name: 'Osmio', gridRow: 6, gridColumn: 8, group: 8, period: 6, category: 'transition' },
  { atomicNumber: 77, symbol: 'Ir', name: 'Iridio', gridRow: 6, gridColumn: 9, group: 9, period: 6, category: 'transition' },
  { atomicNumber: 78, symbol: 'Pt', name: 'Platino', gridRow: 6, gridColumn: 10, group: 10, period: 6, category: 'transition' },
  { atomicNumber: 79, symbol: 'Au', name: 'Oro', gridRow: 6, gridColumn: 11, group: 11, period: 6, category: 'transition' },
  { atomicNumber: 80, symbol: 'Hg', name: 'Mercurio', gridRow: 6, gridColumn: 12, group: 12, period: 6, category: 'transition' },
  { atomicNumber: 81, symbol: 'Tl', name: 'Talio', gridRow: 6, gridColumn: 13, group: 13, period: 6, category: 'metal' },
  { atomicNumber: 82, symbol: 'Pb', name: 'Plomo', gridRow: 6, gridColumn: 14, group: 14, period: 6, category: 'metal' },
  { atomicNumber: 83, symbol: 'Bi', name: 'Bismuto', gridRow: 6, gridColumn: 15, group: 15, period: 6, category: 'metal' },
  { atomicNumber: 84, symbol: 'Po', name: 'Polonio', gridRow: 6, gridColumn: 16, group: 16, period: 6, category: 'metalloid' },
  { atomicNumber: 85, symbol: 'At', name: 'Astato', gridRow: 6, gridColumn: 17, group: 17, period: 6, category: 'halogen' },
  { atomicNumber: 86, symbol: 'Rn', name: 'Radón', gridRow: 6, gridColumn: 18, group: 18, period: 6, category: 'noble' },
  { atomicNumber: 87, symbol: 'Fr', name: 'Francio', gridRow: 7, gridColumn: 1, group: 1, period: 7, category: 'metal' },
  { atomicNumber: 88, symbol: 'Ra', name: 'Radio', gridRow: 7, gridColumn: 2, group: 2, period: 7, category: 'metal' },
  { atomicNumber: 89, symbol: 'Ac', name: 'Actinio', gridRow: 7, gridColumn: 3, group: 3, period: 7, category: 'actinide' },
  { atomicNumber: 104, symbol: 'Rf', name: 'Rutherfordio', gridRow: 7, gridColumn: 4, group: 4, period: 7, category: 'transition' },
  { atomicNumber: 105, symbol: 'Db', name: 'Dubnio', gridRow: 7, gridColumn: 5, group: 5, period: 7, category: 'transition' },
  { atomicNumber: 106, symbol: 'Sg', name: 'Seaborgio', gridRow: 7, gridColumn: 6, group: 6, period: 7, category: 'transition' },
  { atomicNumber: 107, symbol: 'Bh', name: 'Bohrio', gridRow: 7, gridColumn: 7, group: 7, period: 7, category: 'transition' },
  { atomicNumber: 108, symbol: 'Hs', name: 'Hasio', gridRow: 7, gridColumn: 8, group: 8, period: 7, category: 'transition' },
  { atomicNumber: 109, symbol: 'Mt', name: 'Meitnerio', gridRow: 7, gridColumn: 9, group: 9, period: 7, category: 'transition' },
  { atomicNumber: 110, symbol: 'Ds', name: 'Darmstadtio', gridRow: 7, gridColumn: 10, group: 10, period: 7, category: 'transition' },
  { atomicNumber: 111, symbol: 'Rg', name: 'Roentgenio', gridRow: 7, gridColumn: 11, group: 11, period: 7, category: 'transition' },
  { atomicNumber: 112, symbol: 'Cn', name: 'Copernicio', gridRow: 7, gridColumn: 12, group: 12, period: 7, category: 'transition' },
  { atomicNumber: 113, symbol: 'Nh', name: 'Nihonio', gridRow: 7, gridColumn: 13, group: 13, period: 7, category: 'metal' },
  { atomicNumber: 114, symbol: 'Fl', name: 'Flerovio', gridRow: 7, gridColumn: 14, group: 14, period: 7, category: 'metal' },
  { atomicNumber: 115, symbol: 'Mc', name: 'Moscovio', gridRow: 7, gridColumn: 15, group: 15, period: 7, category: 'metal' },
  { atomicNumber: 116, symbol: 'Lv', name: 'Livermorio', gridRow: 7, gridColumn: 16, group: 16, period: 7, category: 'metal' },
  { atomicNumber: 117, symbol: 'Ts', name: 'Teneso', gridRow: 7, gridColumn: 17, group: 17, period: 7, category: 'halogen' },
  { atomicNumber: 118, symbol: 'Og', name: 'Oganesón', gridRow: 7, gridColumn: 18, group: 18, period: 7, category: 'noble' },
  { atomicNumber: 58, symbol: 'Ce', name: 'Cerio', gridRow: 'lan', gridColumn: 4, group: 4, period: 'lantanidos', category: 'lanthanide' },
  { atomicNumber: 59, symbol: 'Pr', name: 'Praseodimio', gridRow: 'lan', gridColumn: 5, group: 5, period: 'lantanidos', category: 'lanthanide' },
  { atomicNumber: 60, symbol: 'Nd', name: 'Neodimio', gridRow: 'lan', gridColumn: 6, group: 6, period: 'lantanidos', category: 'lanthanide' },
  { atomicNumber: 61, symbol: 'Pm', name: 'Prometio', gridRow: 'lan', gridColumn: 7, group: 7, period: 'lantanidos', category: 'lanthanide' },
  { atomicNumber: 62, symbol: 'Sm', name: 'Samario', gridRow: 'lan', gridColumn: 8, group: 8, period: 'lantanidos', category: 'lanthanide' },
  { atomicNumber: 63, symbol: 'Eu', name: 'Europio', gridRow: 'lan', gridColumn: 9, group: 9, period: 'lantanidos', category: 'lanthanide' },
  { atomicNumber: 64, symbol: 'Gd', name: 'Gadolinio', gridRow: 'lan', gridColumn: 10, group: 10, period: 'lantanidos', category: 'lanthanide' },
  { atomicNumber: 65, symbol: 'Tb', name: 'Terbio', gridRow: 'lan', gridColumn: 11, group: 11, period: 'lantanidos', category: 'lanthanide' },
  { atomicNumber: 66, symbol: 'Dy', name: 'Disprosio', gridRow: 'lan', gridColumn: 12, group: 12, period: 'lantanidos', category: 'lanthanide' },
  { atomicNumber: 67, symbol: 'Ho', name: 'Holmio', gridRow: 'lan', gridColumn: 13, group: 13, period: 'lantanidos', category: 'lanthanide' },
  { atomicNumber: 68, symbol: 'Er', name: 'Erbio', gridRow: 'lan', gridColumn: 14, group: 14, period: 'lantanidos', category: 'lanthanide' },
  { atomicNumber: 69, symbol: 'Tm', name: 'Tulio', gridRow: 'lan', gridColumn: 15, group: 15, period: 'lantanidos', category: 'lanthanide' },
  { atomicNumber: 70, symbol: 'Yb', name: 'Iterbio', gridRow: 'lan', gridColumn: 16, group: 16, period: 'lantanidos', category: 'lanthanide' },
  { atomicNumber: 71, symbol: 'Lu', name: 'Lutecio', gridRow: 'lan', gridColumn: 17, group: 17, period: 'lantanidos', category: 'lanthanide' },
  { atomicNumber: 90, symbol: 'Th', name: 'Torio', gridRow: 'act', gridColumn: 4, group: 4, period: 'actinidos', category: 'actinide' },
  { atomicNumber: 91, symbol: 'Pa', name: 'Protactinio', gridRow: 'act', gridColumn: 5, group: 5, period: 'actinidos', category: 'actinide' },
  { atomicNumber: 92, symbol: 'U', name: 'Uranio', gridRow: 'act', gridColumn: 6, group: 6, period: 'actinidos', category: 'actinide' },
  { atomicNumber: 93, symbol: 'Np', name: 'Neptunio', gridRow: 'act', gridColumn: 7, group: 7, period: 'actinidos', category: 'actinide' },
  { atomicNumber: 94, symbol: 'Pu', name: 'Plutonio', gridRow: 'act', gridColumn: 8, group: 8, period: 'actinidos', category: 'actinide' },
  { atomicNumber: 95, symbol: 'Am', name: 'Americio', gridRow: 'act', gridColumn: 9, group: 9, period: 'actinidos', category: 'actinide' },
  { atomicNumber: 96, symbol: 'Cm', name: 'Curio', gridRow: 'act', gridColumn: 10, group: 10, period: 'actinidos', category: 'actinide' },
  { atomicNumber: 97, symbol: 'Bk', name: 'Berkelio', gridRow: 'act', gridColumn: 11, group: 11, period: 'actinidos', category: 'actinide' },
  { atomicNumber: 98, symbol: 'Cf', name: 'Californio', gridRow: 'act', gridColumn: 12, group: 12, period: 'actinidos', category: 'actinide' },
  { atomicNumber: 99, symbol: 'Es', name: 'Einstenio', gridRow: 'act', gridColumn: 13, group: 13, period: 'actinidos', category: 'actinide' },
  { atomicNumber: 100, symbol: 'Fm', name: 'Fermio', gridRow: 'act', gridColumn: 14, group: 14, period: 'actinidos', category: 'actinide' },
  { atomicNumber: 101, symbol: 'Md', name: 'Mendelevio', gridRow: 'act', gridColumn: 15, group: 15, period: 'actinidos', category: 'actinide' },
  { atomicNumber: 102, symbol: 'No', name: 'Nobelio', gridRow: 'act', gridColumn: 16, group: 16, period: 'actinidos', category: 'actinide' },
  { atomicNumber: 103, symbol: 'Lr', name: 'Laurencio', gridRow: 'act', gridColumn: 17, group: 17, period: 'actinidos', category: 'actinide' },
];
