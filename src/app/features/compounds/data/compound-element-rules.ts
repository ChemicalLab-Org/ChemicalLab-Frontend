import { CompoundType } from '../models/chemistry.models';
import { COMMON_VALENCES_BY_SYMBOL } from './common-valences';

/**
 * Reglas de qué elementos puede elegir el usuario en cada tipo de compuesto.
 *
 * El objetivo es no mostrar toda la tabla periódica en los selectores: solo se
 * ofrecen elementos que tienen sentido químico básico para el MVP, que cuentan
 * con valencias en el catálogo común y que el motor químico puede procesar.
 * Se excluyen gases nobles y elementos sin valencias registradas.
 */

/** Metales válidos para hidróxidos, sales y oxisales (todos con valencias). */
export const METAL_SYMBOLS: readonly string[] = [
  'Li', 'Na', 'K', 'Rb', 'Cs', // alcalinos
  'Be', 'Mg', 'Ca', 'Sr', 'Ba', // alcalinotérreos
  'Al', 'Zn', 'Ag', 'Fe', 'Cu', 'Hg', 'Sn', 'Pb', 'Ni', 'Co', 'Cr', 'Mn', 'Au', 'Pt', // comunes
];

/**
 * Elementos que pueden actuar como elemento principal de un óxido: cualquier
 * elemento del catálogo de valencias (metales y no metales) excepto el oxígeno,
 * que es el segundo reactivo del óxido. Quedan excluidos automáticamente los
 * gases nobles y los elementos sin valencias, porque no están en el catálogo.
 */
export const OXIDE_ELEMENT_SYMBOLS: readonly string[] = Object.keys(
  COMMON_VALENCES_BY_SYMBOL
).filter((symbol) => symbol !== 'O');

/**
 * Devuelve los símbolos de elementos permitidos en el selector de elemento/metal
 * para el tipo de compuesto indicado. Para ácidos devuelve una lista vacía
 * porque ese formulario usa un selector de anión, no de elemento.
 */
export function allowedElementSymbols(type: CompoundType): readonly string[] {
  switch (type) {
    case 'oxides':
      return OXIDE_ELEMENT_SYMBOLS;
    case 'hydroxides':
    case 'salts':
    case 'oxisalts':
      return METAL_SYMBOLS;
    case 'acids':
      return [];
  }
}
