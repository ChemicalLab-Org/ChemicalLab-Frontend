import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';

@Component({
  selector: 'app-access-denied',
  standalone: true,
  imports: [],
  template: `
    <div class="denied-shell">
      <div class="denied-card">
        <div class="denied-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10" />
            <path d="M4.9 4.9l14.2 14.2" />
          </svg>
        </div>

        <div class="denied-body">
          <h1 class="denied-title">Acceso restringido</h1>
          <p class="denied-desc">No tienes permiso para ver esta página. Comunícate con tu administrador si crees que esto es un error.</p>
        </div>

        <button type="button" class="btn btn-primary" (click)="goBack()">
          Volver al inicio
        </button>
      </div>
    </div>
  `,
  styles: [`
    :host { display: block; }

    .denied-shell {
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--color-neutral-50);
      padding: 2rem;
    }

    .denied-card {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 1.5rem;
      max-width: 400px;
      width: 100%;
      text-align: center;
    }

    .denied-icon {
      width: 72px;
      height: 72px;
      border-radius: var(--radius-xl);
      background: var(--color-danger-light);
      color: var(--color-danger);
      display: grid;
      place-items: center;
    }

    .denied-title {
      margin: 0;
      font-size: 26px;
      font-weight: 800;
      letter-spacing: -0.02em;
      color: var(--color-neutral-900);
    }

    .denied-desc {
      margin: 8px 0 0;
      font-size: 15px;
      color: var(--color-neutral-600);
      line-height: 1.55;
    }

    .denied-body {
      display: flex;
      flex-direction: column;
    }
  `],
})
export class AccessDeniedComponent {
  private readonly router = inject(Router);

  goBack(): void {
    void this.router.navigateByUrl('/dashboard');
  }
}
