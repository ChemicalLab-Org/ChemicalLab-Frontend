import { HttpInterceptorFn } from '@angular/common/http';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  if (req.url.includes('/auth/login')) {
    return next(req);
  }

  const token = localStorage.getItem('auth_token');
  if (token === null) {
    return next(req);
  }

  const authenticated = req.clone({
    setHeaders: { Authorization: `Bearer ${token}` },
  });
  return next(authenticated);
};
