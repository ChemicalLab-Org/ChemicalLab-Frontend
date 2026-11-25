import { HttpClient } from '@angular/common/http';
import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { catchError, map, of, throwError } from 'rxjs';
import { boardCapabilityUrl } from '../services/whiteboard-view-context';

export const institutionalWhiteboardGuard: CanActivateFn = () => {
  const router = inject(Router);
  return inject(HttpClient).get<{ enabled: boolean }>(boardCapabilityUrl).pipe(
    map(result => result.enabled ? router.createUrlTree(['/pizarras-institucionales']) : true),
    catchError(error => error.status === 404 ? of(true) : throwError(() => error)),
  );
};
