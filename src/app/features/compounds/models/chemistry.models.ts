/**
 * Modelos del motor químico.
 *
 * Las interfaces de petición y respuesta replican exactamente los DTOs reales
 * del backend (`ChemicalEngineController` / `ChemicalEngineService`). El backend
 * es la fuente de verdad: las peticiones envían referencias al catálogo
 * (símbolos y claves) y el backend deriva nombres, cargas y fórmulas.
 */

/** Tipos de compuesto que soporta el motor químico, en el orden del diseño. */
export type CompoundType = 'oxides' | 'hydroxides' | 'acids' | 'salts' | 'oxisalts';

/** Tipo de ácido soportado por el motor. Backend: enum `AcidType`. */
export type AcidType = 'HYDRACID' | 'OXOACID';

/**
 * Petición para óxidos e hidróxidos.
 * Backend: `ElementCompoundRequest`.
 */
export interface ElementCompoundRequest {
  readonly elementSymbol: string;
  readonly elementName: string;
  readonly valence: number;
}

/**
 * Petición para ácidos (hidrácidos u oxácidos).
 * Backend: `AcidRequest`. Según `acidType` se usa `nonMetalSymbol` (hidrácido)
 * o `oxoanionKey` (oxácido).
 */
export interface AcidRequest {
  readonly acidType: AcidType;
  readonly nonMetalSymbol?: string;
  readonly oxoanionKey?: string;
}

/**
 * Petición para sales binarias.
 * Backend: `SaltRequest`.
 */
export interface SaltRequest {
  readonly metalSymbol: string;
  readonly metalValence: number;
  readonly nonMetalSymbol: string;
}

/**
 * Petición para oxisales.
 * Backend: `OxisaltRequest`.
 */
export interface OxisaltRequest {
  readonly metalSymbol: string;
  readonly metalValence: number;
  readonly oxoanionKey: string;
}

/**
 * Respuesta común del motor químico para todos los tipos de compuesto.
 * Backend: `CompoundResponse`.
 */
export interface CompoundResponse {
  readonly valid: boolean;
  readonly compoundType: string;
  readonly formula: string;
  readonly name: string;
  readonly explanation: string;
}

// ===== Catálogos (fuente de verdad del backend) =====

/** Metal del catálogo. Backend: `MetalResponse`. */
export interface MetalCatalogItem {
  readonly symbol: string;
  readonly name: string;
  readonly valences: readonly number[];
}

/** Anión monoatómico para sales binarias. Backend: `BinaryAnionResponse`. */
export interface BinaryNonMetalItem {
  readonly symbol: string;
  readonly name: string;
  readonly charge: number;
}

/** No metal que forma ácido hidrácido. Backend: `AcidNonMetalResponse`. */
export interface AcidNonMetalItem {
  readonly symbol: string;
  readonly name: string;
  readonly charge: number;
}

/** Oxoanión (grupo oxácido). Backend: `OxoanionResponse`. */
export interface OxoanionItem {
  readonly key: string;
  readonly name: string;
  readonly formula: string;
  readonly charge: number;
  readonly centralElement: string;
}

/** Elemento central de un oxoanión. Backend: `CentralElementResponse`. */
export interface CentralElementItem {
  readonly symbol: string;
  readonly name: string;
}
