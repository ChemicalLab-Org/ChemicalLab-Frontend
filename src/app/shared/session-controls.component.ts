import { Component, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../core/services/auth.service';

@Component({
  selector: 'app-session-controls',
  imports: [RouterLink],
  template: `
    @if (auth.isAuthenticated()) {
      <nav aria-label="Seguridad de la cuenta">
        <a routerLink="/auth/change-password">Cambiar contraseña</a>
        <button type="button" (click)="logout(false)">Cerrar sesión</button>
        <button type="button" (click)="logout(true)">Cerrar todas las sesiones</button>
      </nav>
    }
    @if (auth.sessionNotice(); as notice) {
      <p role="status">{{ notice }}</p>
    }
  `,
  styles: `
    :host { display: block; background: #f8fafc; color: #16334a; }
    nav { display: flex; flex-wrap: wrap; justify-content: center; gap: 1rem; padding: 1rem; }
    a, button { font: inherit; color: inherit; background: white; border: 1px solid #9caebc;
      border-radius: .4rem; padding: .6rem .9rem; cursor: pointer; }
    p { margin: 0; padding: 1rem; text-align: center; }
  `,
})
export class SessionControlsComponent {
  readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  logout(all: boolean): void {
    this.auth.logout(all);
    void this.router.navigateByUrl('/auth/login');
  }
}
