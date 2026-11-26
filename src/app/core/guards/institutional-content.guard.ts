import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { catchError, map, of, throwError } from 'rxjs';
import { InstitutionalContentApi } from '../../features/institutional-evaluations/content-api';

export const institutionalContentGuard: CanActivateFn = () => {
  const router = inject(Router);
  return inject(InstitutionalContentApi).capability().pipe(
    map(result => result.enabled ? router.createUrlTree(['/contenidos-institucionales']) : true),
    catchError(error => error.status === 404 ? of(true) : throwError(() => error)),
  );
};
