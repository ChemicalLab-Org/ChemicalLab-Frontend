export const environment = {
  production: false,
  apiUrl: '/api',
  // Endpoint SockJS/STOMP de la pizarra interactiva. En desarrollo el backend corre en
  // localhost:8080 y acepta el origen http://localhost:4200 (CORS).
  wsUrl: 'http://localhost:8080/ws'
};
