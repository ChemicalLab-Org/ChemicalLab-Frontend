import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { AuthService } from '../services/auth.service';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  // El endpoint de login no lleva token y no debe disparar el manejo de 401
  if (req.url.includes('/auth/login')) {
    return next(req);
  }

  const token = localStorage.getItem('auth_token');
  const outgoing =
    token !== null
      ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } })
      : req;

  const authService = inject(AuthService);
  const router = inject(Router);

  return next(outgoing).pipe(
    catchError((error: unknown) => {
      if (error instanceof HttpErrorResponse && error.status === 401) {
        // Token expirado o inválido — limpiar sesión y redirigir al login
        authService.logout();
        void router.navigateByUrl('/auth/login');
      }
      return throwError(() => error);
    }),
  );
};
