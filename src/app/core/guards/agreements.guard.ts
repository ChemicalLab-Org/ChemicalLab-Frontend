import { HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { catchError, map, of } from 'rxjs';
import { AgreementsService } from '../services/agreements.service';
import { AuthService } from '../services/auth.service';

export const agreementsGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const agreements = inject(AgreementsService);
  if (!auth.hasValidSession()) return router.createUrlTree(['/auth/login']);
  if (auth.requiresPasswordChange()) return router.createUrlTree(['/auth/change-password']);
  const review = router.createUrlTree(['/mi-cuenta/acuerdos']);

  return agreements.overview().pipe(
    map((state) => state.globalBlocked ? review : true),
    // Serve the same Angular build while an earlier backend is still running.
    catchError((error: HttpErrorResponse) => of(error.status === 404 ? true : review)),
  );
};
