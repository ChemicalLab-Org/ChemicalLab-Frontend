# T04 — Login, contraseñas y espera por límites

11 de octubre de 2026. Rama `security/t04-login-contrasenas`, desde develop
`49cd664884953a1829b45ab3b7be75bea91c10cf`. Lista para revisión; sin merge ni
despliegue. La rama `feature/validaciones-datos-institucionales`, sus cambios y
`e2e-selenium/` se conservan en el checkout original.

La implementación y decisiones del servidor se documentan en
[la nota T04 del backend](https://github.com/ChemicalLab-Org/ChemicalLab-Backend/blob/security/t04-login-contrasenas/docs/seguridad/02-04-login-contrasenas.md),
incluidos fuentes oficiales, almacenamiento, esquema SQL, proxies, costes,
contadores compartidos, compatibilidad y procedimiento operativo pendiente.

## Contratos

- El rechazo de login usa 401, `LOGIN_INVALID` y «Usuario o contraseña incorrectos.»
  para identidades ausentes, contraseñas incorrectas y cuentas inactivas.
- Nuevas contraseñas: 15–128 puntos de código Unicode y hasta 512 bytes UTF-8.
  Un emoji suplementario cuenta como uno; acentos combinantes son puntos distintos.
  Se permiten frases y espacios. No se recorta, normaliza ni trunca la entrada.
  Se rechazan sustitutos aislados y entradas vacías. No se exige mezcla de clases.
- El validador compartido se aplica al cambio, altas de docentes/estudiantes y
  resets existentes. El backend es la autoridad para la lista local de contraseñas
  comunes y valida todas las escrituras, bootstrap y temporales. La política nueva
  no se aplica a la contraseña actual ni al login heredado.
- El backend escribe Argon2id y verifica BCrypt heredado; puede migrar al autenticar
  sin cambiar el secreto ni revocar sesiones. Angular nunca recibe hashes.
- HTTP 429 `AUTH_RATE_LIMITED` incluye `Retry-After` y `retryAfterSeconds`.
  El cliente interpreta segundos o fecha HTTP, comunica la espera y permite
  reintentar al vencer. Login y cambio muestran cuenta atrás y deshabilitan envío;
  altas/resets muestran el mensaje. El interceptor bloquea reintentos locales en
  esas rutas durante la espera. No es una barrera de seguridad: el servidor mantiene
  los contadores compartidos aunque se recargue la página o se cambie de navegador.
- HTTP 503 `AUTH_LIMITS_UNAVAILABLE` usa el mismo manejo de espera. La caída del
  almacén no habilita intentos ilimitados. CORS expone `Retry-After`.
- 400 `CURRENT_PASSWORD_INVALID` conserva la sesión; nueva contraseña inválida y
  429 no cambian credenciales ni sesiones. Cambio correcto renueva el token y revoca
  las otras sesiones; reset revoca y exige cambio temporal. Una sesión inválida
  conserva el manejo 401. Logout y consulta de sesión siguen disponibles en espera.
  Se conservan restricciones temporales y revocación STOMP de T02/T03.

## Verificación realizada

Datos exclusivamente ficticios. Backend sobre PostgreSQL 18 nuevo y desechable en
loopback; esquemas aleatorios eliminados por las fixtures. Ningún acceso escolar.

- Backend `clean package`: **476 pruebas, 0 fallos, 0 errores, 0 omitidas**. Incluye
  uniformidad pública, muestra temporal acotada, límites atómicos entre dos contextos
  Spring/listeners/pools en una JVM, aliases, NAT, proxies falsos, 429/503, limpieza,
  Unicode, escrituras, migración concurrente y regresiones T01/T02/T03.
- Frontend `npm test -- --watch=false`: **113 pruebas aprobadas, 0 omitidas** con
  `T03_LIVE_FIXTURE` conectada al backend desechable. `auth-retry.spec.ts` cubre
  política Unicode, fechas/segundos, login/cambio/reset, cuenta atrás, rechazo de
  reintento temprano, recuperación, sesión y token renovado. Las pruebas DOM usan
  componentes reales con HTTP controlado; las de transporte conectan la fixture.
- `npm run build`: producción compilada. Permanecen avisos de presupuesto de
  bundles/SCSS y avisos del entorno de tests (`vi.hoisted`/`vi.mock`, polyfills).
- Navegador real: cuenta ficticia entra al panel, cambio muestra la política,
  logout funciona y un 429 real muestra la cuenta atrás y deshabilita el botón.
  La expiración y el cambio completo se cubren automáticamente; no se esperaron
  15 minutos en el navegador.

Para reproducir, ejecutar primero la suite backend siguiendo su nota. Iniciar su
`WhiteboardBrowserFixture` opt-in con datasource desechable y rutas temporales
`t03.fixture-file`/`t03.stop-file`. En PowerShell, desde el checkout frontend:

```powershell
$env:T03_LIVE_FIXTURE = Get-Content -LiteralPath '<ruta temporal JSON>' -Raw
npm.cmd test -- --watch=false
npm.cmd run build
```

Sin `T03_LIVE_FIXTURE`, los dos tests de transporte real se omiten. La fixture
termina al crear el archivo señal o a los 30 minutos y elimina su propio esquema.
Para navegador, proxy temporal `/api/**` a la fixture y origen localhost:4200
permitido por CORS. No se versionan JSON, tokens, logs ni configuraciones locales.

## Pendientes operativos

Revisar conjuntamente las PRs backend/frontend. Antes de un despliegue autorizado:
preparar esquema aditivo, comprobar proxy real/firewall/CORS, medir coste Argon2id y
capacidad de contadores con NAT representativo, y actualizar ambos componentes de
forma coordinada. El rollback backend debe seguir leyendo Argon2id una vez creado
el primer hash. No se valida capacidad productiva ni indistinguibilidad temporal
absoluta con la muestra local. No se incluyen instituciones, invitaciones, privacidad
ni T05; no se realizaron despliegues o rotaciones reales.
