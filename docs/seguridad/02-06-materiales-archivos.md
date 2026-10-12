# T06 — Entrega de documentos y vista previa de imágenes

Etapa 2 / SEC-10, coordinada con backend `security/t06-materiales-archivos`,
desde develop `9b77b8ad32883e716a287385cd8ad7eb22c0fa9b`. La rama institucional
y los 16 archivos previos de e2e-selenium se conservan en su checkout original.

PDF/PPT/PPTX se descargan como documentos adjuntos: no hay iframe, embed, object
ni bypassSecurityTrustResourceUrl para estos materiales. PNG/JPEG validados y
normalizados en backend pueden verse en img y pantalla completa. Se comprueba
el MIME del Blob devuelto, incluso si previewAvailable o nombre histórico indican
otra cosa. Las capturas de ambos roles también rechazan Blobs que no sean PNG/JPEG.

Las peticiones siguen pasando por el interceptor autenticado, sin token en URL.
Content-Disposition/nosniff/CSP del API no protegen por sí solos un objectURL;
la política de visor se aplica expresamente al Blob. Los nombres de descarga se
sanean y usan la extensión correspondiente al MIME real retornado. Se revocan
URLs de preview al cerrar/cambiar/destruir; una respuesta tardía del visor cerrado
se descarta. Los documentos se descargan mediante anchor download, sin abrirlos
en una URL de navegación dentro de la aplicación.

Los errores conservan el material mostrado y permiten reintentar. Backend valida
íntegramente antes del reemplazo/cierre y revalida históricos en descarga sin
escribirlos masivamente. Una imagen histórica que figure como preview puede
rechazarse al descargar; la metadata del listado no es certificación del archivo.
Se mantiene el historial y el contrato de colaboración T03, sin rutas públicas nuevas.

La política completa de formatos, contenido activo/cifrado/objetos incrustados,
límites de CPU/memoria/expansión, históricos, matriz de permisos y pendientes
operativos está en `docs/seguridad/02-06-materiales-archivos.md` del backend.
La validación estructural no es análisis antimalware ni certificación de lectores.

Pruebas nuevas: material-delivery.spec.ts verifica PDF con preview obsoleto,
preview/fullscreen en img, MIME falso, respuesta tardía, errores, nombres y
capturas de ambos roles. La suite completa con `T03_LIVE_FIXTURE_JSON` terminó con
**136 pruebas aprobadas, 0 fallos y 0 omitidas**, en 11 archivos, incluidas las 7 nuevas
T06 y las 2 optativas de colaboración STOMP contra servidor real. Sin ese arnés las
dos optativas se omiten; aquí se ejecutaron con él.

`npm ci --legacy-peer-deps`, `npm test -- --watch=false` y los builds
`npm run build -- --configuration production` / `--configuration colegio` ejecutados.
Ambos builds aprobados, con avisos SCSS/presupuesto y polyfills existentes. npm informó
avisos del árbol previo; no se hizo una actualización automática fuera de T06.

Selenium en Microsoft Edge 155 completó el flujo real contra Angular/backend locales
y PostgreSQL desechable: docente sube PDF; un reemplazo de texto disfrazado es rechazado
y conserva el anterior; alumno descarga ese PDF sin visor documental; docente reemplaza
por PNG y alumno abre preview y pantalla completa en img con Blob. Se reutilizaron los
helpers e2e-selenium anteriores sin cambiar sus 16 archivos; el script y evidencias
del recorrido permanecen locales. Backend completó 530 pruebas y verificó PDF/PNG
desde su JAR ejecutable. No queda una comprobación funcional T06 pendiente.

No se implementan T07/T10, instituciones, invitaciones, cloud, migraciones,
merge ni despliegue. Los logs, sesiones y evidencias del navegador permanecen locales.
