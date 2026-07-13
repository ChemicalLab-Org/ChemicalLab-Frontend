import {
  ApplicationConfig,
  inject,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';

import { routes } from './app.routes';
import { authInterceptor } from './core/interceptors/auth.interceptor';
import { AuthService } from './core/services/auth.service';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    provideHttpClient(withInterceptors([authInterceptor])),
    // Antes de mostrar la app se valida contra el backend la sesión que hubiera en
    // sessionStorage. Si el token expiró, el backend se reinició con otra clave, la cuenta
    // quedó inactiva o el servidor no responde, la sesión local se limpia y los guards llevan
    // al login. Si no hay sesión guardada, resuelve de inmediato. Nunca bloquea el arranque.
    provideAppInitializer(() => inject(AuthService).verifySession()),
  ],
};
