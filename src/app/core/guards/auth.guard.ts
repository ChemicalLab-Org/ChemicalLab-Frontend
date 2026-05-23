import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

export const authGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  const token = localStorage.getItem('auth_token');

  if (authService.isAuthenticated()) {
    return true;
  }

  if (token) {
    return true;
  }

  router.navigate(['/auth/login']);
  return false;
};
