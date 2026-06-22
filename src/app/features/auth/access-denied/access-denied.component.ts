import { Component, computed, inject } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-access-denied',
  standalone: true,
  imports: [],
  styleUrls: ['./access-denied.component.scss'],
  template: `
    <div class="shell">
      <div class="topbar">
        <div class="brand">
          <div class="brand__logo" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M9 3h6M9 3v5l-3 6h12l-3-6V3"/>
              <path d="M6 21h12"/>
              <circle cx="12" cy="17" r="0.5" fill="currentColor"/>
            </svg>
          </div>
          <div>
            <div class="brand__name">QuímicaLab</div>
            <div class="brand__sub">Laboratorio Digital</div>
          </div>
        </div>
      </div>

      <div class="content">
        <div class="card">
          <div class="icon-wrap" aria-hidden="true">
            <div class="icon-halo"></div>
            <div class="icon-circle">
              <svg viewBox="0 0 24 24" width="38" height="38" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
              </svg>
            </div>
          </div>

          <span class="error-badge">Error 403</span>

          <div class="text-block">
            <h1 class="title">Acceso denegado</h1>
            <p class="desc">No tienes permisos para acceder a esta sección.</p>
            <p class="hint">Tu cuenta no cuenta con el rol necesario para abrir esta pantalla. Si crees que esto es un error, contacta a tu docente o administrador.</p>
          </div>

          <div class="actions">
            <button type="button" class="btn-primary" (click)="goToDashboard()">
              Volver a mi panel
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M5 12h14M12 5l7 7-7 7"/>
              </svg>
            </button>
            @if (isAuthenticated()) {
              <button type="button" class="btn-secondary" (click)="logout()">
                Cerrar sesión
              </button>
            }
          </div>
        </div>
      </div>
    </div>
  `,
})
export class AccessDeniedComponent {
  private readonly router = inject(Router);
  private readonly authService = inject(AuthService);

  readonly isAuthenticated = computed(() => this.authService.isAuthenticated());

  goToDashboard(): void {
    const role = this.authService.currentRole();
    if (role === 'ADMINISTRADOR') {
      void this.router.navigateByUrl('/admin-dashboard');
    } else if (role === 'DOCENTE') {
      void this.router.navigateByUrl('/teacher-dashboard');
    } else if (role === 'ESTUDIANTE') {
      void this.router.navigateByUrl('/student-dashboard');
    } else {
      void this.router.navigateByUrl('/auth/login');
    }
  }

  logout(): void {
    this.authService.logout();
    void this.router.navigateByUrl('/auth/login');
  }
}
