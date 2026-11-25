import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { existsSync, mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { createServer, request } from 'node:http';
import { extname, join, resolve, sep } from 'node:path';
import { setTimeout as pause } from 'node:timers/promises';

const [fixtureArgument, browser, distArgument = 'dist/chemical-lab-frontend/browser'] = process.argv.slice(2);
assert(fixtureArgument && browser, 'Pass the disposable fixture directory and the Edge or Chrome executable.');
const fixture = resolve(fixtureArgument);
const dist = resolve(distArgument);
const ready = JSON.parse(readFileSync(join(fixture, 'ready.json'), 'utf8'));
const normal = ready.mode === 'runtime';
const backend = new URL(ready.origin);
assert.equal(backend.hostname, '127.0.0.1');
const profile = mkdtempSync(join(fixture, 'chromium-'));
const requests = new Map();
const steps = [];
const media = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' };
const app = createServer((req, res) => {
  const path = new URL(req.url, 'http://127.0.0.1').pathname;
  if (path.startsWith('/api/')) {
    const upstream = request({ hostname: backend.hostname, port: backend.port, path: req.url,
      method: req.method, headers: { ...req.headers, host: new URL(origin).host } }, result => {
      res.writeHead(result.statusCode, result.headers);
      result.pipe(res);
    });
    upstream.on('error', () => { res.writeHead(502); res.end(); });
    req.pipe(upstream);
    return;
  }
  let file = resolve(dist, '.' + decodeURIComponent(path));
  if (!file.startsWith(dist + sep) || !existsSync(file) || !statSync(file).isFile()) file = join(dist, 'index.html');
  res.writeHead(200, { 'Content-Type': media[extname(file)] ?? 'application/octet-stream' });
  res.end(readFileSync(file));
});
app.listen(0, '127.0.0.1');
await once(app, 'listening');
const origin = 'http://127.0.0.1:' + app.address().port;
const edge = spawn(browser, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--disable-background-networking', '--disable-component-update', '--disable-extensions',
  '--no-proxy-server', '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1',
  '--remote-debugging-address=127.0.0.1', '--remote-debugging-port=0', '--user-data-dir=' + profile, 'about:blank'],
  { windowsHide: true, stdio: 'ignore' });

async function until(probe, label, timeout = 135000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const result = await probe();
    if (result) return result;
    await pause(100);
  }
  throw new Error('Timeout: ' + label);
}

let socket;
let newestId = 0;
const commands = new Map();
function call(method, params = {}, sessionId) {
  const id = ++newestId;
  return new Promise((resolveCommand, reject) => {
    const timeout = setTimeout(() => {
      commands.delete(id);
      reject(new Error('CDP timeout: ' + method));
    }, 60000);
    commands.set(id, { resolve: resolveCommand, reject, timeout });
    socket.send(JSON.stringify({ id, method, params, sessionId }));
  });
}

function observe(message) {
  const reply = commands.get(message.id);
  if (reply) {
    commands.delete(message.id);
    clearTimeout(reply.timeout);
    if (message.error) reply.reject(new Error(message.error.message));
    else reply.resolve(message.result);
    return;
  }
  if (!message.method?.startsWith('Network.')) return;
  const p = message.params;
  const key = message.sessionId + ':' + p.requestId;
  if (message.method === 'Network.requestWillBeSent' && p.request.url.startsWith(origin + '/')) {
    requests.set(key, { path: new URL(p.request.url).pathname, method: p.request.method,
      requestBodyBytes: Buffer.byteLength(p.request.postData ?? ''), started: p.timestamp });
  }
  const entry = requests.get(key);
  if (!entry) return;
  if (message.method === 'Network.responseReceived') entry.status = p.response.status;
  if (message.method === 'Network.loadingFinished') {
    entry.receivedBytes = p.encodedDataLength;
    entry.durationMs = Math.round((p.timestamp - entry.started) * 1000);
  }
}

async function page() {
  const { browserContextId } = await call('Target.createBrowserContext');
  const { targetId } = await call('Target.createTarget', { url: 'about:blank', browserContextId });
  const { sessionId } = await call('Target.attachToTarget', { targetId, flatten: true });
  await call('Network.enable', { maxPostDataSize: 1048576 }, sessionId);
  await call('Network.setBlockedURLs', { urls: ['https://*'] }, sessionId);
  await call('Performance.enable', {}, sessionId);
  const run = async (fn, ...args) => {
    const { result, exceptionDetails } = await call('Runtime.evaluate', {
      expression: '(' + fn.toString() + ')(...' + JSON.stringify(args) + ')', returnByValue: true, awaitPromise: true,
    }, sessionId);
    if (exceptionDetails) throw new Error(exceptionDetails.exception?.description ?? exceptionDetails.text);
    return result.value;
  };
  return {
    run,
    performance: () => call('Performance.getMetrics', {}, sessionId),
    nav: path => call('Page.navigate', { url: origin + path }, sessionId),
    see: async text => {
      let retries = 0;
      await until(async () => {
        const state = await run((line, canRetry) => {
          if (document.body?.innerText?.includes(line)) return 'seen';
          if (!canRetry) return 'waiting';
          const retry = [...document.querySelectorAll('button')]
            .find(button => button.textContent.trim() === 'Reintentar' && !button.matches(':disabled'));
          if (!retry) return 'waiting';
          retry.click();
          return 'retried';
        }, text, !normal && retries < 2);
        if (state === 'retried') {
          retries++;
          record('reintento de la misma solicitud');
        }
        return state === 'seen';
      }, text);
    },
    has: text => run(line => document.body?.innerText?.includes(line), text),
    click: label => until(() => run(text => {
      const button = [...document.querySelectorAll('button')].find(element => element.textContent.trim() === text);
      if (!button || button.matches(':disabled')) return false;
      button.click();
      return true;
    }, label), label),
    clickIn: (title, label) => until(() => run((cardTitle, text) => {
      const card = [...document.querySelectorAll('article')]
        .find(item => item.querySelector('strong')?.textContent.trim() === cardTitle);
      const button = [...(card?.querySelectorAll('button') ?? [])].find(item => item.textContent.trim() === text);
      if (!button || button.matches(':disabled')) return false;
      button.click();
      return true;
    }, title, label), label + ' · ' + title),
    fill: (selector, value) => until(() => run((query, text) => {
      const element = document.querySelector(query);
      if (!element || element.matches(':disabled')) return false;
      element.value = text;
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    }, selector, value), selector),
    select: (selector, value) => until(() => run((query, match) => {
      const element = document.querySelector(query);
      const choice = element && [...element.options].find(option => option.text.trim() === match);
      if (!choice || element.disabled) return false;
      element.value = choice.value;
      element.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    }, selector, value), value),
  };
}

async function login(view, username) {
  await view.nav('/auth/login');
  await view.fill('[formcontrolname=usernameOrEmail]', username);
  await view.fill('[formcontrolname=password]', ready.password);
  assert(await view.run(() => {
    const submit = document.querySelector('button[type=submit]');
    if (!submit || submit.disabled) return false;
    submit.click();
    return true;
  }));
  await until(() => view.run(() => location.pathname.endsWith('-dashboard')), 'dashboard');
  await view.nav('/evaluaciones-institucionales');
  await view.see('Evaluaciones institucionales');
}

async function context(view, school) {
  await view.select('main > .controls select:first-of-type', 'Fictitious ' + school);
  await view.select('main > .controls label:nth-child(2) select', 'Fictitious · CHEM');
}

function localTime(date) {
  return new Date(date.valueOf() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

async function publish(view, name) {
  await view.fill('[name=newTitle]', name);
  await view.click('Crear borrador');
  await view.see('Borrador creado.');
  await view.click('Añadir pregunta abierta');
  await view.fill('app-institutional-teacher textarea[required]', '¿Qué evidencia indica una reacción química?');
  await view.fill('app-institutional-teacher textarea:not([required])', 'Criterio privado de revisión');
  await view.click('Guardar borrador');
  await view.see('Borrador guardado.');
  await view.clickIn(name, 'Publicar');
  await view.see('Revisión publicada.');
}

async function assign(view, name, due) {
  await view.clickIn(name, 'Asignar');
  await view.fill('[name=startsAt]', localTime(new Date(Date.now() - 120000)));
  await view.fill('[name=dueAt]', localTime(due));
  assert(await until(() => view.run(name => {
    const label = [...document.querySelectorAll('label[for^="enrollment-"]')]
      .find(element => element.textContent.trim() === name);
    const control = label && document.getElementById(label.htmlFor);
    if (!control || control.matches(':disabled')) return false;
    control.click();
    return true;
  }, ready.student), 'student enrollment'));
  await view.click('Confirmar asignación');
  await view.see(' creada. Evaluación ');
  return view.run(() => {
    const match = document.body.innerText.match(/Entrega (\d+) creada\. Evaluación (\d+)/);
    return { delivery: Number(match[1]), evaluation: Number(match[2]) };
  });
}

function record(step) {
  steps.push({ step, timestamp: new Date().toISOString() });
  console.log(step);
}

let error;
let browserVersion;
let browserCpuBefore;
let browserCpuAfter;
let rendererHeaps;
let runnerBefore;
try {
  const portFile = join(profile, 'DevToolsActivePort');
  const [port, endpoint] = await until(() => existsSync(portFile) && readFileSync(portFile, 'utf8').trim().split(/\r?\n/),
    'Chromium DevTools');
  socket = new WebSocket('ws://127.0.0.1:' + port + endpoint);
  await once(socket, 'open');
  socket.addEventListener('message', message => observe(JSON.parse(message.data)));
  browserVersion = (await call('Browser.getVersion')).product;
  const teacherA = await page();
  const teacherB = await page();
  const pupil = await page();
  browserCpuBefore = (await call('SystemInfo.getProcessInfo')).processInfo;
  runnerBefore = process.resourceUsage();
  record('inicio');
  await login(teacherA, ready.teacherA);
  await login(teacherB, ready.teacherB);
  await login(pupil, ready.student);
  await context(teacherA, 'A');
  await context(teacherB, 'B');
  await context(pupil, 'A');
  const run = Date.now().toString(36);
  const names = { a: 'Cambios químicos · Colegio A · ' + run, b: 'Cambios químicos · Colegio B · ' + run };
  await publish(teacherA, names.a);
  await publish(teacherB, names.b);
  record('dos revisiones creadas, editadas y publicadas');
  const due = new Date(Date.now() + (normal ? 2 : 6) * 60000);
  const a = await assign(teacherA, names.a, due);
  const b = await assign(teacherB, names.b, due);
  writeFileSync(join(fixture, 'assignments.json'), JSON.stringify({ a, b, due: due.toISOString() }));
  if (normal) {
    await pupil.click('Actualizar entregas');
    await pupil.see(names.a);
    assert.equal(await pupil.has(names.b), false);
    await context(pupil, 'B');
    record('dos entregas nativas disponibles');
  } else {
    await pupil.click('Actualizar entregas');
    assert.equal(await pupil.has(names.a), false);
    await context(pupil, 'B');
    await pupil.see('No hay entregas disponibles');
    assert.equal(await pupil.has(names.b), false);
    record('dos asignaciones pendientes excluidas');
    await until(() => existsSync(join(fixture, 'reconciled')), 'explicit F08 approvals and application', 300000);
    record('conciliación aplicada');
    await pupil.click('Actualizar entregas');
  }
  await pupil.see(names.b);
  assert.equal(await pupil.has(names.a), false);
  await context(pupil, 'A');
  await pupil.see(names.a);
  assert.equal(await pupil.has(names.b), false);
  await pupil.clickIn(names.a, 'Abrir entrega');
  await pupil.click('Iniciar intento');
  await pupil.see('en curso');
  await pupil.fill('textarea', 'La formación de un gas puede indicar una reacción.');
  await pupil.click('Guardar respuesta');
  await pupil.see('Respuesta guardada.');
  await context(pupil, 'B');
  await pupil.see(names.b);
  assert.equal(await pupil.has('La formación de un gas'), false);
  assert.equal(await pupil.has(names.a), false);
  await context(pupil, 'A');
  await pupil.clickIn(names.a, 'Abrir entrega');
  await pupil.click('Recuperar intento');
  await until(() => pupil.run(() => document.querySelector('textarea')?.value.includes('formación de un gas')),
    'persisted answer');
  await pupil.click('Enviar intento');
  await pupil.see('Intento enviado.');
  await pupil.see('Intentos disponibles: 0');
  assert.equal(await pupil.has('Iniciar intento'), false);
  await pupil.click('Consultar resultado');
  await pupil.see('La política académica todavía no permite');
  assert.equal(await pupil.has('Criterio privado'), false);
  await teacherB.click('Revisión docente');
  await teacherB.see('No hay intentos enviados');
  await teacherA.click('Revisión docente');
  await teacherA.click('Abrir revisión');
  await teacherA.see('Criterio privado de revisión');
  await teacherA.fill('[name=score]', '1');
  await teacherA.fill('[name=feedback]', 'Evidencia pertinente.');
  await teacherA.click('Guardar calificación');
  await teacherA.click('Cerrar calificación');
  await teacherA.see('Calificación cerrada.');
  await pupil.click('Consultar resultado');
  await pupil.see('La política académica todavía no permite');
  record('intento recuperado, enviado y calificado con resultado restringido');
  await pause(Math.max(0, Date.parse(localTime(due)) - Date.now()) + 1200);
  await pupil.click('Consultar resultado');
  await pupil.see('Nota: 20 / 20');
  await pupil.see('Evidencia pertinente.');
  assert.equal(await pupil.has('Criterio privado'), false);
  record('resultado publicado por política académica');
  browserCpuAfter = (await call('SystemInfo.getProcessInfo')).processInfo;
  rendererHeaps = await Promise.all([teacherA, teacherB, pupil].map(async view =>
    (await view.performance()).metrics.find(metric => metric.name === 'JSHeapUsedSize')?.value));
} catch (failure) {
  error = String(failure);
  process.exitCode = 1;
  console.error(error);
} finally {
  const rows = [...requests.values()].map(({ started, ...item }) => item);
  const runnerAfter = process.resourceUsage();
  const resources = {
    browserVersion, browserCpuBefore, browserCpuAfter, rendererHeaps,
    nodeCpuMs: runnerBefore && (runnerAfter.userCPUTime - runnerBefore.userCPUTime
      + runnerAfter.systemCPUTime - runnerBefore.systemCPUTime) / 1000,
    nodePeakRssKiB: runnerAfter.maxRSS,
  };
  writeFileSync(join(fixture, 'browser-metrics.json'), JSON.stringify({ error, steps, resources, requests: rows }, null, 2));
  if (socket?.readyState === 1) {
    socket.close();
  }
  edge.kill();
  app.closeAllConnections();
  app.close();
}
