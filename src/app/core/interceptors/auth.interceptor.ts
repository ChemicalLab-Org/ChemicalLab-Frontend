import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { AuthService } from '../services/auth.service';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  // El login no lleva token y no debe disparar el manejo de 401 (credenciales inválidas).
  const isLogin = req.url.includes('/auth/login');
  // La validación de sesión de arranque (/auth/me) gestiona su propio error: si respondiera
  // 401 no debe forzar una navegación aquí (el router puede no estar listo durante el bootstrap).
  const isSessionCheck = req.url.includes('/auth/me');

  const token = authService.getToken();
  const outgoing =
    !isLogin && token !== null
      ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } })
      : req;

  if (isLogin) {
    return next(outgoing);
  }

  return next(outgoing).pipe(
    catchError((error: unknown) => {
      if (
        !isSessionCheck &&
        error instanceof HttpErrorResponse &&
        error.status === 401
      ) {
        // Token expirado o inválido — limpiar sesión y redirigir al login. Se evita navegar
        // de más si ya se está en la pantalla de login (no se cierra sesión por un 403).
        authService.logout();
        if (!router.url.startsWith('/auth/login')) {
          void router.navigateByUrl('/auth/login');
        }
      }
      return throwError(() => error);
    })
  );
};
