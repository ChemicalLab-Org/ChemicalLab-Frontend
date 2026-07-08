import { Component, computed, inject } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-not-found',
  standalone: true,
  imports: [],
  styleUrls: ['./not-found.component.scss'],
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
            <div class="brand__name">ChemicalLab</div>
            <div class="brand__sub">Laboratorio Digital</div>
          </div>
        </div>
      </div>

      <div class="content">
        <div class="card">
          <div class="illustration-404" aria-hidden="true">
            <span class="num">4</span>
            <svg class="flask-svg" viewBox="0 0 140 160">
              <defs>
                <linearGradient id="flask-fill-404" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stop-color="var(--color-primary-200)"/>
                  <stop offset="100%" stop-color="var(--color-primary-400)"/>
                </linearGradient>
              </defs>
              <circle cx="70" cy="85" r="60" fill="var(--color-primary-100)" fill-opacity="0.7"/>
              <path
                d="M55 25 L55 70 L28 130 Q24 144 38 144 L102 144 Q116 144 112 130 L85 70 L85 25 Z"
                fill="white"
                stroke="var(--color-primary-700)"
                stroke-width="6"
                stroke-linejoin="round"
              />
              <rect x="52" y="18" width="36" height="9" rx="3" fill="var(--color-primary-700)"/>
              <path
                d="M42 100 L98 100 L108 130 Q110 138 102 138 L38 138 Q30 138 32 130 Z"
                fill="url(#flask-fill-404)"
              />
              <circle cx="58" cy="120" r="3.5" fill="white" fill-opacity="0.65"/>
              <circle cx="78" cy="115" r="2.5" fill="white" fill-opacity="0.65"/>
              <circle cx="85" cy="128" r="2" fill="white" fill-opacity="0.55"/>
            </svg>
            <span class="num">4</span>
          </div>

          <div class="text-block">
            <h1 class="title">Página no encontrada</h1>
            <p class="desc">La ruta que intentas abrir no existe o fue movida.</p>
          </div>

          <div class="actions">
            <button type="button" class="btn-primary" (click)="goToStart()">
              Volver al inicio
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M5 12h14M12 5l7 7-7 7"/>
              </svg>
            </button>
            @if (!isAuthenticated()) {
              <button type="button" class="btn-secondary" (click)="goToLogin()">
                Ir al inicio de sesión
              </button>
            }
          </div>
        </div>
      </div>
    </div>
  `,
})
export class NotFoundComponent {
  private readonly router = inject(Router);
  private readonly authService = inject(AuthService);

  readonly isAuthenticated = computed(() => this.authService.isAuthenticated());

  goToStart(): void {
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

  goToLogin(): void {
    void this.router.navigateByUrl('/auth/login');
  }
}
