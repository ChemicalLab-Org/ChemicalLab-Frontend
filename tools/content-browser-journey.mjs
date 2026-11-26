import assert from 'node:assert/strict';

async function file(page, valid) {
  assert(await page.run(async valid => {
    let data = 'texto ficticio';
    if (valid) {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 8;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#236680';
      ctx.fillRect(0, 0, 8, 8);
      data = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    }
    const input = document.querySelector('input[type=file]');
    const files = new DataTransfer();
    files.items.add(new File([data], valid ? 'laboratorio.png' : 'falso.png', { type: 'image/png' }));
    input.files = files.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }, valid));
}

export async function contentBrowserJourney({ teacherA, teacherB, pupil, context, record, files, until }) {
  const suffix = Date.now().toString(36);
  const first = 'Reacciones A ' + suffix;
  const second = 'Reacciones B ' + suffix;

  for (const [view, school, title] of [[teacherA, 'A', first], [teacherB, 'B', second]]) {
    await context(view, school);
    await view.click('Nuevo borrador');
    await view.fill('[name=title]', title);
    await view.fill('[name=category]', 'Química');
    await view.fill('[name=explanation]', 'Contenido de ' + school);
    await view.click('Añadir enlace');
    await view.fill('[name=link-title-0]', 'Material de ' + school);
    await view.fill('[name=link-url-0]', 'https://example.org/' + school);
    await view.click('Guardar borrador');
    await view.see('Borrador guardado.');
    await file(view, true);
    await view.click('Subir archivo');
    await view.see('Archivo guardado.');
    if (school === 'A') {
      await file(view, false);
      await view.click('Reemplazar archivo');
      await view.see('Revisa los datos y los límites');
      await view.see('laboratorio.png');
    }
    await view.clickIn(title, 'Publicar', '.entry');
    await view.see('Revisión publicada.');
    await view.clickIn(title, 'Asignar a esta clase', '.entry');
    await view.see('Asignado a 1 estudiante');
  }
  record('dos contenidos, archivos y enlaces publicados y asignados; el reemplazo inválido mantuvo el archivo');

  await context(pupil, 'A');
  await pupil.see(first);
  assert.equal(await pupil.has(second), false);
  const start = files().length;
  await pupil.clickIn(first, 'Consultar contenido', '.entry');
  await pupil.see('Material de A');
  assert.equal(await pupil.has('Material de B'), false);
  assert.equal(files().length, start, 'Opening metadata must never download bytes');

  await pupil.click('Vista previa');
  await until(() => pupil.run(() => {
    const image = document.querySelector('figure img');
    return image?.complete && image.naturalWidth === 8 && image.src.startsWith('blob:');
  }), 'PNG seguro');
  assert.equal(await pupil.run(() => !!document.querySelector('iframe, embed, object')), false);
  await pupil.click('Descargar archivo');
  assert.equal(files().length - start, 1);
  const optimized = files().slice(start);
  record('vista previa y descarga con el mismo Blob');

  const baselineStart = files().length;
  await pupil.click('Cerrar vista previa');
  await pupil.click('Vista previa');
  await until(() => pupil.run(() => document.querySelector('figure img')?.naturalWidth === 8), 'PNG línea base');
  await pupil.click('Cerrar vista previa');
  await pupil.click('Descargar archivo');
  await until(() => files().length - baselineStart === 2 && files().slice(baselineStart).every(row => row.durationMs !== undefined),
    'dos transferencias terminadas');
  const baseline = files().slice(baselineStart);
  record('línea base con revocación del Blob antes de descargar');

  await pupil.click('Vista previa');
  await until(() => pupil.run(() => document.querySelector('figure img')?.naturalWidth === 8), 'preview antes del cambio');
  await context(pupil, 'B');
  await pupil.see(second);
  assert.equal(await pupil.has(first), false);
  assert.equal(await pupil.has('Material de A'), false);
  assert.equal(await pupil.run(() => !!document.querySelector('figure img')), false);
  await pupil.clickIn(second, 'Consultar contenido', '.entry');
  await pupil.see('Material de B');
  record('cambio A a B retiró material y vista previa de A');
  return { baseline, optimized };
}
