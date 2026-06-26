import { inject } from '@angular/core';
import { ActivatedRouteSnapshot, CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { UserRole } from '../../shared/models';

export const roleGuard: CanActivateFn = (route: ActivatedRouteSnapshot) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  const currentRole = authService.currentRole();

  if (currentRole === null) {
    router.navigate(['/auth/login']);
    return false;
  }

  const allowedRoles = route.data['roles'] as UserRole[];

  if (allowedRoles.includes(currentRole)) {
    return true;
  }

  router.navigate(['/forbidden']);
  return false;
};
