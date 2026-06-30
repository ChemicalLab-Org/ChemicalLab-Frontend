export const environment = {
  production: false,
  apiUrl: '/api',
  // Endpoint WebSocket/STOMP de la pizarra interactiva. Apunta al transporte WebSocket
  // del endpoint SockJS del backend (/ws). En desarrollo el backend corre en localhost:8080
  // y acepta el origen http://localhost:4200 (CORS). La configuración para LAN/producción
  // queda como ajuste posterior (ver environment.prod.ts).
  wsUrl: 'ws://localhost:8080/ws/websocket'
};
