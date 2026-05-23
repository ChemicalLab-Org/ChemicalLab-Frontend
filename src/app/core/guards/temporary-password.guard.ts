import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

export const temporaryPasswordGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  if (authService.requiresPasswordChange()) {
    router.navigate(['/auth/change-password']);
    return false;
  }

  return true;
};
