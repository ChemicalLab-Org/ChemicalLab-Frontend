import { SidebarNavItem } from './sidebar.component';

/**
 * Navegación lateral del docente. Fuente única para mantener el mismo orden y
 * estado de los enlaces en todas las pantallas del rol DOCENTE.
 */
export const TEACHER_NAV_ITEMS: readonly SidebarNavItem[] = [
  { label: 'Inicio', icon: 'home', route: '/teacher-dashboard' },
  { label: 'Mis estudiantes', icon: 'group', route: '/teacher/students' },
  { label: 'Contenidos conceptuales', icon: 'library_books', route: '/teacher/concepts' },
  { label: 'Evaluaciones', icon: 'grading', route: '/teacher/evaluations' },
  { label: 'Resultados', icon: 'bar_chart', route: '/teacher/results' },
  { label: 'Formación de compuestos', icon: 'biotech', route: '/compounds' },
  { label: 'Restablecer contraseñas', icon: 'lock_reset', route: '/teacher/passwords' },
];
