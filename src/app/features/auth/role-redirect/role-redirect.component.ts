import { Component, OnInit, inject } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-role-redirect',
  standalone: true,
  template: '',
})
export class RoleRedirectComponent implements OnInit {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  ngOnInit(): void {
    const role = this.authService.currentRole();
    switch (role) {
      case 'ESTUDIANTE':
        this.router.navigate(['/student-dashboard']);
        break;
      case 'DOCENTE':
        this.router.navigate(['/teacher-dashboard']);
        break;
      case 'ADMINISTRADOR':
        this.router.navigate(['/admin-dashboard']);
        break;
      default:
        this.router.navigate(['/auth/login']);
    }
  }
}
