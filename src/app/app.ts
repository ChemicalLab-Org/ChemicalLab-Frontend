import { Component, inject, signal } from '@angular/core';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';
import { AuthService } from './core/services/auth.service';
import { UsageMetricsService } from './core/services/usage-metrics.service';
import { UsageModule } from './shared/models';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  protected readonly title = signal('chemical-lab-frontend');

  private readonly router = inject(Router);
  private readonly authService = inject(AuthService);
  private readonly usageMetrics = inject(UsageMetricsService);

  constructor() {
    // Registro centralizado del acceso a los módulos principales. Hacerlo aquí (y no en
    // cada componente) evita duplicar lógica y deja un único punto de control; el servicio
    // además descarta accesos repetidos al mismo módulo si el usuario navega rápido.
    this.router.events
      .pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd))
      .subscribe((event) => {
        if (!this.authService.isAuthenticated()) {
          return;
        }
        const module = mapUrlToModule(event.urlAfterRedirects);
        if (module !== null) {
          this.usageMetrics.trackModuleAccess(module);
        }
      });
  }
}

/**
 * Asocia la URL navegada con el módulo principal que representa, o null si no es un módulo
 * cuya métrica de acceso interese registrar. Solo se contemplan las rutas indicadas en el
 * alcance de métricas de uso.
 */
function mapUrlToModule(url: string): UsageModule | null {
  // Se ignoran query params y fragmentos para comparar solo la ruta.
  const path = url.split('?')[0].split('#')[0];

  if (path === '/student-dashboard' || path === '/teacher-dashboard' || path === '/admin-dashboard') {
    return 'DASHBOARD';
  }
  if (path === '/periodic-table') return 'PERIODIC_TABLE';
  if (path === '/compounds') return 'COMPOUNDS';
  if (path === '/concepts') return 'CONCEPTS';
  // Resultados antes que evaluaciones para no clasificar /evaluations/results como EVALUATIONS.
  if (path === '/evaluations/results' || path.startsWith('/teacher/results')) return 'RESULTS';
  if (path === '/evaluations') return 'EVALUATIONS';
  if (path === '/admin/users') return 'USERS';
  if (path === '/admin/academic-supervision' || path === '/admin/logs' || path === '/admin/usage-metrics') {
    return 'ADMIN';
  }
  if (path === '/admin/system-status') return 'SYSTEM_STATUS';

  return null;
}
