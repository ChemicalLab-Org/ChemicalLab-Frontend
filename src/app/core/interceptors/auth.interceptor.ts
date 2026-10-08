import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { AuthService } from '../services/auth.service';
import { environment } from '../../../environments/environment';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (!req.url.startsWith(`${environment.apiUrl}/`)) return next(req);
  const path = req.url.slice(environment.apiUrl.length).split('?')[0];
  const isLogin = path === '/auth/login';
  const isSessionCheck = path === '/auth/me';
  const isLogout = path === '/auth/logout' || path === '/auth/logout-all';
  const token = auth.getToken();
  const outgoing = !isLogin && token && !req.headers.has('Authorization')
    ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : req;
  return next(outgoing).pipe(catchError((error: unknown) => {
    // Login/logout own their errors. Ignore late errors from replaced/revoked tokens.
    if (!isLogin && !isLogout && !isSessionCheck && token && token === auth.getToken()
      && error instanceof HttpErrorResponse) {
      if (error.status === 401) {
        auth.clearLocalSession();
        if (!router.url.startsWith('/auth/login')) void router.navigateByUrl('/auth/login');
      } else if (error.status === 403 && error.error?.code === 'PASSWORD_CHANGE_REQUIRED') {
        if (auth.requirePasswordChange() && !router.url.startsWith('/auth/change-password')) {
          void router.navigateByUrl('/auth/change-password');
        }
      }
    }
    return throwError(() => error);
  }));
};
