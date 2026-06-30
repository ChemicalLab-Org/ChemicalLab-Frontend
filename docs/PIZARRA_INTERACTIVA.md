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
- **Editor Canvas en vivo** (`/teacher/whiteboards/:id`): lienzo HTML5 con resolución lógica
  fija (2400×1500) para coordenadas coherentes entre clientes; se muestra a escala 1:1 dentro
  de un visor que recorta un área de trabajo mayor. Soporta mouse y eventos táctiles (Pointer
  Events).
- **Herramientas**: plumón (cursor de lápiz en SVG), selector de color, grosor del trazo,
  borrador (cursor circular cuyo diámetro sigue el tamaño del borrador), tamaño del borrador,
  borrar toda la pizarra (con confirmación) y **Mover** (mano) para desplazar/pan el lienzo sin
  dibujar. El borrador se implementa como trazo del color de fondo (blanco), lo que mantiene la
  captura final con fondo limpio.
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

### Fuera de alcance (15.3 y posteriores)

Frontend del estudiante (sesiones activas, unirse, visor en vivo, historial), exportación PDF,
imágenes externas, motor químico, plantillas avanzadas y configuración detallada de despliegue
LAN.
