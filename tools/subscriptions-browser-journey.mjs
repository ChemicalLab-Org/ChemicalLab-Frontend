import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHmac, randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { createServer } from 'node:http';

export async function subscriptionsBrowserJourney({
  representative, ready, record, until, login, psql, databasePort, mockPort, origin,
}) {
  assert(psql && /^\d{4,5}$/.test(databasePort) && /^\d{4,5}$/.test(mockPort));
  const backend = new URL(ready.origin);
  assert.equal(backend.hostname, '127.0.0.1');
  const provider = 'http://127.0.0.1:' + mockPort;
  const checkoutUrl = provider + '/checkout/subedge';
  const invoiceId = '2011';
  const paymentId = '3011';
  let remote;
  let invoice;
  let payment;
  let creations = 0;
  let cancellations = 0;
  let checkouts = 0;
  const version = () => new Date().toISOString();
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, provider);
    if (url.pathname === '/checkout/subedge') {
      checkouts++;
      const back = new URL(remote.back_url);
      assert.equal(back.origin, origin);
      assert.equal(back.searchParams.get('institucion'), String(ready.a));
      back.searchParams.set('status', 'approved');
      back.searchParams.set('payment_id', paymentId);
      res.writeHead(303, { Location: back.href });
      res.end();
      return;
    }
    let value;
    if (url.pathname === '/preapproval' && req.method === 'POST') {
      creations++;
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const input = JSON.parse(Buffer.concat(chunks));
      assert.equal(input.status, 'pending');
      assert.equal(input.auto_recurring.transaction_amount, 99);
      assert.equal(input.auto_recurring.currency_id, 'PEN');
      remote = { ...input, id: 'subedge', collector_id: 1101, application_id: 1102,
        payer_id: 1103, init_point: checkoutUrl, last_modified: version() };
      value = remote;
    } else if (url.pathname === '/preapproval/subedge') {
      if (req.method === 'PUT') {
        cancellations++;
        const chunks = [];
        for await (const chunk of req) chunks.push(chunk);
        assert.deepEqual(JSON.parse(Buffer.concat(chunks)), { status: 'canceled' });
        remote = { ...remote, status: 'canceled', last_modified: version() };
      }
      value = remote;
    } else if (url.pathname === '/authorized_payments/' + invoiceId) {
      value = invoice;
    } else if (url.pathname === '/v1/payments/' + paymentId) {
      value = payment;
    } else if (url.pathname === '/authorized_payments/search') {
      value = { results: invoice ? [invoice] : [] };
    }
    res.writeHead(value ? 200 : 404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(value ?? {}));
  });

  function sql(statement) {
    return execFileSync(psql, ['-XqtA', '-v', 'ON_ERROR_STOP=1', '-h', '127.0.0.1', '-p', databasePort,
      '-U', 't12_runtime_local', '-d', 'chemicallab_t12_runtime_test', '-c', statement],
    { encoding: 'utf8', windowsHide: true }).trim();
  }

  async function api(method, path, token, body, expected = 200, extra = {}) {
    const headers = { ...extra };
    if (token) headers.Authorization = 'Bearer ' + token;
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const response = await fetch(new URL('/api' + path, backend), { method, headers,
      body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(20000) });
    const result = await response.text();
    assert.equal(response.status, expected, method + ' ' + path + ' ' + result.slice(0, 150));
    return result ? JSON.parse(result) : null;
  }

  async function notify(type, id) {
    const timestamp = String(Date.now());
    const requestId = randomUUID();
    const signature = createHmac('sha256', 'fictitious-local-signature-2026')
      .update(`id:${id};request-id:${requestId};ts:${timestamp};`).digest('hex');
    await api('POST', '/subscriptions/v1/mercado-pago/webhook?data.id=' + id, null,
      { type, data: { id }, user_id: 1101, live_mode: false }, 200,
      { 'x-signature': `ts=${timestamp},v1=${signature}`, 'x-request-id': requestId });
  }

  const billing = `/institutions/${ready.a}/subscription/v1`;
  const status = () => sql(`SELECT coalesce(provider_status,'') FROM subscription_runtime.contract WHERE institution_id=${ready.a}`);
  const field = (view, label) => view.run(text => [...document.querySelectorAll('main dt')]
    .find(el => el.textContent.trim() === text)?.nextElementSibling?.textContent.trim(), label);
  const action = (view, label) => view.run(text => [...document.querySelectorAll('main button')]
    .some(el => el.textContent.trim() === text), label);

  try {
    server.listen(Number(mockPort), '127.0.0.1');
    await once(server, 'listening');
    assert.equal(sql("SELECT current_database()||':'||host(inet_server_addr())"), 'chemicallab_t12_runtime_test:127.0.0.1');
    assert.equal(sql('SELECT count(*) FROM subscription_runtime.school'), '0');
    const access = await api('POST', '/auth/login', null,
      { usernameOrEmail: ready.platform, password: ready.platformTemporary });
    const password = 'Edge-Checkout-Fixture-Changed-2026!';
    const platform = (await api('PATCH', '/auth/change-temporary-password', access.token,
      { currentPassword: ready.platformTemporary, newPassword: password, confirmPassword: password })).token;
    const actor = Number(sql(`SELECT account_id FROM evaluation_runtime.memberships WHERE institution_id=${ready.a}
      AND account_id IN (SELECT id FROM public.user_accounts WHERE role='DOCENTE')`));
    assert(Number.isSafeInteger(actor) && actor > 0);
    sql(`INSERT INTO evaluation_runtime.memberships(institution_id,account_id,valid_from)
         VALUES (${ready.b},${actor},clock_timestamp()-interval '1 minute');
         INSERT INTO evaluation_runtime.roles(membership_id,institution_id,role,valid_from)
          SELECT id,institution_id,'ADMIN_INSTITUCION',clock_timestamp()-interval '1 minute'
          FROM evaluation_runtime.memberships WHERE institution_id=${ready.a} AND account_id=${actor}`);
    for (const [school, letter] of [[ready.a, 'A'], [ready.b, 'B']]) {
      const setup = `/platform/institutions/${school}/subscription/v1`;
      await api('POST', setup + '/verify', platform, { evidenceReference: 'EDGE-SCHOOL-' + letter }, 204);
      await api('POST', setup + '/authority', platform,
        { accountId: actor, evidenceReference: 'EDGE-AUTHORITY-' + letter, validUntil: '2090-01-01T00:00:00Z' }, 204);
    }

    await login(representative, ready.teacherA);
    await representative.nav('/administracion-institucional');
    await until(() => representative.run(() => {
      const link = [...document.querySelectorAll('main a')].find(el => el.textContent.trim() === 'Suscripción');
      if (!link) return false;
      link.click();
      return true;
    }), 'entrada desde Administración institucional');
    await representative.see('Modo de pruebas');
    await representative.select('main select', 'Fictitious B');
    await representative.see('Prueba vigente');
    assert.equal(await field(representative, 'Usuarios activos'), '3 de 200');
    await representative.select('main select', 'Fictitious A');
    await until(async () => await field(representative, 'Usuarios activos') === '2 de 200', 'consumo de A');
    assert.match(await field(representative, 'Almacenamiento lógico'), /2000|2,000|2\.000/);
    assert.notEqual(await field(representative, 'Vencimiento de prueba'), '—');
    assert.equal(await action(representative, 'Contratar'), false);
    record('Edge | navegación desde el panel, selección A/B, prueba y consumo por colegio');

    sql(`BEGIN; ALTER TABLE subscription_runtime.school DISABLE TRIGGER subscription_trial_guard;
      UPDATE subscription_runtime.school SET trial_start=clock_timestamp()-interval '2 months',
         trial_end=clock_timestamp()-interval '1 month' WHERE institution_id=${ready.a};
      ALTER TABLE subscription_runtime.school ENABLE TRIGGER subscription_trial_guard; COMMIT;`);
    await representative.click('Actualizar estado');
    await representative.see('Sin vigencia');
    await representative.click('Contratar');
    await representative.click('Confirmar');
    await representative.see('Abrir checkout de prueba');
    assert.equal(creations, 1);
    const checkout = await representative.run(() => {
      const element = [...document.querySelectorAll('a')].find(a => a.textContent.includes('Abrir checkout'));
      return { target: element.target, href: element.href };
    });
    assert.deepEqual(checkout, { target: '', href: checkoutUrl });
    await representative.press('main a[href*="/checkout/"]');
    const returned = representative;
    await until(() => returned.run(() => location.pathname === '/suscripcion-institucional'
      && new URLSearchParams(location.search).get('status') === 'approved'), 'retorno del checkout en la misma pestaña');
    await returned.see('Pendiente de autorización en Mercado Pago');
    assert.equal(checkouts, 1);
    assert.equal(await field(returned, 'Fin de vigencia pagada'), '—');
    assert.equal(sql('SELECT count(*) FROM subscription_runtime.invoice'), '0');
    record('Edge | contratación y retorno en la misma pestaña. Un retorno con estado aparente aprobado no concede vigencia.');

    remote = { ...remote, status: 'authorized', last_modified: version(),
      next_payment_date: new Date(Date.now() + 86400000).toISOString() };
    await notify('subscription_preapproval', remote.id);
    await until(() => status() === 'authorized', 'notificación de autorización procesada', 20000);
    await returned.click('Actualizar estado');
    await returned.see('Cobro recurrente autorizado, pendiente de pago');
    assert.equal(await field(returned, 'Fin de vigencia pagada'), '—');
    invoice = { id: invoiceId, preapproval_id: remote.id, external_reference: remote.external_reference, currency_id: 'PEN',
      transaction_amount: 99, debit_date: new Date(Date.now() - 60000).toISOString(), last_modified: version(),
      payment: { id: paymentId } };
    payment = { id: paymentId, status: 'approved', collector_id: 1101, payer: { id: 1103 }, live_mode: false, currency_id: 'PEN',
      transaction_amount: 99, date_approved: version(), date_last_updated: version() };
    await notify('subscription_authorized_payment', invoiceId);
    await until(() => sql('SELECT status FROM subscription_runtime.invoice') === 'APPROVED', 'factura procesada', 20000);
    await returned.click('Actualizar estado');
    await returned.see('Período pagado vigente');
    const paid = await field(returned, 'Fin de vigencia pagada');
    assert.notEqual(paid, '—');
    record('Edge | actualización distingue autorización y pago aprobado verificado por el backend');

    await returned.click('Cancelar renovación');
    await returned.click('Confirmar');
    await returned.see('Solicitud recibida.');
    await until(() => status() === 'cancelled', 'cancelación procesada', 20000);
    await returned.click('Actualizar estado');
    await returned.see('Renovación cancelada, período pagado vigente');
    assert.equal(await field(returned, 'Fin de vigencia pagada'), paid);
    assert.equal(await field(returned, 'Próximo cobro conocido'), '—');
    assert.equal(cancellations, 1);
    await returned.select('main select', 'Fictitious B');
    await returned.see('Prueba vigente');
    assert.equal(await field(returned, 'Fin de vigencia pagada'), '—');
    record('Edge | cancelación conserva el período y deja intacta la prueba del otro colegio');
    return { creations, checkouts, cancellations };
  } finally {
    server.closeAllConnections();
    server.close();
  }
}
