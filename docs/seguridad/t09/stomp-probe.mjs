// Opt-in regression of the resolved ESM client, only against the disposable T03 fixture.
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { Client, ActivationState } from '@stomp/stompjs';

const fixture = JSON.parse(await readFile(process.argv[2], 'utf8'));
assert.equal(fixture.origin, 'http://127.0.0.1:18087');
assert.match(fixture.teacher, /^t03fixture\d+$/);
assert.equal(fixture.password, 'FictitiousPass123');
const response = await fetch(fixture.origin + '/api/auth/login', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ usernameOrEmail: fixture.teacher, password: fixture.password })
});
assert.equal(response.status, 200);
const { token } = await response.json();
const client = new Client({
  brokerURL: fixture.origin.replace('http:', 'ws:') + '/ws/websocket',
  connectHeaders: { Authorization: 'Bearer ' + token }, reconnectDelay: 0,
  connectionTimeout: 6000, heartbeatIncoming: 10000, heartbeatOutgoing: 10000,
  debug: () => {}
});
try {
  for (let round = 0; round < 2; round++) {
    const marker = 't09-stomp-probe-' + round + '-' + Date.now();
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('STOMP connect/ACK timeout')), 10000);
      client.onStompError = () => { clearTimeout(timeout); reject(new Error('STOMP rejection')); };
      client.onWebSocketError = () => { clearTimeout(timeout); reject(new Error('WebSocket failure')); };
      client.onConnect = () => {
        client.subscribe('/user/queue/whiteboard-errors', () => {
          clearTimeout(timeout); reject(new Error('Whiteboard rejection'));
        });
        client.subscribe('/topic/whiteboards/' + fixture.boardId, message => {
          const event = JSON.parse(message.body);
          if (event.clientEventId === marker) { clearTimeout(timeout); resolve(); }
        });
        client.publish({ destination: '/app/whiteboards/' + fixture.boardId + '/draw',
          body: JSON.stringify({ eventType: 'TEXT', tool: 'TEXT', textId: marker, clientEventId: marker,
            points: [{ x: 1, y: 1 }], color: '#123456', fontSize: 24,
            runs: [{ text: 'Fictitious T09 probe', bold: false, italic: false, underline: false }] }) });
      };
      client.activate();
    });
    await client.deactivate();
    assert.equal(client.active, false);
    assert.equal(client.state, ActivationState.INACTIVE);
    console.log('PASS resolved STOMP client: connect, subscribe, SEND/ACK, deactivate; round ' + (round + 1));
  }
} finally { await client.deactivate({ force: true }); }
