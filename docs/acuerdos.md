# Acuerdos y privacidad en Angular

**Documentos de uso y privacidad** abre `/acuerdos` desde el inicio de sesión. **Mis acuerdos y privacidad** abre `/mi-cuenta/acuerdos` desde los controles de sesión. La página presenta el texto antes de la decisión, el colegio o la cuenta a que corresponde y el vínculo a la versión que consta en el historial. Cada finalidad admite sus propias decisiones. El aviso permite dejar una constancia voluntaria.

El backend verifica el acceso. Angular consulta el estado al abrir rutas protegidas y vuelve al panel de acuerdos ante una condición pendiente en HTTP. Un colegio con una autorización familiar pendiente queda identificado en la cuenta. Cuando el servidor reconoce facultades de revisión, **Revisar representación y autorizaciones** muestra el historial y el formulario correspondiente.

Las cuentas de estudiante que usan los resultados individuales previos a la instalación institucional pueden abrir **Mis resultados** desde los controles de sesión. Se aplican las reglas existentes de visibilidad académica y contraseña temporal.

En una copia local, ejecuta `npm ci` y `npm run build:colegio`. Usa el iniciador de PostgreSQL desechable del backend con `-Administration -Agreements`. El recorrido de navegador requiere un conjunto ficticio recién iniciado.

```text
node tools/verify-institutional-journey.mjs <runDirectory>/browser <browser.exe> dist/chemical-lab-frontend/browser agreements
```

El recorrido verifica la lectura pública, el cambio de contraseña temporal, la navegación directa a rutas protegidas, las casillas vacías, la aceptación por cuenta y por colegio, las decisiones opcionales ficticias, el historial y el cierre de sesión. La herramienta deja las métricas y el resultado en la carpeta de prueba. La publicación de documentos definitivos y las facultades de revisión se gestionan en el backend.
