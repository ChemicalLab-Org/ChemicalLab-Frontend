import assert from 'node:assert/strict';
import { setTimeout as pause } from 'node:timers/promises';

const workspace = '/administracion-institucional';
const localDate = offset => {
  const date = new Date(Date.now() + offset);
  return new Date(date.valueOf() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};

async function login(view, username, temporary, until) {
  const password = 'Fictitious-Pilot-Changed-2026!';
  await view.nav('/auth/login');
  await view.fill('[formcontrolname=usernameOrEmail]', username);
  await view.fill('[formcontrolname=password]', temporary);
  await view.press('button[type=submit]');
  await until(() => view.run(() => location.pathname === '/auth/change-password'), 'cambio obligatorio');
  await view.fill('[formcontrolname=currentPassword]', temporary);
  await view.fill('[formcontrolname=newPassword]', password);
  await view.fill('[formcontrolname=confirmPassword]', password);
  await view.press('button[type=submit]');
  await until(() => view.run(path => location.pathname === path, workspace), 'administración institucional');
}

async function rowAction(view, title, label, until) {
  return until(() => view.run((name, action) => {
    const row = [...document.querySelectorAll('tr')].find(tr => tr.textContent.includes(name));
    const button = [...(row?.querySelectorAll('button') ?? [])].find(node => node.textContent.trim() === action);
    if (!button || button.disabled) return false;
    button.click();
    return true;
  }, title, label), label + ' · ' + title);
}

async function member(view, username, displayName) {
  await view.fill('input[name=username]', username);
  await view.fill('input[name=displayName]', displayName);
  await view.click('Guardar');
  await view.see('Deberá cambiar la contraseña');
  return view.run(() => document.querySelector('aside code').textContent);
}

async function selectOption(view, selector, prefix, until) {
  await until(() => view.run((query, text) => {
    const select = document.querySelector(query);
    const option = [...(select?.options ?? [])].find(option => option.text.trim().startsWith(text));
    if (!option || select.disabled) return false;
    select.value = option.value;
    select.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }, selector, prefix), prefix);
}

export async function administrationBrowserJourney({ platform, adminA, adminB, page, ready, record, until, requests, liveSockets }) {
  await login(platform, ready.platform, ready.platformTemporary, until);
  const issued = new Map();
  for (const key of ['A', 'B']) {
    await platform.click('Crear institución');
    await platform.fill('input[name=name]', 'Piloto ' + key);
    await platform.click('Guardar');
    await platform.see('Piloto ' + key);
    await rowAction(platform, 'Piloto ' + key, 'Crear primer administrador', until);
    issued.set(key, await member(platform, 'PilotAdmin' + key, 'Dirección ' + key));
  }
  record('dos instituciones y sus primeros administradores creados desde Angular');
  await login(adminA, 'PilotAdminA', issued.get('A'), until);
  await login(adminB, 'PilotAdminB', issued.get('B'), until);
  const first = localDate(-86400000);
  const last = localDate(7 * 86400000);
  for (const [key, view] of [['A', adminA], ['B', adminB]]) {
    const other = key === 'A' ? 'B' : 'A';
    await view.select('select', 'Piloto ' + key);
    assert.equal(await view.has('Piloto ' + other), false);
    await view.click('Períodos');
    await view.click('Añadir');
    await view.fill('input[name=name]', 'Período ' + key);
    await view.fill('input[name=from]', first);
    await view.fill('input[name=until]', last);
    await view.click('Guardar');
    await view.see('Período ' + key);
    await view.click('Clases');
    await view.click('Añadir');
    await view.fill('input[name=name]', 'Química ' + key);
    await view.fill('input[name=code]', 'CHEM');
    await selectOption(view, 'select[name=PERIODS]', 'Período ' + key, until);
    await view.click('Guardar');
    await view.see('Química ' + key);
    await view.click('Auditoría');
    await view.see('CLASS_CREATED');
  }
  record('cambio obligatorio, selector administrativo aislado, períodos, clases y auditoría de A y B');

  await adminA.click('Miembros');
  await adminA.click('Añadir');
  const pupilTemporary = await member(adminA, 'PilotPupilA', 'Estudiante A');
  await rowAction(adminA, 'Estudiante A', 'Conceder rol', until);
  await until(() => adminA.run(() => [...document.querySelectorAll('tr')]
    .some(row => row.textContent.includes('Estudiante A') && row.textContent.includes('ESTUDIANTE'))), 'rol estudiante');
  await adminA.select('#membership-role', 'DOCENTE');
  await rowAction(adminA, 'Dirección A', 'Conceder rol', until);
  await until(() => adminA.run(() => [...document.querySelectorAll('tr')]
    .some(row => row.textContent.includes('Dirección A') && row.textContent.includes('DOCENTE'))), 'administrador y docente');

  for (const [section, button, actor] of [['Docencia', 'Asignar docente', 'Dirección A'], ['Matrículas', 'Añadir', 'Estudiante A']]) {
    await adminA.click(section);
    await adminA.click(button);
    await selectOption(adminA, 'select[name=CLASSES]', 'Química A', until);
    await selectOption(adminA, 'select[name=MEMBERS]', actor, until);
    await adminA.fill('input[name=until]', last);
    await adminA.click('Guardar');
    await adminA.see('Química A');
  }
  record('alta estudiantil, rol combinado, docencia y matrícula desde Angular');

  const pupil = await page();
  await login(pupil, 'PilotPupilA', pupilTemporary, until);
  await pupil.see('No hay instituciones asignadas para administrar.');
  await adminA.nav('/pizarras-institucionales');
  await pupil.nav('/pizarras-institucionales');
  for (const view of [adminA, pupil]) {
    await view.select('main > .controls select:first-of-type', 'Piloto A');
    await view.select('main > .controls label:nth-child(2) select', 'Química A · CHEM');
  }
  await adminA.click('Crear pizarra');
  await adminA.fill('input[name=title]', 'Pizarra piloto A');
  await adminA.click('Crear y abrir');
  await adminA.see('Pizarra piloto A');
  await pupil.click('Actualizar pizarras');
  await pupil.see('Pizarra piloto A');
  await pupil.click('Pizarra piloto A');
  await until(() => liveSockets(pupil) === 1, 'socket nuevo alumno');
  record('cuentas creadas en la interfaz admitidas por el motor de pizarra');

  const administrator = await page();
  await administrator.nav('/auth/login');
  await administrator.fill('[formcontrolname=usernameOrEmail]', 'PilotAdminA');
  await administrator.fill('[formcontrolname=password]', 'Fictitious-Pilot-Changed-2026!');
  await administrator.press('button[type=submit]');
  await administrator.select('select', 'Piloto A');
  await administrator.click('Miembros');
  await rowAction(administrator, 'Estudiante A', 'Suspender', until);
  await until(() => liveSockets(pupil) === 0, 'revocación pasiva por suspensión desde Angular');
  record('suspensión de pertenencia desde Angular cerró el socket pasivo');

  await adminB.click('Resumen');
  await until(() => adminB.run(() => document.querySelector('.totals dd')?.textContent.trim() === '1'), 'conteo acotado B');
  await rowAction(platform, 'Piloto B', 'Suspender institución', until);
  await platform.see('Suspendida');
  await adminB.click('Clases');
  await adminB.see('No tienes permiso para esta operación.');
  await rowAction(platform, 'Piloto B', 'Reanudar institución', until);
  await until(() => platform.run(() => [...document.querySelectorAll('tr')]
    .some(row => row.textContent.includes('Piloto B') && row.textContent.includes('Suspender institución'))), 'institución reanudada');
  await adminB.click('Resumen');
  await until(() => adminB.run(() => document.querySelector('.totals dd')?.textContent.trim() === '1'), 'retorno al ámbito B');
  record('suspensión y reanudación de institución desde la vista de plataforma');

  await adminA.nav('/contenidos-institucionales');
  await adminA.select('main > .controls select:first-of-type', 'Piloto A');
  await adminA.select('main > .controls label:nth-child(2) select', 'Química A · CHEM');
  await adminA.click('Nuevo borrador');
  await adminA.fill('[name=title]', 'Material piloto A');
  await adminA.fill('[name=category]', 'Química');
  await adminA.fill('[name=explanation]', 'Material de prueba de biblioteca.');
  await adminA.click('Guardar borrador');
  await adminA.see('Borrador guardado.');
  await administrator.click('Biblioteca');
  await administrator.select('label:has(select option[value=CONTENT]) select', 'Contenidos');
  await administrator.click('Conceder facultad');
  await selectOption(administrator, 'select[name=RESOURCES]', 'Material piloto A', until);
  await selectOption(administrator, 'select[name=MEMBERS]', 'Dirección A', until);
  await administrator.select('select[name=faculty]', 'PUBLISH');
  await administrator.fill('input[name=until]', last);
  await administrator.click('Guardar');
  await administrator.see('PUBLISH');
  await administrator.click('Revocar');
  await until(() => administrator.run(() => ![...document.querySelectorAll('td button')]
    .some(button => button.textContent.trim() === 'Revocar')), 'facultad revocada');
  record('concesión y revocación de facultad de biblioteca desde Angular');

  const snapshot = () => requests().filter(row => row.path.startsWith('/api/')).length;
  const before = snapshot();
  await pause(2500);
  const idleApiRequests = snapshot() - before;
  assert.equal(idleApiRequests, 0);
  assert.equal(requests().filter(row => row.path === '/api/usage-metrics/events').length, 0);
  record('cero peticiones API durante 2,5 s de reposo y cero eventos legacy');
  return { idleMilliseconds: 2500, idleApiRequests, legacyMetricRequests: 0 };
}
