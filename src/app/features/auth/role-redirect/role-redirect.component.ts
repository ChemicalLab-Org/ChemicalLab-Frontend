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
    if (this.authService.requiresPasswordChange()) {
      void this.router.navigateByUrl('/auth/change-password');
      return;
    }
    if (role === 'INSTITUCIONAL' || (role === 'ADMINISTRADOR' && this.authService.currentUser()?.institutionalInstallation)) {
      void this.router.navigateByUrl('/administracion-institucional');
      return;
    }
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
