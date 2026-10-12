# T07-A — Recuperación ante límites de entradas y transporte

SEC-13 parcial, etapa 2. **T07-B y T10 permanecen pendientes.**
Base `develop`: `d5e47a0e245ac9aec94480894386a8db73ae853d`; rama
`security/t07a-limites-transporte`, worktree aislado. Se preservan la auditoría,
documentos previos, la rama `feature/validaciones-datos-institucionales` y los 16 archivos
originales e2e-selenium.

La matriz de límites, inventario, reproducciones previas, esquema completo de lienzos,
errores REST, decisiones y alcance por instancia se versionan en el
[documento backend coordinado](https://github.com/ChemicalLab-Org/ChemicalLab-Backend/blob/security/t07a-limites-transporte/docs/seguridad/02-07a-limites-entradas-transporte.md).
Las dos PRs hacia develop se enlazan entre sí para revisión conjunta. No hay merge,
despliegue, instituciones, cambios de almacenamiento o paginación en este bloque.

## Contrato y recuperación

`WhiteboardRealtimeConnection` envía `client-event-id` (igual a `clientEventId` del
evento) como header STOMP de correlación. El backend lo devuelve en la cola privada
de la conexión con `accepted:false`, `resync:true`, `code` y `error`; un rechazo no
entra en el stream de confirmaciones del topic. Solo un evento con revisión/actor del
servidor se confirma. Los headers/client IDs no otorgan autoría ni permisos.

Los componentes docente/alumno retiran únicamente la operación rechazada y consultan
GET estado con autenticación. El estado confirmado se combina con las intenciones
posteriores y los eventos recibidos durante la carga. Se conservan también arrastres de
texto/forma todavía no enviados y trazos en curso. Un error antiguo sin correlación
mantiene la recuperación genérica T03. Si el estado no se recupera, el dibujo queda
bloqueado con mensaje claro y opción de reconexión, sin debilitar permisos.

| Recurso cliente | Valor | Al exceder / terminar |
|---|---:|---|
| Operaciones pendientes | 128 por conexión | La siguiente no se envía; se retira su intención y se muestra mensaje de espera |
| Espera de confirmación | 10 s por operación | Retira esa intención y recupera estado; no reenvía una acción cuyo resultado es desconocido |
| Eventos remotos mientras se recupera | 512 por componente | Bloquea dibujo y pide reconexión, sin acumular indefinidamente ni crear bucle HTTP |
| Reintento de transporte | 4 s, contrato previo | Cierre 4429 se comunica como límite, preserva login y reintenta |
| Timers | Uno por pendiente, máximo 128 | Se cancelan al ack/rechazo/desconexión y al destruir el servicio/conexión |

Los controles cliente son de recuperación, no sustituyen los límites del servidor.
El server acota STOMP a 64 KiB, cuenta a 3 conexiones / 12 suscripciones, lienzo a
2000 objetos / 40.000 puntos y cuentas/buckets por instancia. No se afirma un límite
distribuido ni se cambia el broker local. REST mantiene 401/403 reales; 400/413/429/503
se presentan por los caminos de error existentes. Históricos fuera del esquema reciben
409 `HISTORICAL_STATE_INVALID`, sin borrado/reescritura del servidor; Angular deja
bloqueado el dibujo cuando no dispone de estado verificado.

## Verificación ejecutada

- **154 pruebas aprobadas, 0 fallos/omitidas, 11 archivos**, con `T03_LIVE_FIXTURE`
  emitida por `WhiteboardBrowserFixture` en loopback 18087. Incluye las dos pruebas
  optativas T03 con STOMP/PostgreSQL reales y 18 pruebas nuevas: rechazo correlacionado,
  confirmación separada, timeout, liberación de timers, límite local, cierre 4429,
  gestos posteriores TEXT/SHAPE/STROKE, arrastres no enviados y cola de recuperación.
- Builds **production y colegio aprobados**, con avisos previos de SCSS/budgets/polyfills.
  No se cambian dependencias ni lockfile; se reutilizan las dependencias idénticas T06.
- **Selenium / Microsoft Edge 155.0.4283.45** con dos alumnos ficticios y un docente:
  texto de fuente 401 rechazado por STOMP real con banner; el gesto válido posterior
  se conserva y se muestra en DOM; el otro alumno continúa; el docente/alumnos observan
  solo objetos aceptados; pendientes llegan a cero; recarga conserva los dos objetos
  aceptados. Eventos disparados mediante el componente real en development, con
  observación de DOM/estado/recarga. No se presenta como una campaña manual completa.
- Se inspeccionaron screenshots locales de rechazo y recuperación. URL temporal del
  arnés restaurada; scripts, logs, screenshots y credenciales ficticias permanecen locales.
- Backend coordinado: **545 pruebas aprobadas**, JAR empaquetado; ensayo acotado
  de 4 clientes, 8 SEND, 7 aceptados y 1 rechazado, 3015 ms. No certifica capacidad.

Para repetir: instalar dependencias del lock (`npm ci --legacy-peer-deps`), ejecutar
`ng test --watch=false` y builds production/colegio. Sin la fixture real, las dos pruebas
STOMP optativas se omiten; esa ejecución no equivale al resultado integrado anterior.
Preservación de originales verificada por HEAD/rama y comparación de hashes.

T07-B conserva paginación/agregados SQL, almacenamiento y retención (incluidos tombstones).
T10 conserva ensayos sostenidos, clientes lentos, saturación y dimensionamiento productivo.
