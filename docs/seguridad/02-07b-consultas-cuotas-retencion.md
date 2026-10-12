# T07-B — Consultas, cuotas y retención técnica (SEC-13)

Fecha del ensayo: 2026-10-12. Etapa 2, seguridad actual. Bases de trabajo: backend `b38bff0d51495468d4577021344fb67c3c889b0a`; frontend `7b83771436c16692cc2cadf82798264a2a75cc2b`. Rama coordinada: `security/t07b-consultas-cuotas-retencion`.

## Estado y trazabilidad

Este documento actualiza la trazabilidad de SEC-13 y complementa T07-A. La auditoría externa, los documentos anteriores, la rama frontend `feature/validaciones-datos-institucionales` y sus 16 archivos `e2e-selenium` se conservan. El trabajo se realizó en checkouts aislados de develop.

| Parte de SEC-13 | Atendido en código | Pendiente operativo |
|---|---|---|
| Listados administrativos, usuarios y pizarras | Páginas SQL/proyecciones, filtro previo, desempate por ID; límites de tamaño y desplazamiento | Distribución real de datos, planes y latencias sostenidas: T10 |
| Informe de uso | Agregados SQL de todo el conjunto filtrado; detalle de un usuario; evaluaciones paginadas | Coste de agregación y ventanas recomendadas: T10 |
| Rutas relacionadas | Selectores docentes paginados; grupos/resúmenes SQL; supervisión y alias admin; materiales y línea de tiempo de intentos paginados | Revisar históricos inválidos sin borrarlos; seguimiento de crecimiento |
| Almacenamiento | Contadores PostgreSQL transaccionales, cuotas por cuenta/recurso, bytes reales, reemplazo por diferencia | Aprobar límites y ventana de instalación del esquema; validar con distribución real |
| Ownership | Consulta de identidades visibles/objetivo, cuota de identidades incluyendo tombstones | Dimensionar cuota; conservar tombstones y atender pizarras que llegan al límite |
| Retención técnica | Simulación, lote explícito, coordinación entre instancias; eliminación desactivada por defecto | Acordar alcance y plazos en su etapa; autorización operativa previa a habilitar borrado |

Los ensayos locales no certifican seguridad ni capacidad productiva. No se avanza a T08/T09/T10 ni se introduce un modelo institucional. T10 sigue pendiente, al igual que una política definitiva de privacidad y conservación.

## Inventario y consumidores

Todas las rutas siguientes llevan el prefijo `/api`. La autenticación, cuentas activas/contraseña temporal, validación de propietario y protección T02–T07-A siguen aplicándose. Ninguna página incorpora contraseñas, tokens, claves de evaluación ni archivos binarios.

| Ruta | Rol y alcance | Filtros/datos consultados | Consumidor Angular |
|---|---|---|---|
| `GET /admin/users` | ADMINISTRADOR | Rol/activo/inactivo, búsqueda nombre/usuario/código/correo/rol; columnas de cuenta/perfil | AdminUsersComponent |
| `GET /admin/users/teacher-options` | ADMINISTRADOR | Docentes activos; búsqueda; docente seleccionado priorizado; metadatos | Formulario de usuarios, búsqueda y páginas docentes |
| `GET /users/teachers` | ADMINISTRADOR | Búsqueda/estado; columnas de cuenta y perfil docente | TeacherManagementComponent |
| `GET /users/teachers/{id}/students` | DOCENTE propietario | Búsqueda, grado, sección, estado; metadatos | TeacherStudentsComponent, TeacherPasswordsComponent |
| `GET /users/teachers/{id}/students/summary` | DOCENTE propietario | Conteo total/activo y grupos distintos completos | Dashboard y selectores de conceptos/evaluaciones/pizarras |
| `GET /admin/student-usage-records` | ADMINISTRADOR | Rol/búsqueda/grado/sección/fechas/módulo/solo actividad; agregados de perfiles, eventos, logs, asignaciones, intentos y respuestas | StudentUsageRecordsComponent |
| `GET /admin/student-usage-records/{id}` | ADMINISTRADOR | Indicadores de un usuario, 20 eventos/20 incidencias recientes, página de evaluaciones | Modal del registro de uso |
| `GET /admin/academic-supervision/{concepts,evaluations,assignments}` | ADMINISTRADOR | Búsqueda, estado/categoría/grupo, con intentos; tipo/grado/sección/actividad en asignaciones | AcademicSupervisionComponent |
| `GET /admin/academic-supervision/{summary,options}` | ADMINISTRADOR | Conteos SQL generales; categorías/grupos distintos, independientes de página | Tarjetas y filtros de supervisión |
| `GET /concepts/admin`, `GET /evaluations/admin` | ADMINISTRADOR | Alias paginados de metadatos de supervisión | Sin consumidor Angular actual; se evita un listado administrativo alternativo ilimitado |
| `GET /whiteboards/teacher` | DOCENTE propietario | Pizarras propias, metadatos/conteo participantes | TeacherWhiteboardsComponent |
| `GET /whiteboards/student/{active,history}` | ESTUDIANTE, grupo autorizado | Activas/pausadas o cerradas; permiso individual/effective y metadatos | StudentWhiteboardsComponent |
| `GET /whiteboards/admin` | ADMINISTRADOR | Metadatos paginados; resumen reciente limitado a 10 en SQL | API administrativa; resumen de pizarras |
| `GET /admin/logs` | ADMINISTRADOR | Filtros anteriores, página y búsqueda limitada; desempate `createdAt,id` | Visor de auditoría |
| `GET /evaluations/teacher/attempts/{id}/traceability` | DOCENTE propietario | Conteos/herramientas del intento completo y página cronológica de eventos | TeacherEvaluationResultsComponent |
| `GET /concepts/{id}/materials` | Docente propietario, estudiante asignado, administrador | Página de materiales activos, proyección sin `fileData` | Detalles docente/estudiante con navegación |
| Detalles de conceptos | Permisos anteriores | Primera página de materiales y su total; descarga individual conserva T06 | TeacherConceptsComponent, ConceptsComponent |

No existe una exportación del registro de uso ni un exportador administrativo de estas páginas. No se añadió una descarga de toda la base como alternativa. Las descargas individuales de materiales/capturas continúan sometidas a permisos y validación T06. Los límites T07-A sobre el contenido de una entrada se mantienen. Este cambio no convierte todos los flujos académicos de autoría/corrección en un informe administrativo ni impone cuotas sobre notas, preguntas o intentos académicos.

Escrituras contabilizadas: alta/reemplazo/eliminación de material; alta y actualización de lienzo/captura de pizarra; identidades verificadas de objetos; eventos de uso; telemetría opcional de intentos. No se contabilizan solamente los datos activos: archivar una sesión o contenido conserva almacenamiento y no libera cuota.

## Contratos de consulta

Página base cero, `page=0`, `size=25` por defecto; detalle de uso solicita `size=20`. Respuesta común:

```json
{"content": [], "number": 0, "size": 25, "totalElements": 0, "totalPages": 0}
```

El registro de uso conserva `summary` y `records`, y añade `page`. El detalle conserva `summary`, `recentEvents`, `evaluations`, `incidents` y añade `evaluationsPage`. La trazabilidad conserva sus indicadores/eventos y añade `eventsPage`. Los detalles de conceptos conservan `materials` y añaden `materialsPage`: ese array corresponde a la primera página, y las siguientes se leen por la ruta de materiales.

Los endpoints que antes devolvían arrays de usuarios/pizarras/supervisión ahora devuelven páginas. Los alias `/concepts/admin` y `/evaluations/admin` devuelven **metadatos paginados de supervisión**, no cuerpos completos; los detalles por ID continúan disponibles. Backend y frontend requieren publicación coordinada; clientes externos deben adaptar el contrato. No hay merge ni despliegue en este trabajo.

`app.queries.max-page-size=100` y `app.queries.max-page=10000` son configurables; se rechazan negativos, tamaño cero, exceso y desplazamientos mayores. La búsqueda admite hasta 100 caracteres. Son límites iniciales de trabajo/respuesta, no capacidad medida. `LIMIT/OFFSET` se aplica en PostgreSQL con desempate por ID (y tipo/ID en la unión de asignaciones); conteos y datos de una página comparten transacción de lectura `REPEATABLE_READ`, normalmente con timeout de 15 segundos. Páginas entre peticiones no constituyen una instantánea congelada: altas/bajas pueden desplazar filas; con datos estáticos no hay duplicados por empates.

Los grupos de selectores se obtienen del conjunto completo, nunca de la página de estudiantes. Se devuelven como máximo 130 grupos distintos (5 grados × 26 letras); los históricos fuera del modelo requieren revisión y devuelven error, sin modificar datos. Supervisión admite 100 categorías y 130 referencias de asignación por recurso en una página; el conteo de asignaciones es SQL y conserva el total. Los filtros de grupos se resuelven en SQL sobre todas las asignaciones. Estos límites de selectores son constantes del contrato, independientes del tamaño configurable de página.

## Semántica del informe

`student-usage.sql` realiza agrupaciones, ventanas de tiempo y conteos sin materializar eventos/usuarios globales en Java. El resumen cubre **todo el conjunto filtrado**, no solamente la página. Las consultas seleccionan columnas escalares y se ejecutan con JIT desactivado localmente en esa transacción para evitar el coste de compilación observado en el ensayo; no se cambia la configuración global de PostgreSQL.

Se mantienen:

- Rol, búsqueda, grado/sección y validación de fechas; `from` inclusivo y `to` como inicio exclusivo del día siguiente, incluyendo el último microsegundo del día solicitado.
- El filtro de módulo afecta eventos de uso, no sesiones ni resultados académicos.
- Sesiones a partir de `LOGIN_SUCCESS`; incidencias WARNING/ERROR excluyen ese evento.
- Actividades asignadas: evaluaciones activas/publicadas y asignación activa, IDs distintos, grado/sección históricos comparados con recorte y sección en mayúsculas.
- Completadas: SUBMITTED/PENDING_MANUAL_REVIEW/GRADED y fecha de envío; intentos filtrados por inicio. La fecha de envío también forma parte de las marcas de actividad como en el servicio anterior.
- Exactitud: respuestas correctas/incorrectas filtradas por su propia fecha; feedback de respuesta con fecha de revisión nula se conserva, y feedback de intento no vacío cuenta por separado.
- Progreso/exactitud sin denominador son null; métricas académicas de roles no estudiantiles son null. Porcentajes por usuario y promedio global conservan redondeo a un decimal.
- Tiempo estimado: islas de actividad separadas por más de 30 minutos; se suman minutos enteros de cada isla. No es tiempo conectado medido.

Los desempates de módulo más usado y orden de filas ahora son deterministas. El antiguo empate de módulo dependía de la iteración de un mapa sin orden establecido.

Las agregaciones SQL todavía necesitan examinar los datos pertinentes: su coste no es constante. La acotación evita hidratación global, N+1 ORM y respuestas ilimitadas; el timeout y los índices limitan trabajo admisible. La distribución de datos, memoria/CPU y ventanas óptimas requieren T10. `QUERY_TIMEOUT` devuelve 503 con indicación de reducir filtros/intervalo; no cierra la sesión.

## Cuotas PostgreSQL

Los límites residen en `storage_limits`, compartidos por las instancias. Cada valor es un entero positivo modificable mediante un cambio operativo aprobado; no se expone una pantalla administrativa para alterar cuotas. `storage_usage` contiene contadores por ámbito/propietario/recurso.

| Recurso | Ámbito | Valor inicial | Fundamento |
|---|---|---:|---|
| MATERIAL_BYTES | Cuenta docente | 256 MiB | Acotación inicial del bytea acumulado, además del límite T06 por archivo |
| MATERIAL_COUNT | Cuenta docente | 1000 | Incluye enlaces y filas archivadas; evita crecimiento ilimitado de metadatos |
| SNAPSHOT_BYTES | Cuenta docente | 256 MiB | Capturas finales acumuladas, contabilizadas aparte del lienzo |
| BOARD_BYTES | Cuenta docente | 64 MiB | Suma del JSON guardado en UTF-8; adicional a T07-A por estado |
| BOARD_COUNT | Cuenta docente | 500 | Incluye sesiones cerradas |
| USAGE_COUNT | Cuenta que genera el evento | 100000 | Telemetría de navegación acumulada, además de frecuencia T07-A |
| ATTEMPT_TELEMETRY_COUNT | Cuenta estudiante | 20000 | Telemetría opcional acumulada entre intentos |
| ATTEMPT_EVENT_COUNT | Intento | 2000 | Tope adicional por intento de telemetría opcional |
| OWNERSHIP_COUNT | Pizarra | 10000 | Identidades acumuladas incluyendo tombstones; mayor que objetos visibles T07-A |

Estos números son valores iniciales configurables, **no dimensionamiento ni aforo productivo**. No se libera almacenamiento eliminando notas o resultados.

`storage_delta` reserva mediante `UPDATE ... SET used=used+delta WHERE ...`, con bloqueo de fila y comprobación dentro de PostgreSQL. La creación concurrente de un contador usa `INSERT ... ON CONFLICT DO NOTHING`; el límite se bloquea `FOR SHARE` mientras se aplica. Los triggers BEFORE INSERT/UPDATE/DELETE cubren también otras instancias y escrituras normales a esas tablas. Recurso y propietario siguen claves existentes del modelo, sin instituciones. Las funciones usan SECURITY INVOKER y necesitan permisos DML sobre contadores. Las APIs no permiten editarlos directamente. La garantía cubre escrituras ordinarias de las instancias, no a un administrador de base que modifique contadores o desactive triggers. Restringir privilegios DDL, acceso directo a la base y credenciales de despliegue, y verificar esos permisos operativos, queda pendiente.

Los bytes se miden con `octet_length(file_data)`, `octet_length(final_snapshot_data)` y `octet_length(current_state_json)`, no con tamaño declarado por el cliente. El esquema corrige solo metadata de tamaño, conservando el contenido. Un reemplazo actualiza la identidad del material y aplica la diferencia: no exige reservar primero otro archivo completo. El contador y la escritura pertenecen a la misma transacción, incluyendo rollback. Una eliminación física autorizada de material libera bytes y fila; archivar no los libera.

Los históricos que exceden un límite se contabilizan completos y se conservan. Se permite leer/paginar, eliminar material autorizado y efectuar cambios con delta cero o negativo aunque el total siga encima del límite. Un aumento se rechaza. Los cambios de propietario indirectos en perfiles, contenidos e intentos, y las transferencias de identidad/propietario de material/pizarra/eventos, están bloqueados para impedir invalidar el contador. Las APIs actuales archivan cuentas/datos académicos; este esquema no añade purga de padres ni soporta transferencias de propietario como flujo nuevo.

SQLSTATE `P7501` se traduce a HTTP 409 `STORAGE_QUOTA_EXCEEDED`, con mensaje útil que indica eliminar material autorizado, reducir reemplazos o consultar al docente. El WebSocket entrega error privado con correlación del evento, `accepted=false`/reconciliación y conserva conexión. Angular muestra el mensaje; su interceptor no elimina autenticación por un 409. Los cuatro eventos de ciclo de vida del servidor ATTEMPT_STARTED/ATTEMPT_SUBMITTED/TIME_EXPIRED/ATTEMPT_EXITED quedan fuera de la cuota opcional; el envío y resultados académicos no compiten con telemetría. Se conservan todos los eventos históricos de intentos.

## Ownership y reconciliación

Con el bloqueo de fila de pizarra T03 vigente, se consultan por tipo únicamente IDs visibles y el ID objetivo: máximo del estado T07-A más un objetivo, hasta tres consultas `IN` indexadas. Las relaciones de ownership son LAZY y el acceso a IDs no hidrata archivos de pizarra. Se conserva importación conservadora de autoría histórica, restauración propia, rechazo de apropiación ajena, revisiones, idempotencia y commit conjunto de JSON/autoría.

La cuota cuenta **todas las identidades**, incluso las borradas. Borrar un objeto o limpiar el lienzo mantiene su tombstone y no libera identidad. Al alcanzar el límite se rechazan nuevas identidades; modificar, borrar y restaurar identidades existentes no aumenta el contador. No se expiran tombstones por antigüedad ni se reutilizan identidades para conceder facultades ajenas. Un JSON histórico inválido sigue la respuesta T07-A y no se reescribe silenciosamente.

## Retención técnica

`POST /api/admin/technical-retention?cutoff=AAAA-MM-DDTHH:mm:ss&simulation=true` ejecuta **un lote**, exclusivamente como administrador. No existe scheduler. Configuración:

- `app.retention.delete-enabled=false` por defecto, incluida producción.
- `app.retention.batch-size=500`, rango permitido 1–1000.
- `app.retention.minimum-age-days=180`; plazo mínimo técnico inicial, todavía sin aprobación de conservación productiva.

La fecha debe ser anterior o igual a ahora menos el plazo mínimo. `simulation=true` es el valor predeterminado: devuelve candidatos/IDs ordenados por `occurred_at,id` sin borrar ni actualizar el estado de ejecución. La respuesta incluye simulation/coordinated/candidates/deleted/ids/cutoff, con tamaño acotado por lote. Una simulación repetida sin cambios devuelve los mismos IDs.

Un bloqueo `FOR UPDATE SKIP LOCKED` sobre la fila del esquema en `technical_retention_state` coordina instancias; quien no obtiene el bloqueo devuelve `coordinated=false`. El bloqueo se libera por commit/rollback/caída. Un lote real vuelve a comprobar fecha al borrar IDs seleccionados y actualiza resultado junto con los contadores de cuota, en una transacción con timeout. La repetición procesa el siguiente lote; después de agotar candidatos devuelve cero. La eliminación real requiere habilitación expresa de configuración: nunca se activó en una base real.

Solo se seleccionan `usage_events` anteriores al cutoff. **Se conservan** `system_logs` (auditoría/auth), notas/respuestas/revisiones/ajustes, intentos y todos sus eventos, materiales, cuentas, pizarras y ownership/tombstones. No se declara una política de privacidad ni aprobación de retención productiva.

Tras eliminar telemetría de navegación, los informes describen eventos de uso **retenidos**: módulos visitados, módulo más usado y marcas/minutos de actividad pueden disminuir. Sesiones e incidencias procedentes de auditoría y métricas académicas siguen conservadas. No se presentan indicadores de navegación antiguos como completos. Antes de habilitar lotes reales debe comunicarse el intervalo de cobertura y verificarse el impacto en informes.

## Esquema, índices e instalación

Fuente única: `src/main/resources/security/t07b-storage.sql` (versión 1). No se ejecutó en bases escolares/productivas. La inicialización T07-B depende de entityManagerFactory y verifica versión y cinco triggers de cuota/cuatro guards de propietario antes de iniciar el servidor HTTP; un trigger deshabilitado impide arrancar. `app.storage.install-schema=false` es el valor normal; activarlo en `prod` se rechaza. La instalación automática de ensayo solo acepta PostgreSQL loopback, puerto explícito y nombre `chemicallab_t01_test`, opcionalmente esquema aleatorio.

Preparación operativa pendiente, antes de una futura publicación coordinada:

1. Obtener aprobación de límites, ventana y plan de reversión/backup; identificar esquema y versión de PostgreSQL. Detener escritores de todas las instancias, incluido cualquier proceso externo.
2. Aplicar la fuente SQL **una vez y en una única transacción** (`psql --single-transaction --set ON_ERROR_STOP=1 --file ...`), con search_path verificado por el operador y credenciales fuera del comando. El archivo no incluye BEGIN porque el runner también lo envuelve en una transacción.
3. El script bloquea las tablas afectadas, crea límites/contadores/coordinación, obtiene consumos históricos reales y no los recorta, instala funciones/triggers/guards e índices, y escribe versión al final. Cualquier error revierte toda la instalación. La instalación local usa también un advisory lock por esquema para evitar dobles arranques.
4. Comparar conteos/sumas reales con `storage_usage`, revisar históricos encima del límite, confirmar triggers/guards habilitados e índices, y ensayar lectura/reducción/rechazo usando datos ficticios antes de publicar builds coordinados.
5. Mantener eliminación técnica desactivada. La aprobación de despliegue y la ejecución real del esquema no forman parte de estas PRs.

Índices nuevos: eventos por `(user_id,occurred_at,id)` y `(occurred_at,id)` para retención; logs por `(actor_user_id,created_at,id)`; intentos por `(student_id,started_at,id)`; timeline por `(attempt_id,occurred_at,id)`; respuestas por `(attempt_id,answered_at,reviewed_at)`; asignaciones activas por grado/sección normalizados/evaluación; pizarras por docente/fecha/ID y grupo/estado/fecha/ID; contenido/evaluación por propietario/fecha/ID; asignaciones por recurso/fecha/ID; materiales activos por recurso/ID; padrón por docente/nombre/ID. Se reutiliza el índice único T03 `(board_id,object_kind,object_id)` para las consultas de autoría.

No se usa CREATE INDEX CONCURRENTLY dentro de esta transacción. Tiempo de bloqueo y coste de backfill/índices con distribución real siguen pendientes; no se extrapolan de la base ficticia. El runner T07-B no modifica esquema en producción; esto no cambia por sí solo las migraciones/Hibernate heredados de etapas anteriores. Reversión operativa: preservar backup, detener escritores y revisar conjuntamente versión de aplicación/esquema. No desactivar triggers ni reinicializar contadores con escritores activos. Este trabajo no ejecuta reversión, DDL productivo ni borrados reales.

Referencias del mecanismo: [UPDATE PostgreSQL](https://www.postgresql.org/docs/current/sql-update.html), [bloqueos](https://www.postgresql.org/docs/current/explicit-locking.html), [funciones de ventana](https://www.postgresql.org/docs/current/functions-window.html).

## Reproducción y evidencia local

Entorno: Windows, Java 17, PostgreSQL 18 local desechable UTF-8, conexión 127.0.0.1 con puerto explícito; credenciales ficticias y esquemas aleatorios. Los fixtures validan el nombre/host antes de conectar. Cada suite elimina únicamente su esquema ficticio al terminar. No se versionan credenciales, tokens, logs, capturas ni dumps locales.

Baseline develop: checkout separado en `b38bff0`; se sembraron 237 estudiantes y 4740 eventos (20 por estudiante), con empates de nombre. Una búsqueda `baseline1` devolvió 111 filas, pero Hibernate registró **5226 entidades cargadas y 251 sentencias preparadas**, 958 ms en ese ensayo. También se ejecutaron los 29 tests originales de AdminService/StudentUsageRecordService. Es evidencia de cargas globales/N+1, no una campaña de rendimiento ni una comparación fiable de latencia.

La semilla y las aserciones corregidas están en `StorageQueriesDbTest`: 237 estudiantes/4740 eventos/237 logins, diez páginas de 25 (última de 12), IDs sin duplicados, 237 usuarios/237 activos/237 sesiones y 4740 eventos de módulo en **cada** resumen; 19 minutos por estudiante. Estadísticas Hibernate: cero cargas de entidades en la ruta SQL. Admin: tamaño exacto 100, rechazo 101/negativo, página vacía y empates estables. Supervisión/padrón: 31 contenidos con material y 55 estudiantes, páginas disjuntas/conteos generales; columnas escalares sin binarios. Los cuerpos SQL contienen LIMIT/OFFSET y las proyecciones de materiales excluyen fileData.

Valores académicos esperados: una actividad asignada/completada, progreso 100%, un intento pendiente de revisión, una respuesta correcta y la incorrecta del día siguiente excluida, exactitud 100%, dos feedbacks y 30 minutos. Se verifica el último microsegundo del día, filtro de módulo, roles no estudiantiles y detalle de 24 evaluaciones repartidas en 20+4.

Cuotas: bytes exactos 10/exceso 1; metadata declarada falsa se corrige; reemplazo reducido incluso encima de un límite disminuido, rollback y eliminación. UTF-8 `ñ12345` ocupa siete bytes de lienzo. Capturas/lienzo tienen presupuestos independientes. Ocho conexiones concurrentes intentaron guardar cinco bytes con cuota diez: **dos aceptadas, seis rechazadas, consumo final diez**. Se comprueban cuotas de filas, transferencias de propietario rechazadas, HTTP 409 y /auth/me 200 posterior, telemetría opcional rechazada y evento de envío académico aceptado.

Históricos: ensayo transaccional de reinstalación sobre 1001 materiales inactivos ficticios con tamaño declarado erróneo. Se conservan 1001 filas/1001 bytes, se corrige metadata a un byte por fila y se admite reducción; el ensayo se revierte completo. Autoría/STOMP: nueva identidad rechazada al alcanzar cuota, tombstone conservado, restauración ajena rechazada y propia aceptada incluso con cuota disminuida por debajo del histórico; estado/reconciliación conservados. La regresión T03 completa sigue vigente. Un trigger de cuota deshabilitado impide inicializar otra instancia antes de abrir HTTP.

Retención: cinco eventos ficticios antiguos, simulación repetida sin cambios, coordinación con una segunda instancia, lotes reales 2+2+1+0, contador disminuye cinco y auditoría permanece igual; fecha demasiado reciente rechazada y eliminación desactivada impide un lote real. Trazabilidad: 56 eventos, 55 salidas en todos los resúmenes, páginas 25+25+6, herramienta conservada y docente ajeno rechazado. Materiales: 55 referencias en 25+25+5, proyección sin entidades/bytes y permisos de propietario.

Regresiones/builds: Maven package completo pasó con 547 pruebas y cero fallos/errores usando perfil test; la ampliación final de materiales/alias pasó 154 pruebas adicionales con las suites de almacenamiento, conceptos, materiales, evaluaciones, permisos HTTP T02 y descarga T06. Los ajustes finales de inicialización/filtros pasaron otras 36 pruebas de arranque, PostgreSQL y permisos. Angular: 156 pruebas pasadas, dos pruebas opt-in omitidas; producción compila. Permanecen avisos heredados de presupuesto de bundles/SCSS y hoisting de mocks; no se cambiaron los umbrales para ocultarlos.

Flujo Edge 155.0.4283.45, servidor y cuentas ficticias: 61 usuarios, páginas disjuntas, búsqueda restablece página cero, búsqueda vacía mantiene tarjeta global 61; informe con 55 usuarios filtrados y totales independientes; docente con 56 pizarras en tres páginas, creación rechazada por cuota con mensaje visible y recarga autenticada exitosa. Un test DOM adicional navega materiales históricos y conserva total 55/metadata de descarga.

Ejemplo de ejecución reproducible, con parámetros suministrados solo para una base ficticia:

```text
mvn package -Dspring.profiles.active=test -Dspring.datasource.url=jdbc:postgresql://127.0.0.1:<PUERTO>/chemicallab_t01_test -Dspring.datasource.username=<USUARIO_FICTICIO> -Dspring.datasource.password=<CLAVE_FICTICIA>
npm test -- --watch=false
npm run build -- --configuration production
```

`StorageBrowserFixture` es opt-in, no coincide con `*Test`: prepara datos ficticios en puerto 18087, escribe el archivo local indicado por `t07b.fixture-file` y se cierra al aparecer `t07b.stop-file` (o tras 30 minutos). No ejecutarlo contra otra base. El ensayo Selenium usó el frontend de desarrollo con proxy exclusivo a ese servidor; no alteró los 16 archivos e2e originales ni la configuración versionada de entornos.

## Pendientes para revisión

Revisar ambas PRs como unidad, contratos de clientes externos y estrategia de esquema antes de aprobar una publicación posterior. Validar permisos reales de base, medición sostenida de consultas/backfill, índices/crecimiento, cuotas y alertas de operación en T10. Acordar plazos y comunicar cobertura de informes antes de habilitar retención real. No hay aprobación de privacidad ni de conservación productiva, merge, despliegue manual, rotación, migración productiva o acceso a bases escolares en este trabajo.

Contrato y fuente SQL coordinados: [backend T07-B](https://github.com/ChemicalLab-Org/ChemicalLab-Backend/blob/security/t07b-consultas-cuotas-retencion/docs/seguridad/02-07b-consultas-cuotas-retencion.md).
