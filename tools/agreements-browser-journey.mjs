import assert from 'node:assert/strict';

export async function agreementsBrowserJourney({ reviewer, representative, pupil, ready, record, until }) {
  async function signIn(view, username, password) {
    await view.nav('/auth/login');
    await view.fill('[formcontrolname=usernameOrEmail]', username);
    await view.fill('[formcontrolname=password]', password);
    await view.press('button[type=submit]');
  }

  async function clickTextLink(view, text) {
    await until(() => view.run(text => {
      const link = [...document.querySelectorAll('a')].find(node => node.textContent.trim() === text);
      if (!link) return false;
      link.click();
      return true;
    }, text), text);
  }

  async function showDocument(view, title, qualifier = '') {
    await until(() => view.run((title, qualifier) => {
      const card = [...document.querySelectorAll('article')].find(node =>
        node.querySelector('h3')?.textContent.trim() === title && node.textContent.includes(qualifier));
      const button = card?.querySelector('button[aria-expanded=false]');
      if (!button) return false;
      button.click();
      return true;
    }, title, qualifier), title);
    await view.see('Texto ficticio');
  }

  async function confirm(view, button) {
    assert(await view.run(button => {
      const checkbox = document.querySelector('article input[type=checkbox]');
      const control = [...document.querySelectorAll('article button')].find(node => node.textContent.trim() === button);
      return checkbox && !checkbox.checked && control?.disabled;
    }, button), 'La casilla debe estar vacía y la acción deshabilitada');
    await view.press('article input[type=checkbox]');
    await view.click(button);
    await view.see('Tu decisión quedó registrada.');
  }

  await pupil.nav('/auth/login');
  await clickTextLink(pupil, 'Documentos de uso y privacidad');
  await clickTextLink(pupil, 'Aviso de ensayo (versión 1)');
  await pupil.see('Texto ficticio');
  assert.equal(await pupil.has('Tu decisión'), false);
  record('aviso público legible antes del inicio de sesión');

  await signIn(reviewer, ready.platform, ready.platformTemporary);
  await until(() => reviewer.run(() => location.pathname === '/auth/change-password'), 'contraseña temporal');
  const newPassword = 'Fictitious-Agreement-Changed-2026!';
  await reviewer.fill('[formcontrolname=currentPassword]', ready.platformTemporary);
  await reviewer.fill('[formcontrolname=newPassword]', newPassword);
  await reviewer.fill('[formcontrolname=confirmPassword]', newPassword);
  await reviewer.press('button[type=submit]');
  await reviewer.see('Hay términos obligatorios pendientes.');
  await showDocument(reviewer, 'Términos de ensayo');
  await confirm(reviewer, 'Registrar aceptación');
  await clickTextLink(reviewer, 'Revisar representación y autorizaciones');
  await reviewer.fill('input[name=institution]', String(ready.a));
  await reviewer.fill('input[name=membership]', String(ready.familyMembership));
  await reviewer.select('select[name=result]', 'Pendiente');
  await reviewer.fill('input[name=reference]', 'DEMO-BROWSER');
  await reviewer.click('Registrar revisión');
  await reviewer.see('La revisión quedó registrada.');
  await reviewer.see('DEMO-BROWSER');
  record('la contraseña temporal se cambia antes de continuar a los términos');

  await signIn(pupil, ready.student, ready.password);
  await pupil.see('Pendiente de verificación');
  assert.equal(await pupil.has('DEMO-BROWSER'), false);
  record('registro institucional y consulta de estado desde la cuenta del alumno sin exhibir el expediente');

  await signIn(representative, ready.teacherA, ready.password);
  await representative.see('Hay términos obligatorios pendientes.');
  await representative.nav('/evaluaciones-institucionales');
  await until(() => representative.run(() => location.pathname === '/mi-cuenta/acuerdos'), 'acuerdo personal obligatorio');
  await showDocument(representative, 'Términos de ensayo');
  await confirm(representative, 'Registrar aceptación');
  await representative.see('Ir al panel');
  await representative.see('Historial de decisiones');
  await showDocument(representative, 'Acuerdo institucional de ensayo', 'Fictitious A');
  await confirm(representative, 'Registrar aceptación');
  assert.equal(await representative.has('Fictitious B'), false);
  record('navegación directa bloqueada y aceptación personal e institucional diferenciadas');

  await showDocument(representative, 'Finalidad opcional de ensayo', 'Representas a la cuenta');
  await representative.click('Rechazar autorización');
  await representative.see('Decisión registrada · Rechazo');
  await showDocument(representative, 'Finalidad opcional de ensayo', 'Representas a la cuenta');
  await confirm(representative, 'Registrar autorización');
  await showDocument(representative, 'Finalidad opcional de ensayo', 'Representas a la cuenta');
  await representative.click('Retirar autorización');
  await representative.see('Decisión registrada · Retirada');
  await clickTextLink(representative, 'Ir al panel');
  await until(() => representative.run(() => !location.pathname.startsWith('/mi-cuenta/acuerdos')), 'panel después de retirar');
  record('rechazo, autorización y retirada desde una representación verificada sin bloqueo global');

  await representative.nav('/mi-cuenta/acuerdos');
  await representative.see('Decisión registrada · Retirada');
  await clickTextLink(representative, 'Términos de ensayo (versión 1)');
  await representative.see('Huella SHA-256 del texto');
  await representative.click('Cerrar sesión');
  await until(() => representative.run(() => location.pathname === '/auth/login'), 'cierre de sesión');
  record('consulta posterior de versión y cierre de sesión');

  await signIn(representative, ready.teacherB, ready.password);
  await representative.see('Hay términos obligatorios pendientes.');
  await showDocument(representative, 'Términos de ensayo');
  await confirm(representative, 'Registrar aceptación');
  await showDocument(representative, 'Acuerdo institucional de ensayo', 'Fictitious B');
  await confirm(representative, 'Registrar aceptación');
  await showDocument(pupil, 'Términos de ensayo');
  await confirm(pupil, 'Registrar aceptación');
  await pupil.nav('/evaluaciones-institucionales');
  const school = '.controls select:first-of-type';
  const classroom = '.controls label:nth-child(2) select';
  await pupil.select(school, 'Fictitious A');
  await pupil.select(classroom, 'Fictitious · CHEM');
  await pupil.see('condición pendiente en este colegio');
  assert(await pupil.run(() => location.pathname === '/evaluaciones-institucionales'));
  await pupil.select(school, 'Fictitious B');
  await pupil.select(classroom, 'Fictitious · CHEM');
  await pupil.see('No hay entregas disponibles para esta clase.');
  assert.equal(await pupil.has('condición pendiente en este colegio'), false);
  record('una autorización pendiente en A no expulsa de Angular ni impide seleccionar y consultar B');
}
