# Autenticación y sesiones T02

Este frontend requiere el backend T02 de ChemicalLab. Conserva `sessionStorage`.
Cerrar la pestaña retira el almacenamiento del navegador; no revoca la sesión del
servidor. La barra común de seguridad ofrece cambio de contraseña, logout y cierre
de todas las sesiones, también para cuentas con contraseña temporal de los tres roles.

- `PATCH /api/auth/change-temporary-password` devuelve un nuevo `token` y `tokenType`.
  Se sustituyen las credenciales locales y se cierran conexiones anteriores del cliente.
  La misma pantalla sirve para contraseña propia normal o temporal.
- `POST /api/auth/logout` revoca solo la sesión actual; `POST /api/auth/logout-all`
  revoca todas. No se envían identificadores de usuario/sesión en el cuerpo.
- Se limpia el navegador inmediatamente. Solo una respuesta satisfactoria confirma
  revocación remota; error de red/HTTP o timeout informa que no pudo confirmarse.
- Un 401 limpia localmente sin llamar de nuevo a logout. El 403 con
  `PASSWORD_CHANGE_REQUIRED` conserva el token temporal, actualiza el estado y navega
  una vez a cambio de contraseña. Otros 403 no cierran sesión. Respuestas tardías
  de tokens reemplazados no cambian la sesión nueva.

Actualizar todas las instancias del backend T02 antes del frontend, en una ventana
coordinada; exigir recarga y login nuevo. No mezclar instancias backend antiguas y
nuevas. El frontend anterior conserva un token ya revocado al cambiar contraseña;
el backend anterior no entrega reemplazo ni tiene logout remoto. Esas combinaciones
no están soportadas. No se realizó despliegue como parte de esta entrega.

Verificación local ejecutada:

```powershell
npm.cmd ci --ignore-scripts --legacy-peer-deps
npm.cmd test -- --watch=false
npm.cmd run build
```

32 pruebas aprobadas en cinco archivos, incluida la pantalla de cambio para
ADMINISTRADOR/DOCENTE/ESTUDIANTE y las acciones comunes de logout. Angular/Vitest usa
HttpTestingController y DOM jsdom; no se ejecutó Selenium ni se contactó al despliegue.
Compilación productiva aprobada con avisos de presupuestos SCSS en componentes previos;
las pruebas conservan un aviso previo sobre la inclusión TypeScript de `polyfills.ts`.
`npm ci` estándar encontró una inconsistencia previa de resolución peer; el comando
con `--legacy-peer-deps` funcionó sin modificar package.json ni package-lock.json.

Las conexiones STOMP ya abiertas en otros clientes siguen requiriendo T03 para su
revocación/cierre desde el servidor y para autorizar destinos y recursos. El cierre
global no promete detenerlas todavía. Las garantías, esquema y evidencia PostgreSQL
se documentan en `ChemicalLab-Backend/docs/seguridad/02-02-autenticacion-sesiones.md`.
