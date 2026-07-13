# Inventario educativo de tabla periódica — ChemicalLab

## 1. Estado actual del módulo

Archivos revisados:

- `src/app/features/periodic-table/periodic-table.component.ts` — componente standalone (tabla + panel de detalle, sin dependencias de librerías UI externas).
- `src/app/features/periodic-table/periodic-table.component.scss` — estilos.
- `src/app/features/periodic-table/data/elements-data.ts` — única fuente de datos de los elementos.
- `src/app/features/compounds/data/common-valences.ts` — catálogo de valencias del módulo de formación de compuestos (relacionado pero independiente, ver sección 7).

**El módulo es 100% frontend.** No hay servicio HTTP, no hay endpoint de backend involucrado. Los 118 elementos y sus detalles están definidos como constantes TypeScript embebidas en el bundle. La única llamada a un servicio (`UsageMetricsService.trackElementViewed`) es de telemetría (qué elemento se consultó), no de datos.

Estructura actual de datos (`elements-data.ts`):

- `PeriodicElement` (los 118 elementos, siempre completo): `atomicNumber`, `symbol`, `name` (español), `category` (una de 8: metal, transition, lanthanide, actinide, metalloid, nonmetal, halogen, noble), `gridColumn`, `gridRow` (posición visual en la tabla).
- `ElementDetail` (detalle ampliado, **opcional por elemento**): `typeLabel`, `atomicMass`, `state`, `valence`, `electronegativity`, `description`, `shells` (distribución de electrones por capa).
- `ELEMENT_DETAILS`: un `Record<number, ElementDetail>` indexado por número atómico. **Solo el sodio (Z=11) tiene el detalle completo.** Los otros 117 elementos no tienen entrada, así que `ElementDetail` se resuelve como `{}` para ellos (`detailFor` hace `ELEMENT_DETAILS[n] ?? {}`).
- `groupOf` / `periodOf`: grupo y período derivados matemáticamente de la posición en la cuadrícula (no son datos almacenados).
- `schematicShells`: distribución de electrones por capa calculada con la regla 2n² cuando no hay `shells` real — es una aproximación visual, no la configuración electrónica real (no contempla subniveles ni excepciones).
- `valencesForElement`: parsea el campo `valence` (texto tipo `"+1"` o `"+2,+3"`) en opciones individuales; devuelve lista vacía si no hay dato.

Limitaciones encontradas:

- **117 de 118 elementos no tienen descripción, masa atómica, estado, valencia ni electronegatividad.** El panel de detalle muestra el texto genérico "Información descriptiva pendiente para este elemento." (`periodic-table.component.ts:531`).
- No existe campo para usos cotidianos, usos químicos, compuestos comunes, precauciones, ni ninguna nota educativa.
- No hay indicador de metal/no metal/metaloide explícito como booleano — solo se infiere de `category` (ej. `lanthanide`/`actinide` cuentan como metal en el filtro pero no en la categoría mostrada).
- No hay campo de "estado de validación" del dato — no hay forma de distinguir un elemento con datos verificados de uno vacío salvo por la ausencia de la clave en el objeto.
- El campo `valence` es un string libre sin diferenciar "valencia común" de "estado de oxidación", y sin estructura tipada (a diferencia del catálogo de compuestos, que sí usa una lista de objetos tipados).

## 2. Objetivo educativo

La tabla periódica debe ayudar a estudiantes de secundaria a comprender:

- identidad del elemento (símbolo, nombre, número atómico);
- ubicación en la tabla (grupo, período, bloque);
- clasificación (metal, no metal, metaloide, familia);
- valencias o estados de oxidación comunes en ejercicios escolares;
- usos cotidianos y relevancia práctica;
- importancia química general;
- precauciones básicas cuando corresponda;
- relación con la formación de compuestos (que la tabla oriente, sin contradecir, al motor químico).

## 3. Campos educativos propuestos

Campos sugeridos para una futura estructura por elemento:

| Campo | Estado actual |
|---|---|
| `atomicNumber` | ya existe |
| `symbol` | ya existe |
| `name` | ya existe |
| `atomicMass` | ya existe (solo Na) |
| `category` | ya existe |
| `group` | ya existe (derivado) |
| `period` | ya existe (derivado) |
| `block` | no existe |
| `stateAtRoomTemperature` | ya existe como `state` (solo Na) |
| `electronConfiguration` (opcional) | no existe (`shells` es esquemático, no real) |
| `electronegativity` (opcional) | ya existe (solo Na) |
| `commonValences` | ya existe como string libre `valence` (solo Na) |
| `commonOxidationStates` | no existe como campo distinto de `valence` |
| `isMetal` / `isNonMetal` / `isMetalloid` | no existe explícito (inferido de `category`) |
| `family` | no existe (solo `typeLabel`, ej. "Metal alcalino", solo Na) |
| `shortDescription` | no existe |
| `educationalDescription` | ya existe como `description` (solo Na) |
| `everydayUses` | no existe |
| `chemistryUses` | no existe |
| `commonCompounds` | no existe |
| `learningTip` | no existe |
| `safetyNote` | no existe |
| `secondaryLevelNote` | no existe |
| `imageOrIcon` (opcional) | no existe |
| `sourceStatus` / `validationStatus` | no existe |

Recomendación de dónde mostrar cada campo:

- **Tarjeta principal de la cuadrícula** (espacio mínimo, ya implementado): `atomicNumber`, `symbol`, `name`.
- **Panel de detalle** (todo lo demás): categoría/familia, datos clave (masa, estado, valencias), descripción educativa, usos, compuestos comunes, nota de aprendizaje, precaución.

## 4. Campos obligatorios y opcionales

| Campo | Obligatorio | Uso en pantalla | Observación |
|---|---|---|---|
| `atomicNumber` | Obligatorio | Tarjeta + detalle | Ya existe para los 118 |
| `symbol` | Obligatorio | Tarjeta + detalle | Ya existe para los 118 |
| `name` | Obligatorio | Tarjeta + detalle | Ya existe para los 118 |
| `category` | Obligatorio | Tarjeta (color) + badge | Ya existe para los 118 |
| `group` / `period` | Obligatorio | Detalle | Derivado, ya existe |
| `stateAtRoomTemperature` | Recomendado | Detalle | Falta en 117/118 |
| `atomicMass` | Recomendado | Detalle | Falta en 117/118 |
| `commonValences` | Obligatorio para elementos usados en formación de compuestos | Detalle | Debe alinearse con `common-valences.ts`, ver sección 7 |
| `educationalDescription` | Obligatorio | Detalle | Falta en 117/118 |
| `everydayUses` | Recomendado | Detalle | No existe todavía |
| `chemistryUses` | Opcional | Detalle | No existe todavía |
| `commonCompounds` | Opcional | Detalle | No existe todavía |
| `learningTip` | Opcional | Detalle | No existe todavía |
| `safetyNote` | Opcional, obligatorio si el elemento tiene riesgo conocido (ej. elementos radiactivos, muy reactivos, tóxicos) | Detalle | No existe todavía |
| `family` / `typeLabel` | Recomendado | Detalle | Falta en 117/118 |
| `electronConfiguration` | Opcional / avanzado | Detalle | No existe dato real (solo aproximación visual) |
| `electronegativity` | Opcional | Detalle | Falta en 117/118 |
| `validationStatus` | Obligatorio (interno, no visible al estudiante) | — | No existe todavía; necesario para saber qué falta validar |

## 5. Criterios de redacción educativa

- Lenguaje claro y frases cortas, apto para secundaria.
- Evitar tecnicismos innecesarios (o explicarlos brevemente si son indispensables).
- No exagerar usos ("cura enfermedades", "indispensable para X" sin matiz).
- No decir que un elemento es "seguro" si puede tener riesgos conocidos (ej. mercurio, elementos radiactivos).
- No incluir procedimientos de manipulación ni instrucciones que puedan replicarse de forma peligrosa.
- Explicar valencias como "valencias frecuentes en ejercicios escolares" cuando corresponda, no como una lista exhaustiva de química avanzada.
- Diferenciar valencia común de estado de oxidación cuando ambos apliquen.
- No saturar con datos de nivel universitario (configuración electrónica completa, orbitales, energías de ionización detalladas, etc.).

## 6. Valencias y estados de oxidación

Representación propuesta:

```
commonValences: [1, 2]
commonOxidationStates: ["+1", "+2"]
```

Aclaraciones:

- Para secundaria conviene mostrar "valencias comunes" o "estados de oxidación frecuentes", no el listado completo de posibilidades químicas.
- Algunos elementos (ej. metales de transición) tienen muchos estados posibles; se deben priorizar los más usados en ejercicios escolares.
- Debe evitarse presentar listas enormes que confundan al estudiante.
- Cada elemento debe marcarse con su `validationStatus` para distinguir datos ya verificados de datos pendientes.

## 7. Relación con Formación de compuestos

Hallazgo importante: el módulo de Formación de compuestos (`src/app/features/compounds/data/common-valences.ts`) **ya tiene su propio catálogo de valencias** (`COMMON_VALENCES_BY_SYMBOL`), curado específicamente para el motor de compuestos, y solo usa `valencesForElement` de la tabla periódica como *fallback* si el símbolo no está en su catálogo local (línea 95 de ese archivo). Es decir, hoy la tabla periódica **no es la fuente principal** de valencias que usa el motor químico.

Para una futura implementación (sesión 18.4), la tabla periódica puede aportar:

- identificar si un elemento es metal/no metal/metaloide;
- reconocer valencias frecuentes de forma visible para el estudiante;
- orientar la formación de óxidos, hidróxidos y sales de forma consistente;
- evitar que la tabla periódica muestre una valencia distinta a la que usa `common-valences.ts` para el mismo elemento, lo cual confundiría al estudiante.

**No se modifica el motor químico en esta sesión.** Se documenta como riesgo a vigilar: si se completan `commonValences` en la tabla periódica, deben cotejarse contra `COMMON_VALENCES_BY_SYMBOL` antes de publicarse, para evitar contradicciones entre módulos.

## 8. Propuesta de visualización

Detalle de un elemento (panel lateral ya existente, se ampliaría):

- Encabezado: símbolo, nombre, número atómico (ya implementado).
- Chips: metal/no metal/metaloide, grupo, período, familia.
- Datos clave: masa, estado, valencias comunes.
- Descripción breve (`shortDescription`) y descripción educativa ampliada (`educationalDescription`).
- ¿Dónde se encuentra o para qué se usa? (`everydayUses`).
- Compuestos comunes (`commonCompounds`).
- Nota para aprender (`learningTip`).
- Precaución, si aplica (`safetyNote`).

## 9. Checklist para futura implementación (sesión 18.4)

- [ ] Definir modelo de datos (`EducationalPeriodicElement` o ampliar `ElementDetail`).
- [ ] Actualizar dataset (`elements-data.ts`) con los nuevos campos.
- [ ] Completar campos base para los elementos priorizados (no necesariamente los 118 de una vez).
- [ ] Mostrar valencias comunes en el panel de detalle.
- [ ] Mostrar descripción educativa.
- [ ] Mostrar usos cotidianos/químicos.
- [ ] Manejar de forma clara los datos no disponibles (evitar el texto genérico actual o mejorarlo).
- [ ] Mantener el diseño responsive existente.
- [ ] Validar build (`npm run build` y `npm run build:colegio`).
- [ ] Revisar que no se rompa ni contradiga el módulo de Formación de compuestos (ver sección 7).

## 10. Checklist para validación química (sesión 18.5)

- [ ] Revisar valencias frente a fuentes confiables.
- [ ] Revisar estados de oxidación frente a fuentes confiables.
- [ ] Revisar clasificaciones (metal/no metal/metaloide/familia).
- [ ] Revisar descripciones por precisión científica.
- [ ] Revisar usos por exactitud (evitar afirmaciones exageradas o dudosas).
- [ ] Revisar compuestos comunes citados.
- [ ] Revisar que no haya afirmaciones peligrosas o instrucciones de manipulación riesgosa.
- [ ] Revisar coherencia con el nivel de secundaria (sección 5).
- [ ] Revisar coherencia con el resto de ChemicalLab, en particular con `common-valences.ts` del módulo de compuestos (sección 7).

## 11. Interfaz TypeScript propuesta (no integrada en esta sesión)

```typescript
interface EducationalPeriodicElement {
  atomicNumber: number;
  symbol: string;
  name: string;
  atomicMass?: string;
  category: string;
  group?: number | string;
  period?: number;
  block?: string;
  stateAtRoomTemperature?: string;
  commonValences?: number[];
  commonOxidationStates?: string[];
  family?: string;
  shortDescription: string;
  educationalDescription: string;
  everydayUses?: string[];
  chemistryUses?: string[];
  commonCompounds?: string[];
  learningTip?: string;
  safetyNote?: string;
  validationStatus: 'validated' | 'pending' | 'needs-review';
}
```

Esta interfaz es una propuesta de diseño. No se integró al código en esta sesión.

## 12. Alcance de esta sesión

No se completaron datos de los 118 elementos, no se inventaron descripciones ni valencias, no se hizo scraping ni se copió texto largo de fuentes externas, y no se reemplazó la tabla periódica existente. Donde se detectaron elementos con datos vacíos (117 de 118), se documentó el hallazgo en la sección 1 sin rellenarlo.
