import assert from 'node:assert/strict';
import { setTimeout as pause } from 'node:timers/promises';

export async function boardBrowserJourney({ teacherA, teacherB, pupil, context, record, until, requests,
  frames, liveSockets, truncateConnections }) {
  const tokenFetch = (view, path) => view.run(async url => {
    const response = await fetch(url, { headers: { Authorization: 'Bearer ' + sessionStorage.getItem('auth_token') } });
    if (!response.ok) throw new Error(response.status + ' · ' + url);
    return url.endsWith('/snapshot') ? (await response.blob()).size : response.json();
  }, path);

  async function create(view, school, name) {
    await context(view, school);
    await view.click('Crear pizarra');
    await view.fill('[name=title]', name);
    await view.click('Crear y abrir');
    await view.see('Conectado');
    const ids = await view.run(() => [...document.querySelectorAll('main > .controls select')].slice(0, 2)
      .map(select => select.value));
    const path = `/api/institutions/${ids[0]}/classes/${ids[1]}/whiteboards/v1`;
    const list = await tokenFetch(view, path + '/teacher');
    const board = list.content.find(candidate => candidate.name === name);
    assert(board);
    return { path, id: board.id };
  }

  const show = (view, label) => view.press(`button[aria-label="${label}"]`);
  const shapes = view => view.run(() => document.querySelectorAll('.shape-layer g').length);
  const state = (view, board) => tokenFetch(view, `${board.path}/teacher/${board.id}/state`);
  const captureCounts = rows => ({
    requests: rows.length,
    bytes: rows.reduce((sum, row) => sum + (row.receivedBytes ?? 0), 0),
  });
  const aTitle = 'Colaboración ficticia A ' + Date.now().toString(36);
  const bTitle = 'Colaboración ficticia B ' + Date.now().toString(36);
  const a = await create(teacherA, 'A', aTitle);
  const b = await create(teacherB, 'B', bTitle);
  await context(pupil, 'A');
  await pupil.see(aTitle);
  assert.equal(await pupil.has(bTitle), false);
  const beforeJoin = requests().length;
  await pupil.click(aTitle);
  await pupil.see('Conectado');
  await pupil.see('Modo visualización.');
  await teacherA.see('Estudiante Compartido');
  await until(() => liveSockets(pupil) === 1, 'SockJS/WebSocket abierto');
  await until(() => requests().slice(beforeJoin).some(row => row.path.endsWith('/state') && row.receivedBytes), 'estado inicial');
  assert.equal(requests().slice(beforeJoin).filter(row => row.path === `${a.path}/student/${a.id}/state`).length, 1);
  record('la entrada habitual de Angular activa el selector y una sola recuperación inicial del estado');

  await show(teacherA, 'Rectángulo');
  await teacherA.stroke();
  await until(async () => (await shapes(pupil)) === 1, 'figura del docente visible en el alumno');
  await teacherA.press('.global-toggle input');
  await show(pupil, 'Rectángulo');
  await pupil.stroke(34);
  await until(async () => (await shapes(teacherA)) === 2, 'segunda figura del alumno visible en el docente');
  const before = await state(teacherA, a);
  assert.equal(before.revision, 2);
  assert.equal(new Set(JSON.parse(before.stateJson).shapes.map(shape => shape.ownerUserId)).size, 2);
  record('dos figuras colaborativas reales entregadas por STOMP y con distintas autorías');

  await teacherA.select('.participant__select', 'Bloquear');
  await pupil.see('Modo visualización.');
  await teacherA.select('.participant__select', 'Permitir');
  await show(pupil, 'Rectángulo');
  const release = await pupil.stroke(60, false);
  await context(pupil, 'B');
  await pupil.see(bTitle);
  assert.equal(await pupil.has(aTitle), false);
  await until(() => liveSockets(pupil) === 0, 'socket del colegio anterior cerrado');
  const idleHttp = requests().length;
  const idleFrames = frames.length;
  await pause(2500);
  const idle = {
    boardRequests: requests().slice(idleHttp).filter(row => row.path.endsWith('/info') || row.path.includes('/whiteboards/v1/')).length,
    pupilFrames: frames.slice(idleFrames).filter(row => row.view === pupil.sessionId).length,
  };
  assert.deepEqual(idle, { boardRequests: 0, pupilFrames: 0 });
  await pupil.click(bTitle);
  await pupil.see('Conectado');
  await release();
  assert.equal((await state(teacherB, b)).revision, 0);
  assert.equal((await state(teacherA, a)).revision, 2);
  record('el selector cierra la conexión anterior y un gesto abierto no se publica en A ni B');

  await context(pupil, 'A');
  await pupil.click(aTitle);
  await pupil.see('Conectado');
  await until(async () => (await shapes(pupil)) === 2, 'recuperación al volver a A');
  await pupil.select('main > .controls label:nth-child(2) select', 'Fictitious · PHYS');
  await pupil.see('No hay pizarras disponibles en esta vista.');
  await until(() => liveSockets(pupil) === 0, 'cierre al cambiar de clase dentro de A');
  await pupil.select('main > .controls label:nth-child(2) select', 'Fictitious · CHEM');
  await pupil.click(aTitle);
  await until(async () => (await shapes(pupil)) === 2, 'recuperación al volver a la clase CHEM');
  truncateConnections();
  await pupil.see('Conectando');
  await pupil.see('Conectado');
  await until(async () => (await shapes(pupil)) === 2, 'reconexión sin duplicación');
  await teacherA.press('[title="Pausar sesión"]');
  await pupil.see('La sesión está pausada');
  await teacherA.press('[title="Reanudar sesión"]');
  await pupil.see('La sesión fue reanudada');
  record('reconexión con las dos figuras, pausa y reanudación desde Angular');

  await teacherA.press('[title="Finalizar sesión"]');
  await teacherA.click('Finalizar y guardar');
  await pupil.press('app-student-whiteboard-viewer button.btn-primary:not([disabled])');
  await until(() => pupil.run(() => [...document.images].some(image => image.src.startsWith('blob:') && image.complete
    && image.naturalWidth > 0)), 'PNG final válido en el registro');
  const binaryPath = `${a.path}/student/${a.id}/snapshot`;
  const snapshotRows = () => requests().filter(row => row.path === binaryPath && row.receivedBytes);
  const preview = snapshotRows();
  assert.equal(preview.length, 1);
  await pupil.run(() => {
    const download = [...document.querySelectorAll('button')].find(button => button.innerText.includes('Descargar'));
    if (!download) throw new Error('Missing download control.');
    download.click();
  });
  await pause(200);
  assert.equal(snapshotRows().length, 1);
  const reused = captureCounts(snapshotRows());
  assert((await tokenFetch(pupil, binaryPath)) > 0);
  await until(() => snapshotRows().length === 2, 'descarga HTTP separada de referencia');
  const separate = captureCounts(snapshotRows());
  await context(pupil, 'B');
  await pupil.see(bTitle);
  assert.equal(await pupil.has(aTitle), false);
  await pupil.click('Historial');
  await pupil.see('No hay pizarras disponibles en esta vista.');
  assert.equal(await pupil.run(() => [...document.images].some(image => image.src.startsWith('blob:'))), false);
  record('cierre, captura y descarga con un solo Blob; el cambio de ámbito retira la imagen');
  return { idle, initialStateRequests: 1, snapshotPreviewAndDownload: { reused, separate } };
}
