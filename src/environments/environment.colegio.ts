const wsProtocol = window.location.protocol === 'https:' ? 'wss' : 'ws';

export const environment = {
  production: true,
  apiUrl: '/api',
  wsUrl: `${wsProtocol}://${window.location.host}/ws/websocket`
};
