import {
  test,
  expect,
  request,
  type APIRequestContext,
  type BrowserContext,
  type Page,
} from '@playwright/test';

/**
 * E2E (browser, Chrome) de la coherencia de tiempos del Minuto a Minuto
 * (2026-06-08): detección de huecos/solapes + botones "Ajustar duración" y
 * "Mover el siguiente", campo de solo-hora en el modal, y botón "⏱ Ahora".
 *
 * Estrategia: en vez de depender de fixtures sembrados, el test
 *  1) hace login por API como superadmin (todos los usuarios locales usan 123456),
 *  2) crea 2 actividades AISLADAS en el "Día 7" de un retiro existente (vacío en
 *     ese día), vía API — el backend las ancla a startDate+6,
 *  3) maneja el navegador autenticado (storageState) para verificar la UI,
 *  4) borra las actividades vía `DELETE /api/schedule/items/:id` al terminar.
 *
 * Las aserciones son TZ-independientes: los textos "Hueco de 15 min" / "Se encima
 * 30 min" y la duración "30m" dependen de diferencias, no de horas absolutas.
 *
 * Se salta limpio (test.skip) si no hay superadmin local o no hay retiros — así
 * no rompe en CI sin esos datos.
 */

const SUPERADMIN = {
  email: process.env.E2E_SUPERADMIN_EMAIL || 'leonardo.bolanos@gmail.com',
  password: process.env.E2E_SUPERADMIN_PASSWORD || '123456',
};

const json = { 'content-type': 'application/json' };

test.describe.serial('Minuto a Minuto — coherencia de tiempos (E2E)', () => {
  let api: APIRequestContext;
  let csrf = '';
  let retreatId = '';
  let itemAId = '';
  let itemBId = '';
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
    const status = await api.get('/api/auth/status');
    const me = status.ok() ? await status.json() : {};
    csrf = (await (await api.get('/api/csrf-token')).json()).csrfToken;

    // Pick any retreat the superadmin can see.
    const retreatsRes = await api.get('/api/retreats');
    if (!retreatsRes.ok()) {
      skipReason = `GET /api/retreats falló (${retreatsRes.status()})`;
      return;
    }
    const body = await retreatsRes.json();
    const retreats = Array.isArray(body) ? body : (body?.data ?? body?.retreats ?? []);
    if (!retreats.length) {
      skipReason = 'no hay retiros en la DB para el E2E';
      return;
    }
    retreatId = retreats[0].id;

    // Two isolated items on Día 7 (vacío en retiros normales de ≤3 días).
    // 16:00Z / 16:30Z → quedan a 30 min entre sí tras el anclaje; con duración 15
    // cada uno → hueco de 15 min entre A (termina :15) y B (empieza :30).
    const mk = async (name: string, startISO: string) => {
      const r = await api.post(`/api/schedule/retreats/${retreatId}/items`, {
        data: { name, type: 'otro', day: 7, startTime: startISO, durationMinutes: 15 },
        headers: { ...json, 'X-CSRF-Token': csrf },
      });
      if (!r.ok()) throw new Error(`crear item falló: ${r.status()} ${await r.text()}`);
      return (await r.json()).id as string;
    };
    try {
      itemAId = await mk('ZZE2E Gap A', '2026-06-11T16:00:00.000Z');
      itemBId = await mk('ZZE2E Gap B', '2026-06-11T16:30:00.000Z');
    } catch (e: any) {
      skipReason = `no se pudieron crear items (${e?.message ?? e})`;
      return;
    }

    const state = await api.storageState();
    context = await browser.newContext({
      storageState: state,
      locale: 'es-MX',
      timezoneId: 'America/Mexico_City',
    });
    page = await context.newPage();
  });

  test.afterAll(async () => {
    // Borrar los items de prueba (endpoint DELETE sí existe).
    for (const id of [itemAId, itemBId].filter(Boolean)) {
      await api.delete(`/api/schedule/items/${id}`, {
        headers: { 'X-CSRF-Token': csrf },
      });
    }
    await page?.close();
    await context?.close();
    await api?.dispose();
  });

  // Grupo "Día 7" en la vista (aislado: solo nuestros 2 items).
  const dia7 = (p: Page) =>
    p.locator('div.mb-8').filter({ has: p.getByRole('heading', { name: /Día 7/ }) });

  test('hueco se detecta y "Ajustar duración" lo corrige', async ({ baseURL }) => {
    test.skip(!!skipReason, skipReason);
    await page.goto(`${baseURL}/app/retreats/${retreatId}/minuto-a-minuto`);

    const group = dia7(page);
    await expect(group.getByText('Hueco de 15 min hasta la siguiente')).toBeVisible();

    await group.getByRole('button', { name: 'Ajustar duración' }).click();

    // El hueco desaparece y la actividad A pasa a 30 min.
    await expect(group.getByText(/Hueco de/)).toHaveCount(0);
    await expect(group.getByText('30m')).toBeVisible();
  });

  test('solape se detecta y "Mover el siguiente" lo corrige', async ({ baseURL }) => {
    test.skip(!!skipReason, skipReason);
    // Forzar solape: A dura 60 (10:00–11:00) y B sigue a las 10:30 → se encima 30.
    const patch = await api.patch(`/api/schedule/items/${itemAId}`, {
      data: { durationMinutes: 60 },
      headers: { ...json, 'X-CSRF-Token': csrf },
    });
    expect(patch.ok()).toBeTruthy();

    await page.goto(`${baseURL}/app/retreats/${retreatId}/minuto-a-minuto`);
    const group = dia7(page);
    await expect(group.getByText('Se encima 30 min con la siguiente')).toBeVisible();

    await group.getByRole('button', { name: 'Mover el siguiente' }).click();

    // Al mover B para que empiece cuando A termina, el solape desaparece.
    await expect(group.getByText(/Se encima/)).toHaveCount(0);
  });

  test('modal de crear: campo solo-hora, sin fecha ni "Orden del día"; botón "Ahora" presente', async ({
    baseURL,
  }) => {
    test.skip(!!skipReason, skipReason);
    await page.goto(`${baseURL}/app/retreats/${retreatId}/minuto-a-minuto`);

    // Botón "⏱" (solo ícono, tooltip/aria-label) junto al buscador.
    await expect(
      page.getByRole('button', { name: 'Ir a la próxima actividad pendiente de hoy' }),
    ).toBeVisible();

    // Botón "+" (solo ícono, aria-label "Nueva actividad") junto al buscador.
    await page.getByRole('button', { name: 'Nueva actividad' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    // Campo de solo hora, sin datetime-local, sin "Orden del día".
    await expect(dialog.locator('input[type="time"]')).toHaveCount(1);
    await expect(dialog.locator('input[type="datetime-local"]')).toHaveCount(0);
    await expect(dialog.getByText('Orden del día')).toHaveCount(0);

    await dialog.getByRole('button', { name: 'Cancelar' }).click();
    await expect(dialog).toBeHidden();
  });

  test('al crear una actividad vía modal, queda resaltada (scroll + highlight)', async ({
    baseURL,
  }) => {
    test.skip(!!skipReason, skipReason);
    await page.goto(`${baseURL}/app/retreats/${retreatId}/minuto-a-minuto`);

    await page.getByRole('button', { name: 'Nueva actividad' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    await dialog.locator('input[placeholder^="Ej"]').fill('ZZE2E modal scroll');
    await dialog.locator('input[type="time"]').fill('09:00');
    const nums = dialog.locator('input[type="number"]');
    await nums.nth(0).fill('7'); // día 7 (lejos en la lista)
    await nums.nth(1).fill('15');
    await dialog.getByRole('button', { name: 'Crear' }).click();
    await expect(dialog).toBeHidden();

    // La actividad creada debe quedar resaltada (ring azul) — confirma scroll+highlight.
    const created = page
      .locator('[id^="schedule-item-"]')
      .filter({ hasText: 'ZZE2E modal scroll' });
    await expect(created).toHaveClass(/ring-blue-500/, { timeout: 5000 });

    // Cleanup: borrar el item creado vía API.
    const itemsRes = await api.get(`/api/schedule/retreats/${retreatId}/items`);
    const items = await itemsRes.json();
    const mk = (Array.isArray(items) ? items : []).find(
      (i: any) => i.name === 'ZZE2E modal scroll',
    );
    if (mk) {
      await api.delete(`/api/schedule/items/${mk.id}`, {
        headers: { 'X-CSRF-Token': csrf },
      });
    }
  });

  test('"Compactar día" cierra todos los huecos del día', async ({ baseURL }) => {
    test.skip(!!skipReason, skipReason);
    // 3 items aislados en Día 6 con huecos: 10:00 / 10:30 / 11:00 (dur 15 c/u).
    const hdr = { ...json, 'X-CSRF-Token': csrf };
    const mk = async (name: string, startISO: string) => {
      const r = await api.post(`/api/schedule/retreats/${retreatId}/items`, {
        data: { name, type: 'otro', day: 6, startTime: startISO, durationMinutes: 15 },
        headers: hdr,
      });
      return (await r.json()).id as string;
    };
    const ids = [
      await mk('ZZE2E C1', '2026-06-10T16:00:00.000Z'),
      await mk('ZZE2E C2', '2026-06-10T16:30:00.000Z'),
      await mk('ZZE2E C3', '2026-06-10T17:00:00.000Z'),
    ];
    try {
      await page.goto(`${baseURL}/app/retreats/${retreatId}/minuto-a-minuto`);
      const dia6 = page
        .locator('div.mb-8')
        .filter({ has: page.getByRole('heading', { name: /Día 6/ }) });
      // Hay huecos antes de compactar.
      await expect(dia6.getByText(/Hueco de/).first()).toBeVisible();

      page.once('dialog', (d) => d.accept()); // confirm() de Compactar día
      await dia6.getByRole('button', { name: /Compactar día/ }).click();

      // Tras compactar, no quedan huecos ni solapes en el día.
      await expect(dia6.getByText(/Hueco de/)).toHaveCount(0, { timeout: 5000 });
      await expect(dia6.getByText(/Se encima/)).toHaveCount(0);
    } finally {
      for (const id of ids) {
        await api.delete(`/api/schedule/items/${id}`, { headers: { 'X-CSRF-Token': csrf } });
      }
    }
  });
});
