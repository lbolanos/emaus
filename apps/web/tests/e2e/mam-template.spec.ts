import {
  test,
  expect,
  request,
  type APIRequestContext,
  type BrowserContext,
  type Page,
} from '@playwright/test';

/**
 * E2E (Chrome) del editor de Templates Minuto a Minuto. Aísla todo en un
 * TemplateSet de prueba creado por API y lo borra al final (cascade).
 *
 * Cubre: detección de hueco + "Ajustar duración" cierra el hueco, y editar un
 * item NO revienta con 400 (regresión del `attachments`). Se salta limpio si no
 * hay superadmin local.
 */

const SUPERADMIN = {
  email: process.env.E2E_SUPERADMIN_EMAIL || 'leonardo.bolanos@gmail.com',
  password: process.env.E2E_SUPERADMIN_PASSWORD || '123456',
};
const json = { 'content-type': 'application/json' };

test.describe.serial('Templates Minuto a Minuto (E2E)', () => {
  let api: APIRequestContext;
  let csrf = '';
  let setId = '';
  const setName = 'ZZE2E TPL SET';
  let context: BrowserContext;
  let page: Page;
  let skipReason = '';

  test.beforeAll(async ({ browser, baseURL }) => {
    api = await request.newContext({ baseURL });
    const login = await api.post('/api/auth/login', { data: SUPERADMIN, headers: json });
    if (!login.ok()) {
      skipReason = `login superadmin falló (${login.status()})`;
      return;
    }
    csrf = (await (await api.get('/api/csrf-token')).json()).csrfToken;

    const setRes = await api.post('/api/schedule-templates/sets', {
      data: { name: setName, description: 'E2E', isActive: true, isDefault: false },
      headers: { ...json, 'X-CSRF-Token': csrf },
    });
    if (!setRes.ok()) {
      skipReason = `crear set falló (${setRes.status()})`;
      return;
    }
    setId = (await setRes.json()).id;

    const mk = (name: string, defaultStartTime: string) =>
      api.post('/api/schedule-templates', {
        data: {
          templateSetId: setId,
          name,
          type: 'otro',
          defaultDay: 1,
          defaultStartTime,
          defaultDurationMinutes: 15,
        },
        headers: { ...json, 'X-CSRF-Token': csrf },
      });
    await mk('ZZE2E A', '10:00'); // termina 10:15
    await mk('ZZE2E B', '10:30'); // hueco de 15 min

    const state = await api.storageState();
    // Viewport alto: el modal de edición del template tiene muchos campos y su
    // footer (Guardar) queda fuera de un viewport estándar (720px).
    context = await browser.newContext({
      storageState: state,
      locale: 'es-MX',
      viewport: { width: 1280, height: 1600 },
    });
    page = await context.newPage();
  });

  test.afterAll(async () => {
    if (setId && csrf) {
      await api.delete(`/api/schedule-templates/sets/${setId}`, {
        headers: { 'X-CSRF-Token': csrf },
      });
    }
    await page?.close();
    await context?.close();
    await api?.dispose();
  });

  test('detecta hueco y "Ajustar duración" lo corrige; editar no da 400', async ({ baseURL }) => {
    test.skip(!!skipReason, skipReason);
    // `networkidle`: deja que el auto-load del set por defecto (onMounted) termine
    // ANTES de seleccionar el nuestro. Si no, ese load llega tarde y sobrescribe
    // los items del set elegido (carrera → la lista muestra otro set).
    await page.goto(`${baseURL}/app/settings/schedule-template`, { waitUntil: 'networkidle' });
    // OJO: hay varios <select> en la página (el "Retiro" del sidebar entre ellos),
    // así que `.first()` es el equivocado. Scopeamos el select de "Template" por la
    // única opción que solo él tiene (nuestro set) y afirmamos que quedó seleccionado.
    const setSelect = page
      .locator('select')
      .filter({ has: page.getByRole('option', { name: setName }) });
    await expect(setSelect).toHaveCount(1, { timeout: 15000 });
    await setSelect.selectOption(setId);
    await expect(setSelect).toHaveValue(setId);

    // Hueco visible entre A y B.
    await expect(page.getByText('Hueco de 15 min hasta la siguiente')).toBeVisible();

    // Ajustar duración cierra el hueco.
    await page.getByRole('button', { name: 'Ajustar duración' }).click();
    await expect(page.getByText(/Hueco de/)).toHaveCount(0, { timeout: 5000 });

    // Editar un item NO debe dar 400 (regresión attachments): cambiar nombre +
    // hora (vía el picker nativo type="time") y guardar.
    const aRow = page.locator('[id^="template-item-"]').filter({ hasText: 'ZZE2E A' });
    await aRow.getByRole('button', { name: 'Editar' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    // La hora se captura con un <input type="time"> (no texto libre).
    const timeInput = dialog.locator('input[type="time"]');
    await expect(timeInput).toHaveCount(1);
    await timeInput.fill('09:00');

    await dialog.locator('input[placeholder^="Ej"]').fill('ZZE2E A editado');
    await dialog.getByRole('button', { name: 'Guardar' }).click();
    await expect(dialog).toBeHidden();

    // El item editado conserva el nombre y refleja la nueva hora 09:00.
    const editedRow = page
      .locator('[id^="template-item-"]')
      .filter({ hasText: 'ZZE2E A editado' });
    await expect(editedRow).toBeVisible();
    await expect(editedRow.getByText('09:00')).toBeVisible();

    // Abrir B (10:30): el modal debe PRECARGAR la hora en el input type="time"
    // (normalizada), no en un texto libre.
    const bRow = page.locator('[id^="template-item-"]').filter({ hasText: 'ZZE2E B' });
    await bRow.getByRole('button', { name: 'Editar' }).click();
    await expect(dialog).toBeVisible();
    await expect(timeInput).toHaveValue('10:30');
    await dialog.getByRole('button', { name: 'Cancelar' }).click();
    await expect(dialog).toBeHidden();
  });
});
