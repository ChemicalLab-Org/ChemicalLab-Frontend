# Pizarra interactiva — Frontend

> El diseño técnico completo del módulo (alcance, roles, modelo de datos, endpoints y
> arquitectura) vive en el repositorio **ChemicalLab-Backend** (`docs/PIZARRA_INTERACTIVA.md`).
> Este documento resume únicamente lo implementado en el **frontend Angular**.

## Sesión 15.2 — Frontend docente

La sesión 15.2 implementó la **interfaz del DOCENTE** de la pizarra interactiva en vivo. Queda
pendiente para 15.3 el frontend del estudiante y su historial.

### Implementado

- **Módulo docente** "Pizarra interactiva" en el sidebar y en el panel docente.
- **Listado de sesiones** (`/teacher/whiteboards`): cards con pills de estado (Activa /
  Pausada / Finalizada), fechas, conteo de participantes y acciones (Entrar, Ver registro,
  Pausar/Reanudar). Estados de carga, error (con reintento) y vacío.
- **Crear sesión** (modal): nombre, grado (1–6), sección (una letra, normalizada a mayúscula)
  y descripción opcional. Al crear, redirige al editor de la sesión.
- **Editor Canvas en vivo** (`/teacher/whiteboards/:id`): área de trabajo (workspace) amplia
  pero limitada (3200×2000 px lógicos) que define el sistema de coordenadas compartido entre
  clientes. Se muestra a escala 1:1 dentro de un **visor** que recorta una parte; el resto se
  alcanza desplazándose. El lienzo se inicializa de forma fiable cuando entra en el DOM (effect
  sobre el `viewChild`), por lo que se ve completo y limpio, no como una zona blanca pequeña.
  Soporta mouse y eventos táctiles (Pointer Events).
- **Herramientas**: plumón (cursor de lápiz en SVG), borrador (cursor circular cuyo diámetro
  sigue el tamaño del borrador y funciona aunque la pizarra esté desplazada), **texto** con
  formato (color, tamaño, negrita, cursiva, subrayado), **Mover** (mano) para desplazar/pan el
  lienzo sin dibujar, selector de color, grosor del trazo, tamaño del borrador, borrar toda la
  pizarra (con confirmación) y **Pantalla completa**. El borrador se implementa como trazo del
  color de fondo (blanco), lo que mantiene la captura final con fondo limpio.
- **Mover / pan**: arrastrar con la herramienta mano desplaza la vista; el desplazamiento se
  limita para no perder el workspace. Las coordenadas de dibujo se calculan sobre el workspace
  real (no sobre el viewport visible), por lo que el dibujo cae en la posición correcta tras
  desplazar y la captura final conserva todo el contenido.
- **Pantalla completa**: modo CSS propio que expande el editor a toda la ventana y oculta sidebar
  y panel de participantes, sin recrear el lienzo ni desconectar el WebSocket; se sale con el
  botón o con Esc.
- **Texto** (objetos movibles): el texto son objetos con formato (color, tamaño, negrita/cursiva/
  subrayado por fragmento) que el docente puede mover y reeditar; se componen en la captura final.
  Desde la corrección de 15.3 el texto **se difunde en vivo por WebSocket** mediante los eventos
  `TEXT`/`TEXT_DELETE` (reservados al docente), de modo que el alumno lo ve sin recargar y lo
  conserva al reconstruir el estado. El docente también difunde la nueva posición al mover un texto.
- **Conexión WebSocket/STOMP** con `@stomp/stompjs`: conecta al endpoint del backend enviando
  el JWT en la cabecera `Authorization` del frame CONNECT, se suscribe a
  `/topic/whiteboards/{sessionId}` (eventos de dibujo y de control en el mismo canal, separados
  por `eventType`), publica el dibujo en `/app/whiteboards/{sessionId}/draw` y escucha los
  rechazos en la cola privada `/user/queue/whiteboard-errors`. El indicador de conexión muestra
  En vivo / Conectando / Sin conexión.
- **Deduplicación**: cada evento propio lleva un `clientEventId`; el eco que regresa por el
  canal no se vuelve a pintar.
- **Pausar / reanudar**: por REST; mientras está pausada se bloquea el dibujo (overlay) y se
  reacciona también a los eventos de control `SESSION_PAUSED` / `SESSION_RESUMED`.
- **Finalizar** (con confirmación): genera la captura final del canvas (PNG) y la envía al
  endpoint de cierre (multipart); la sesión pasa a `CLOSED`, se desconecta el WebSocket y se
  muestra el registro/historial. No se permite reabrir ni editar una sesión cerrada.
- **Interacción de estudiantes**: control global (activar/desactivar para todos) y control
  individual por alumno (`FOLLOW_GLOBAL` / `ALLOWED` / `BLOCKED`), mostrando el permiso como
  "Permitido", "Bloqueado" o "Según regla global".
- **Historial de sesión cerrada**: metadata (nombre, grado/sección, docente, fechas, estado) y
  captura final, en modo solo lectura.

### Archivos principales

- Modelos: `src/app/shared/models/whiteboard.models.ts`.
- Servicio REST: `src/app/core/services/teacher-whiteboard.service.ts`.
- Servicio WebSocket/STOMP: `src/app/core/services/teacher-whiteboard-realtime.service.ts`.
- Componentes: `src/app/features/teacher/whiteboards/teacher-whiteboards.component.ts` (listado +
  creación) y `teacher-whiteboard-editor.component.ts` (editor en vivo / historial).
- Rutas (carga diferida) en `src/app/app.routes.ts`; ítem de navegación en
  `src/app/shared/components/sidebar/teacher-nav.ts`.

### Configuración

El endpoint WebSocket se toma de `environment.wsUrl` (apunta al transporte WebSocket del
endpoint SockJS `/ws` del backend). En desarrollo: `ws://localhost:8080/ws/websocket`. La URL
para LAN/producción se ajusta junto con `apiUrl` (ver `src/environments/environment.prod.ts`).

## Frontend del estudiante (sesión 15.3)

La sesión 15.3 implementa la experiencia del **estudiante**, conectando el flujo en vivo ya
existente del docente con el rol alumno. No se modificó el backend ni el editor docente.

- **Módulo «Pizarra interactiva»** en el panel del estudiante (sidebar y dashboard), ruta
  `/student/whiteboards`.
- **Listado con dos pestañas**:
  - *Sesiones en vivo*: sesiones `ACTIVE`/`PAUSED` del grado/sección del estudiante, con pills de
    estado (Activa/Pausada), «En vivo», y «Puedes interactuar» / «Solo lectura». Botón Unirse/Continuar.
  - *Historial*: sesiones `CLOSED` del grado/sección, con indicador de captura disponible y botón
    «Ver registro».
  - Estados de carga, error (con reintentar) y vacíos propios para cada pestaña.
- **Unirse a una sesión** (`POST /api/whiteboards/student/{id}/join`) y carga del detalle
  (`GET /api/whiteboards/student/{id}`), que devuelve `joined` y el permiso efectivo `canInteract`.
- **Visor en vivo**: renderiza en tiempo real los trazos del docente (y de otros alumnos
  permitidos) sobre el mismo workspace lógico (3200×2000) que el editor docente, para que las
  coordenadas coincidan. Indicadores de estado de la sesión, de conexión (Conectado / Reconectando
  / Desconectado) y de permiso (Solo visualización / Puedes interactuar / Sesión pausada).
- **Interacción según permiso**: el estudiante solo ve las herramientas (plumón, color, grosor,
  borrador) cuando la sesión está `ACTIVE` y tiene permiso efectivo. «Borrar todo» queda reservado
  al docente (el backend rechaza `CLEAR` de un estudiante). Reacciona en vivo a:
  - `INTERACTION_UPDATED` / `PARTICIPANT_PERMISSION_UPDATED`: vuelve a pedir el detalle para
    recalcular `canInteract` (sin recargar la pantalla); si pierde el permiso, vuelve a «Mover».
  - `SESSION_PAUSED` / `SESSION_RESUMED`: bloquea/restablece el dibujo y avisa.
  - `SESSION_CLOSED`: desconecta el WebSocket, bloquea el dibujo y ofrece ir al historial o ver la
    captura final.
- **Conexión WebSocket/STOMP** propia del estudiante (`StudentWhiteboardRealtimeService`, análoga a
  la del docente para no acoplar ni romper el editor): mismo transporte (`environment.wsUrl`), JWT
  en el CONNECT, suscripción a `/topic/whiteboards/{sessionId}` (dibujo + control separados por
  `eventType`) y a `/user/queue/whiteboard-errors`; publica dibujo en
  `/app/whiteboards/{sessionId}/draw` y presencia en `/app/whiteboards/{sessionId}/presence`.
  Deduplicación del eco propio por `clientEventId`. La suscripción y la conexión se limpian al salir
  de la pantalla (`ngOnDestroy`); stompjs reintenta solo si el socket cae (estado «Reconectando»).
- **Historial y captura final**: pantalla de registro de sesión cerrada con metadata (nombre,
  docente, grado/sección, estado, fecha de cierre, descripción) y la captura final en un contenedor
  amplio, con botón **Descargar**. La captura se consume como `Blob` (object URL), que se **revoca**
  al destruir el componente para evitar fugas de memoria. Solo lectura: no permite editar, unirse,
  dibujar ni reabrir.

### Estado actual al unirse tarde o recargar (corrección 15.3)

La carencia original —el alumno que entraba tarde o recargaba veía la pizarra en blanco— se resolvió
con un **estado actual del lienzo** para sesiones en vivo (no solo la imagen final):

- El backend guarda un `current_state_json` por sesión (`PUT /api/whiteboards/teacher/{id}/state`),
  que el **frontend docente** mantiene de forma **debounced** (~1 s) con una instantánea serializada
  de **trazos + textos**. Tope de tamaño ~2 MB; el contenido no se registra en los logs de auditoría.
- Al **entrar o recargar**, el editor docente y el visor estudiante consultan el estado
  (`GET .../state`) y lo **reproducen** (pintan los trazos y muestran los textos) antes de seguir con
  los eventos en vivo. Así ni el alumno ni el docente pierden la pizarra al recargar.
- El docente acumula tanto sus trazos como los de los alumnos para que el estado y la captura final
  los conserven. La **imagen final** se mantiene aparte para las sesiones cerradas (historial).

### Correcciones de integración docente↔estudiante (15.3)

- **Participantes en vivo:** al unirse un estudiante, el backend difunde el evento de control
  `PARTICIPANT_JOINED` y el editor docente **refresca el panel de participantes** sin recargar (el
  botón Actualizar y la recarga del detalle también lo listan).
- **Texto en vivo (docente y estudiante):** el texto se difunde por `TEXT`/`TEXT_DELETE`. El
  docente lo crea/mueve/edita con formato; **el estudiante con permiso** también puede insertar
  texto en versión básica (contenido + color + tamaño) con la herramienta Texto, y el backend lo
  acepta con la misma regla de permiso efectivo que un trazo (`CLEAR` sigue reservado al docente).
  Cada cliente renderiza el texto entrante como overlay; el docente ve el texto de los alumnos y
  todo se conserva al reconstruir el estado.
- **Permisos:** ante `INTERACTION_UPDATED`/`PARTICIPANT_PERMISSION_UPDATED` el alumno vuelve a pedir
  el detalle y recalcula `canInteract`; si el join falla en una sesión en vivo, el error se
  **reporta** (ya no se degrada en silencio a solo lectura), evitando que el alumno quede sin
  participante y sin poder dibujar pese a tener permiso. La herramienta Texto del alumno aparece
  solo con permiso, junto a plumón, borrador y mover.
- **Pantalla completa (docente y estudiante):** un **único botón en la barra de herramientas**
  alterna entrar/salir (el ícono cambia `fullscreen`↔`fullscreen_exit`); también sale con Escape. Se
  eliminó el botón verde flotante. No recrea el lienzo ni desconecta el WebSocket, y no habilita
  herramientas sin permiso. En pantalla completa el lienzo se estira a lo ancho de forma consistente
  en docente y estudiante, mostrando con claridad el límite derecho de la pizarra.
- **Rutas inexistentes → 404:** el `GlobalExceptionHandler` del backend mapea las rutas sin handler
  (`NoResourceFoundException`/`NoHandlerFoundException` de Spring Boot 4) a **404** en vez de un 500
  engañoso, de modo que llamar a `/state` contra un backend donde aún no está desplegado responde
  404 claro (no 500).

### Pendiente para 15.4 (no incluido aquí)

Visualización del participante activo / cursores con nombre de quien dibuja (estilo pizarra
colaborativa moderna): queda como mejora futura, fuera del alcance de esta corrección.

### Archivos del estudiante

- Modelos (DTOs estudiante añadidos): `src/app/shared/models/whiteboard.models.ts`
  (`WhiteboardStudentSessionResponse`, `WhiteboardHistoryItemResponse`).
- Servicio REST: `src/app/core/services/student-whiteboard.service.ts`.
- Servicio WebSocket/STOMP: `src/app/core/services/student-whiteboard-realtime.service.ts`.
- Componentes (carga diferida): `src/app/features/student/whiteboards/student-whiteboards.component.ts`
  (listado), `student-whiteboard-viewer.component.ts` (visor en vivo) y
  `student-whiteboard-record.component.ts` (registro / captura final).
- Rutas en `src/app/app.routes.ts`; ítem de navegación en
  `src/app/shared/components/sidebar/student-nav.ts` y card en el dashboard del estudiante.

### Fuera de alcance (15.4 y posteriores)

Visualización del participante activo / cursores con nombre, chat o comentarios, exportación PDF,
imágenes externas, motor químico dentro de la pizarra, plantillas avanzadas, edición de sesiones
cerradas y configuración detallada de despliegue LAN.
