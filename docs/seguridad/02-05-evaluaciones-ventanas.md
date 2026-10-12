# T05 — Ventanas y exposición de resultados en Angular

11 de octubre de 2026, America/Lima. Para revisión; sin merge/despliegue. Base
`origin/develop`: `f613e90b4580b392fbbf9fe2cf3f7453f0704c24`, fetch verificado.
Rama `security/t05-evaluaciones-ventanas`, checkout aislado. Se conserva el checkout
`feature/validaciones-datos-institucionales`, todo su trabajo previo y `e2e-selenium/`.
La auditoría original conserva SHA-256
`1eff5d59f7a114dfee91cb557a0405c2f7247e43cd2926d2542172c0255e499b`.

El backend coordinado parte de
`ec9531b2c7ccaab86d0e9d444f83f6c9261dcb72`. Su
[nota T05](https://github.com/ChemicalLab-Org/ChemicalLab-Backend/blob/security/t05-evaluaciones-ventanas/docs/seguridad/02-05-evaluaciones-ventanas.md)
contiene el inventario completo de rutas/DTO, matriz de exposición, cierre grupal,
compatibilidad de persistencia, reproducciones SEC-11/12 y procedimiento PostgreSQL.
Las PRs se enlazan entre sí en sus descripciones.

## Contratos y estados

| Flujo | Autoridad del servidor | Presentación Angular |
|---|---|---|
| Listado | accessState, canStart, fechas, intentos usados | Programada/Disponible/Vencida/No disponible; programación con hora de Lima |
| Detalle directo | questionsVisible, questions, accessState | Antes de inicio o después de cierre no contiene preguntas/opciones; puede actualizar estado consultando detalle y listado |
| Inicio | Validación HTTP de `[startAt,dueAt)` y máximo de intentos | No decide admisión con Date.now(); un rechazo muestra mensaje y vuelve a consultar estado |
| Guardado/avance | canAnswer y plazo exclusivo | Rechazo temporal consulta intento, recupera cierre con respuestas ya guardadas y libera navegación |
| Reanudación/recarga | inProgressAttemptId y GET del intento propio | Continúa desde el ID devuelto por el servidor, incluso sin almacenamiento de ese dispositivo; `/evaluations?attempt=<id>` soporta acceso directo |
| Envío/salida | Un mismo filtro de corrección en todos los DTO | Confirmación sin inventar nota; informa que se conservaron respuestas recibidas dentro de la ventana autorizada |
| Listado/detalle de resultados | reviewAvailable/reviewLocked, gradeClosed y canViewDetailedFeedback | Revisión bloqueada/disponible, calificación pendiente; null/ausente se muestra «—», sin cero ni marca de error |

Los modelos añaden accessState/canStart, ID de intento en progreso, questionsVisible,
canAnswer, answerDeadlineAt, correctionVisible y serverNow. score/maxScore son
anulables. Las respuestas operativas propias no se presentan como corrección.
La marca roja de respuesta incorrecta exige `correct === false`; null/undefined no
se convierten en incorrecto. Tampoco generan porcentaje cero o badge de desaprobación.

## Semántica temporal y compatibilidad

startAt es inclusivo, dueAt exclusivo. Fechas opcionales; con ambas presentes el
cierre debe ser posterior. El formulario docente anuncia hora de Lima y envía el
valor ISO de datetime-local sin offset, conservando su significado académico.
No hay migración de tipos/esquema ni conversión silenciosa de fechas antiguas.

`academic-time.util.ts` interpreta LocalDateTime sin offset con `-05:00`; los
formateadores Intl especifican America/Lima. Esto evita depender de la zona del
equipo que abre la pantalla. Fechas ya provistas con offset conservan su instante.
El contador usa el answerDeadlineAt del servidor (menor de duración y dueAt),
ajustando presentación con serverNow. El reloj del navegador nunca autoriza una
operación: los endpoints vuelven a comprobar su reloj inyectable.

La API elimina la gracia de 60 segundos para incorporar respuestas. Al vencer dueAt,
archivar o desactivar, no acepta nuevos intentos ni guardar/avanzar. Agotar la
duración cierra la escritura del intento; todavía puede haber otro intento si la
asignación sigue abierta y queda un reintento autorizado por el servidor. El
propietario todavía puede finalizar mediante envío/salida o recuperación GET, con
las respuestas guardadas; un cuerpo tardío se ignora. Abiertas obligatorias faltantes
no impiden ese cierre. La corrección exige cierre de oportunidades de **todas** las
secciones y cierre de nota/GRADED; cerrar la sección A no revela respuestas mientras
B pueda responder. Esto incluye secciones futuras o vacías: agotar intentos del
padrón actual no adelanta la revisión. Sin dueAt se requiere cierre explícito de
las asignaciones o archivo. Con resultados existentes no se reabren asignaciones; con
intentos existentes no se amplían reintentos ni cambia duración/modo.

El frontend nuevo requiere el backend T05. La API añade campos compatibles con el
frontend anterior; el control de seguridad ya reside en servidor. La ruta de
evaluaciones conserva todos sus guards y se carga bajo demanda para conservar el
presupuesto de producción de 1 MB, sin aumentarlo. Continúan los avisos SCSS previos.

## Verificación y evidencia

Las reproducciones previas SEC-11/12 fallaron sobre la base backend actual antes
de modificar EvaluationService: score=3 restringido y pregunta antes de startAt.
Ahora pasan; el backend ejecutó **499 pruebas, ninguna omitida**, con PostgreSQL
18 desechable y JAR generado. La integración HTTP T05 incluye dos alumnas/secciones,
límites ±1 ns, fechas ausentes/invalidación, duración y sin gracia, abiertas/notas
parciales, nota cerrada/no cerrada, ajustes, reintentos, secuencial, recursos ajenos,
archivo/desactivación y carrera concreta guardar/enviar/archivar.

Las pruebas Angular de componentes reales con HttpTestingController comprueban:
programación sin inicio/preguntas, admisión por estado servidor aun con reloj de
navegador distinto, actualización de programación, reanudación sin almacenamiento,
URL directa sin crear otro intento, guardado/avance rechazados con recuperación,
y notas/corrección ausentes sin cero/error. Se ejecutan también las regresiones
T02–T04 y transporte STOMP real con `T03_LIVE_FIXTURE` de otra fixture desechable.
Resultado final: **129 pruebas, 0 fallos y 0 omitidas**. Build de producción
correcto, bundle inicial 943.56 kB, sin aumentar presupuestos. Los diez escenarios
HTTP backend también pasaron con JVM `-Duser.timezone=Asia/Tokyo`, conservando los
límites académicos de Lima.

Comandos desde este checkout (PowerShell):

```powershell
$env:T03_LIVE_FIXTURE = Get-Content -LiteralPath '<JSON de WhiteboardBrowserFixture>' -Raw
npm.cmd test -- --watch=false
npm.cmd run build
```

Navegador real sobre localhost: ingreso ficticio; Programada sin iniciar;
Disponible al startAt; guardado de alternativa/abierta; URL directa y recarga
conservan respuestas; cambio al dueAt rechazado, cierre recuperado y modo examen
liberado; resultado bloqueado mientras B todavía podía rendir; disponible tras
cerrar nota y vencer B. El resultado mostró la alternativa original guardada y
nota 6/20 (objetiva 0/4, abierta 3/6), acreditando que la selección tardía no se
incorporó. No hubo errores de consola en ese flujo. Capturas locales
`t05-review-locked.png` y `t05-review-available.png`; no se publican logs/tokens ni
configuraciones locales. Solo código, pruebas y documentación ficticia revisada.

## Límites

### Corrección antes del merge: padrón mutable

Sobre backend #59 HEAD `6cd9e49a58fef1a99c332dc83da98d5c3cc4f244` se reprodujeron
la sección futura vacía y el grupo disponible terminado seguido de incorporaciones:
dos pruebas de servicio y dos HTTP fallaron por corrección expuesta antes del cierre.
Se elimina la liberación anticipada; se espera al cierre definitivo de todas las
asignaciones. No se agrega cierre persistente ni cambia el modelo institucional.
Una alta, reactivación o cambio de sección posterior no puede reabrir esas ventanas.

Angular mantiene reviewLocked aunque los contadores actuales indiquen 100% de
intentos agotados o ninguna alumna. El mensaje de respaldo ahora explica el cierre
de las ventanas de todas las secciones y el cierre docente requerido sin dueAt.
El progreso se identifica como intentos de las alumnas actuales; la fecha se
presenta como cierre de ventanas, sin prometer liberación por padrón terminado.
Una nueva prueba DOM/HTTP comprueba esos estados y ausencia de nota/corrección.
La nota backend detalla los tres nuevos escenarios PostgreSQL de altas/reactivación,
cambio de sección y consultas/escrituras/recuperación antes/después del cierre.
El indicador de feedback en el resumen también exige nota cerrada/GRADED; tras
ese último ajuste backend se ejecutaron 102 pruebas de evaluaciones y package del
JAR final. La ejecución Angular final fue la habitual, después de terminar Java:
una ejecución previa abortó por un worker y otra con workers limitados falló en
el mock de T03; no se omitieron pruebas ni se alteró T02–T04 para obtener el resultado.
Se continúa etapa 2, seguridad actual, en los PR #59/#81; no se avanza a T06.

No se accedió a la base escolar ni se hicieron despliegues, migraciones productivas,
rotaciones, merge, instituciones/invitaciones/privacidad o T06. No se amplió a la
campaña T10 ni se certificó infraestructura. El transporte real de T03 se conserva;
la comprobación de navegador es el flujo descrito, no una campaña general de E2E.
La capacidad bajo carga y cualquier reconciliación de zonas de timestamps
históricos quedan para las etapas operativas acordadas. La nota backend detalla
los límites de bloqueos por evaluación y autenticación concurrente heredados de T02.
