import { SidebarNavItem } from './sidebar.component';

export const STUDENT_NAV_ITEMS: readonly SidebarNavItem[] = [
  { label: 'Inicio', icon: 'home', route: '/student-dashboard' },
  { label: 'Tabla periódica', icon: 'science', route: '/periodic-table' },
  { label: 'Conceptos químicos', icon: 'menu_book', route: '/concepts' },
  { label: 'Formación de compuestos', icon: 'biotech', route: '/compounds' },
  { label: 'Mis evaluaciones', icon: 'assignment', route: '/evaluations' },
  { label: 'Mis resultados', icon: 'bar_chart', route: '/evaluations/results' },
];
