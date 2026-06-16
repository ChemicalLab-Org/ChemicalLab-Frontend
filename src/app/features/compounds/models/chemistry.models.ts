/**
 * Modelos del motor químico.
 *
 * Las interfaces de petición y respuesta replican exactamente los DTOs reales
 * del backend (`ChemicalEngineController` / `ChemicalEngineService`). No se
 * añaden campos que el backend no espera ni devuelve.
 */

/** Tipos de compuesto que soporta el motor químico, en el orden del diseño. */
export type CompoundType = 'oxides' | 'hydroxides' | 'acids' | 'salts' | 'oxisalts';

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
 * Petición para ácidos (hidrácidos).
 * Backend: `AcidRequest`.
 */
export interface AcidRequest {
  readonly anionFormula: string;
  readonly anionName: string;
  readonly anionCharge: number;
  readonly acidName: string;
}

/**
 * Petición para sales binarias.
 * Backend: `SaltRequest`.
 */
export interface SaltRequest {
  readonly metalSymbol: string;
  readonly metalName: string;
  readonly metalValence: number;
  readonly nonMetalSymbol: string;
  readonly anionName: string;
  readonly anionCharge: number;
}

/**
 * Petición para oxisales.
 * Backend: `OxisaltRequest`.
 */
export interface OxisaltRequest {
  readonly metalSymbol: string;
  readonly metalName: string;
  readonly metalValence: number;
  readonly groupFormula: string;
  readonly groupName: string;
  readonly groupCharge: number;
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
