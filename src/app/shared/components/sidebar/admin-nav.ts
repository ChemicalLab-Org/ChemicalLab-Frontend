import { SidebarNavItem } from './sidebar.component';

export const ADMIN_NAV_ITEMS: readonly SidebarNavItem[] = [
  { label: 'Inicio', icon: 'home', route: '/admin-dashboard' },
  { label: 'Gestión de docentes', icon: 'badge', route: '/admin/teachers' },
  { label: 'Usuarios y roles', icon: 'manage_accounts', route: '/admin/users' },
  { label: 'Supervisión académica', icon: 'school', route: '/admin/academic-supervision' },
  { label: 'Logs del sistema', icon: 'terminal', route: '/admin/logs' },
  { label: 'Métricas de uso', icon: 'insights', route: '/admin/usage-metrics' },
  { label: 'Registro de uso', icon: 'fact_check', route: '/admin/student-usage-records' },
  { label: 'Estado del sistema', icon: 'monitor_heart', route: '/admin/system-status' },
];
