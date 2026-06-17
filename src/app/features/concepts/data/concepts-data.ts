export interface ConceptExample {
  readonly formula: string;
  readonly name: string;
  readonly hint?: string;
}

export interface ConceptStep {
  readonly title: string;
  readonly description: string;
}

export interface ConceptContent {
  readonly id: string;
  readonly title: string;
  readonly category: string;
  readonly shortDescription: string;
  readonly formula: string;
  readonly explanation: string;
  readonly steps: readonly ConceptStep[];
  readonly examples: readonly ConceptExample[];
  readonly keyPoints: readonly string[];
  readonly relatedCompounds?: boolean;
  readonly iconName: string;
  readonly tone: {
    readonly bg: string;
    readonly fg: string;
    readonly border: string;
  };
}

export const CONCEPTS: readonly ConceptContent[] = [
  {
    id: 'oxides',
    title: 'Óxidos',
    category: 'Óxidos',
    shortDescription: 'Compuestos formados por un elemento combinado con oxígeno.',
    formula: 'E + O₂ → Óxido',
    explanation:
      'Un óxido es un compuesto que resulta de la combinación de cualquier elemento con el oxígeno. Si el elemento es un metal, el óxido se llama óxido metálico o básico; si es un no metal, se llama óxido no metálico o ácido. Los óxidos están presentes en muchas sustancias cotidianas: el óxido de calcio (cal viva), el dióxido de carbono del aire y el óxido de hierro (herrumbre).',
    steps: [
      {
        title: 'Identifica las valencias',
        description:
          'Toma la valencia positiva del elemento (E) y la valencia del oxígeno (–2).',
      },
      {
        title: 'Cruza las valencias',
        description:
          'El número de la valencia del oxígeno baja como subíndice del elemento y viceversa.',
      },
      {
        title: 'Simplifica si es posible',
        description:
          'Si ambos subíndices son divisibles entre el mismo número, redúcelos a su mínima expresión.',
      },
    ],
    examples: [
      { formula: 'Na₂O', name: 'Óxido de sodio', hint: 'Óxido metálico' },
      { formula: 'CaO', name: 'Óxido de calcio', hint: 'Cal viva' },
      { formula: 'Fe₂O₃', name: 'Óxido de hierro (III)', hint: 'Herrumbre' },
      { formula: 'P₂O₃', name: 'Trióxido de difósforo', hint: 'Óxido no metálico' },
      { formula: 'SO₃', name: 'Trióxido de azufre', hint: 'Óxido no metálico' },
    ],
    keyPoints: [
      'Los óxidos metálicos son básicos; los no metálicos son ácidos.',
      'El oxígeno siempre tiene valencia –2.',
      'Se simplifica el cociente de subíndices por el máximo común divisor.',
      'Cuando un metal tiene más de una valencia, se indica con romano (Stock) o sufijo -oso/-ico.',
    ],
    relatedCompounds: true,
    iconName: 'local_fire_department',
    tone: { bg: '#fff4ed', fg: '#c2410c', border: '#fed7aa' },
  },

  {
    id: 'hydroxides',
    title: 'Hidróxidos',
    category: 'Hidróxidos',
    shortDescription: 'Compuestos formados por un metal y el grupo hidroxilo OH⁻.',
    formula: 'Metal + OH → Hidróxido',
    explanation:
      'Los hidróxidos son compuestos formados por un metal y uno o más grupos hidroxilo (OH⁻). Son bases, también llamadas álcalis, porque en solución acuosa liberan iones OH⁻. Son muy importantes en química porque neutralizan ácidos y se usan en la industria y en productos domésticos como el soda cáustica.',
    steps: [
      {
        title: 'Identifica el metal y su valencia',
        description: 'El metal es el catión positivo; su valencia determina cuántos grupos OH⁻ necesita.',
      },
      {
        title: 'Escribe el grupo OH⁻',
        description: 'El grupo hidroxilo tiene carga –1.',
      },
      {
        title: 'Cruza las cargas',
        description:
          'La valencia del metal indica cuántos grupos OH⁻ se necesitan. Simplifica si es posible.',
      },
    ],
    examples: [
      { formula: 'NaOH', name: 'Hidróxido de sodio', hint: 'Soda cáustica' },
      { formula: 'Ca(OH)₂', name: 'Hidróxido de calcio', hint: 'Cal apagada' },
      { formula: 'Al(OH)₃', name: 'Hidróxido de aluminio', hint: 'Antiácido' },
      { formula: 'Fe(OH)₃', name: 'Hidróxido de hierro (III)', hint: 'Óxido hidratado' },
    ],
    keyPoints: [
      'El grupo OH⁻ siempre tiene carga –1.',
      'Cuando se repite el grupo OH se escribe entre paréntesis: Ca(OH)₂.',
      'Los hidróxidos son bases: en agua liberan OH⁻.',
      'Tienen sabor amargo y son resbaladizos al tacto.',
    ],
    relatedCompounds: true,
    iconName: 'opacity',
    tone: { bg: '#eff6ff', fg: '#1d4ed8', border: '#bfdbfe' },
  },

  {
    id: 'acids',
    title: 'Ácidos',
    category: 'Ácidos',
    shortDescription: 'Compuestos que en agua liberan iones H⁺.',
    formula: 'H + No metal (± O) → Ácido',
    explanation:
      'Los ácidos son compuestos que contienen hidrógeno y que, al disolverse en agua, liberan iones H⁺ (protones). Existen dos grandes familias: los hidrácidos (solo hidrógeno y un no metal, sin oxígeno) y los oxácidos (hidrógeno, un no metal y oxígeno). Los ácidos tienen sabor agrio, reaccionan con metales y neutralizan bases.',
    steps: [
      {
        title: 'Determina si es hidrácido u oxácido',
        description:
          'Si el ácido solo tiene H y un no metal, es un hidrácido. Si también tiene O, es un oxácido.',
      },
      {
        title: 'Para hidrácidos',
        description:
          'Escribe H más el símbolo del no metal. En nomenclatura tradicional: ácido + raíz + hídrico.',
      },
      {
        title: 'Para oxácidos',
        description:
          'Escribe H más el grupo oxácido (ej. SO₄). En nomenclatura: ácido + raíz + ico/oso según el número de oxidación.',
      },
    ],
    examples: [
      { formula: 'HCl', name: 'Ácido clorhídrico', hint: 'Hidrácido, en el estómago' },
      { formula: 'H₂S', name: 'Ácido sulfhídrico', hint: 'Hidrácido, olor a huevo' },
      { formula: 'H₂SO₄', name: 'Ácido sulfúrico', hint: 'Oxácido, muy corrosivo' },
      { formula: 'HNO₃', name: 'Ácido nítrico', hint: 'Oxácido, en fertilizantes' },
      { formula: 'H₃PO₄', name: 'Ácido fosfórico', hint: 'Oxácido, en refrescos' },
    ],
    keyPoints: [
      'Los hidrácidos no contienen oxígeno: HCl, H₂S.',
      'Los oxácidos contienen oxígeno: H₂SO₄, HNO₃.',
      'El hidrógeno siempre tiene valencia +1 en los ácidos.',
      'A mayor concentración de H⁺, mayor acidez (pH bajo).',
    ],
    relatedCompounds: true,
    iconName: 'water_drop',
    tone: { bg: '#f0fdf4', fg: '#15803d', border: '#bbf7d0' },
  },

  {
    id: 'salts',
    title: 'Sales binarias',
    category: 'Sales',
    shortDescription: 'Compuestos formados por un metal y un no metal.',
    formula: 'Metal + No metal → Sal binaria',
    explanation:
      'Las sales binarias son compuestos iónicos formados por un catión metálico y un anión de un no metal. Se forman al cruzar la valencia del metal (positiva) con la carga del no metal (negativa). Son muy estables y forman cristales. La sal de mesa (NaCl) es el ejemplo más conocido.',
    steps: [
      {
        title: 'Identifica el metal y su valencia',
        description: 'El metal aporta carga positiva (+).',
      },
      {
        title: 'Identifica el no metal y su carga',
        description: 'El no metal aporta carga negativa (–).',
      },
      {
        title: 'Cruza las cargas como subíndices',
        description:
          'La carga del no metal (sin signo) baja como subíndice del metal y viceversa. Simplifica por el MCD.',
      },
    ],
    examples: [
      { formula: 'NaCl', name: 'Cloruro de sodio', hint: 'Sal de mesa' },
      { formula: 'CaCl₂', name: 'Cloruro de calcio', hint: 'Deshielo de carreteras' },
      { formula: 'FeCl₃', name: 'Cloruro de hierro (III)', hint: 'Tratamiento de agua' },
      { formula: 'Al₂S₃', name: 'Sulfuro de aluminio', hint: 'Sal binaria típica' },
    ],
    keyPoints: [
      'Siempre es metal + no metal.',
      'Las cargas se cruzan como subíndices.',
      'Se simplifica por el máximo común divisor.',
      'Los aniones binarios terminan en -uro en nomenclatura tradicional.',
    ],
    relatedCompounds: true,
    iconName: 'grain',
    tone: { bg: '#f0fdf4', fg: '#166534', border: '#86efac' },
  },

  {
    id: 'oxisalts',
    title: 'Oxisales',
    category: 'Oxisales',
    shortDescription: 'Compuestos formados por un metal con un grupo oxácido (sulfato, nitrato, etc.).',
    formula: 'Metal + Grupo oxácido → Oxisal',
    explanation:
      'Las oxisales son sales que contienen un catión metálico y un anión que proviene de un oxácido (contiene oxígeno). Los grupos oxácidos más comunes son: sulfato (SO₄²⁻), nitrato (NO₃⁻), fosfato (PO₄³⁻) y carbonato (CO₃²⁻). Cuando el grupo se repite más de una vez en la fórmula, se escribe entre paréntesis.',
    steps: [
      {
        title: 'Identifica el metal y su valencia',
        description: 'El metal aporta carga positiva.',
      },
      {
        title: 'Identifica el grupo oxácido y su carga',
        description: 'El grupo oxácido tiene carga negativa (p. ej., SO₄²⁻ tiene carga –2).',
      },
      {
        title: 'Cruza las cargas',
        description:
          'Si el grupo oxácido se repite, se pone entre paréntesis: Ca(NO₃)₂. Simplifica si ambos subíndices son divisibles.',
      },
    ],
    examples: [
      { formula: 'Na₂SO₄', name: 'Sulfato de sodio', hint: 'En detergentes' },
      { formula: 'Ca(NO₃)₂', name: 'Nitrato de calcio', hint: 'Fertilizante' },
      { formula: 'Al₂(SO₄)₃', name: 'Sulfato de aluminio', hint: 'Tratamiento de agua' },
      { formula: 'FePO₄', name: 'Fosfato de hierro (III)', hint: 'Mineral en baterías' },
    ],
    keyPoints: [
      'El anión proviene de un oxácido y siempre lleva oxígeno.',
      'Si el grupo se repite, se escribe entre paréntesis: Al₂(SO₄)₃.',
      'Los aniones más comunes: SO₄²⁻, NO₃⁻, PO₄³⁻, CO₃²⁻.',
      'Se nombran: [nombre del anión + ato/ito] de [metal].',
    ],
    relatedCompounds: true,
    iconName: 'hub',
    tone: { bg: '#faf5ff', fg: '#7e22ce', border: '#e9d5ff' },
  },

  {
    id: 'nomenclature',
    title: 'Nomenclatura química',
    category: 'Nomenclatura',
    shortDescription: 'Los tres sistemas para nombrar compuestos inorgánicos.',
    formula: 'Fórmula → Nombre',
    explanation:
      'La nomenclatura química es el conjunto de reglas para nombrar los compuestos. En química inorgánica coexisten tres sistemas: el tradicional (nomenclatura clásica), el de Stock (con números romanos) y el sistemático o de sustitución (con prefijos numéricos). Cada sistema tiene sus propias reglas y todos son válidos según el contexto.',
    steps: [
      {
        title: 'Nomenclatura tradicional',
        description:
          'Usa sufijos -oso (menor valencia) e -ico (mayor valencia). Ej.: Fe₂O₃ → óxido férrico.',
      },
      {
        title: 'Nomenclatura Stock',
        description:
          'Indica la valencia del metal con número romano entre paréntesis cuando es multivalente. Ej.: Fe₂O₃ → óxido de hierro (III).',
      },
      {
        title: 'Nomenclatura sistemática',
        description:
          'Usa prefijos numéricos (mono, di, tri…) para indicar la cantidad de átomos. Ej.: Fe₂O₃ → trióxido de dihierro.',
      },
    ],
    examples: [
      { formula: 'Fe₂O₃', name: 'Óxido férrico / Óxido de hierro (III) / Trióxido de dihierro', hint: 'Los tres sistemas' },
      { formula: 'CaO', name: 'Óxido cálcico / Óxido de calcio / Monóxido de calcio', hint: 'Metal monovalente' },
      { formula: 'H₂SO₄', name: 'Ácido sulfúrico', hint: 'Oxácido' },
      { formula: 'Na₂SO₄', name: 'Sulfato de sodio / Sulfato sódico', hint: 'Oxisal' },
    ],
    keyPoints: [
      'Stock es el más usado en educación secundaria.',
      'El número romano solo aparece cuando el metal es multivalente.',
      'Sistemático usa prefijos: mono, di, tri, tetra, penta…',
      'Tradicional usa -oso (menor) e -ico (mayor valencia).',
    ],
    relatedCompounds: false,
    iconName: 'menu_book',
    tone: { bg: '#fff7ed', fg: '#c2410c', border: '#fed7aa' },
  },
];

export const CATEGORIES = [
  'Todos',
  'Óxidos',
  'Hidróxidos',
  'Ácidos',
  'Sales',
  'Oxisales',
  'Nomenclatura',
] as const;

export type ConceptCategory = (typeof CATEGORIES)[number];
