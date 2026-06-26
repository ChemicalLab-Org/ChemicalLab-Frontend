import { SidebarNavItem } from './sidebar.component';

export const STUDENT_NAV_ITEMS: readonly SidebarNavItem[] = [
  { label: 'Inicio', icon: 'home', route: '/student-dashboard' },
  { label: 'Tabla periódica', icon: 'science', route: '/periodic-table' },
  { label: 'Conceptos químicos', icon: 'menu_book', route: '/concepts' },
  { label: 'Formación de compuestos', icon: 'biotech', route: '/compounds' },
  { label: 'Mis evaluaciones', icon: 'assignment', route: '/evaluations' },
  { label: 'Mis resultados', icon: 'bar_chart', route: '/evaluations/results' },
];

/** Acción del ítem "Salir del intento" en el menú de examen. */
export const EXAM_EXIT_ACTION = 'exam-exit';

/**
 * Menú lateral reducido que se muestra mientras hay un intento activo. Solo incluye la
 * opción de volver al intento, las herramientas de apoyo habilitadas por el docente y la
 * salida del intento. No muestra el resto de módulos del estudiante.
 */
export function examNavItems(
  allowCompounds: boolean,
  allowPeriodicTable: boolean
): SidebarNavItem[] {
  const items: SidebarNavItem[] = [
    { label: 'Volver al intento', icon: 'assignment_turned_in', route: '/evaluations' },
  ];
  if (allowCompounds) {
    items.push({ label: 'Formación de compuestos', icon: 'biotech', route: '/compounds' });
  }
  if (allowPeriodicTable) {
    items.push({ label: 'Tabla periódica', icon: 'science', route: '/periodic-table' });
  }
  items.push({ label: 'Salir del intento', icon: 'logout', route: '', action: EXAM_EXIT_ACTION });
  return items;
}
