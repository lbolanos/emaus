// Headless smoke of the record-quick-phones.mjs script: validates live (with the
// same anti-mutation interceptor) that each interactive beat does what the script
// narrates. Logs ✅/❌ per step; no screenshots unless it errors.
//
//   cd apps/web && node e2e/demo/smoke-quick-phones.mjs

import pw from '@playwright/test';
const { chromium } = pw;
import path from 'node:path';
import { loadEnv, maskRoute, OUTPUT_DIR } from './demo-lib.mjs';

const cfg = loadEnv();
const BD = process.env.RETREAT_ID || 'e9b3c568-050a-4d66-a99d-305f287a59df';

const log = (...a) => console.log(...a);
const sleep = (page, ms) => page.waitForTimeout(ms);
let fails = 0;
const check = (name, ok, extra = '') => {
  if (!ok) fails++;
  log(`${ok ? '✅' : '❌'} ${name}${extra ? ` — ${extra}` : ''}`);
};

async function main() {
  const browser = await chromium.launch({ headless: true });

  // Login with retries (reCAPTCHA/rate-limit) → storageState
  let state;
  for (let attempt = 1; attempt <= 3; attempt++) {
    const auth = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: 'es-MX' });
    const ap = await auth.newPage();
    try {
      await ap.goto(cfg.baseUrl + '/login', { waitUntil: 'networkidle' });
      await ap.fill('#email', cfg.email);
      await ap.fill('#password', cfg.password);
      await ap.press('#password', 'Enter');
      await ap.waitForURL(/\/app/, { timeout: 20000 });
      await ap.waitForTimeout(1500);
      state = await auth.storageState();
      await auth.close();
      break;
    } catch (e) {
      await auth.close();
      if (attempt === 3) throw e;
      await new Promise((r) => setTimeout(r, 2000));
    }
  }

  const ctx = await browser.newContext({ storageState: state, viewport: { width: 1280, height: 800 }, locale: 'es-MX' });
  await ctx.addInitScript(() => localStorage.setItem('preferred-locale', 'es'));
  const page = await ctx.newPage();
  page.setDefaultTimeout(6000);
  page.setDefaultNavigationTimeout(30000);
  await page.route('**/api/**', maskRoute);

  // Same anti-mutation interceptor as the record script
  const FIELDS = ['cellPhone', 'emergencyContact1CellPhone', 'emergencyContact2CellPhone'];
  const canon = (v) => v.replace(/\D/g, '').replace(/^(52|044|045)/, '');
  const phonesState = { cellPhone: '5500661804', emergencyContact1CellPhone: '5500836454', emergencyContact2CellPhone: '5500723755' };
  let patchCalls = 0;
  await page.route('**/api/participants/*/phones', async (route) => {
    if (route.request().method() !== 'PATCH') return route.fallback();
    patchCalls++;
    let body = {};
    try { body = route.request().postDataJSON() || {}; } catch {}
    for (const f of FIELDS) if (typeof body[f] === 'string') phonesState[f] = body[f] === '' ? null : canon(body[f]);
    const id = (route.request().url().match(/participants\/([^/]+)\/phones/) || [])[1] || '';
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id, ...phonesState }) });
  });

  // --- Beat 1: sidebar → Palancas
  await page.goto(`${cfg.baseUrl}/app/retreats/${BD}/responsibilities`, { waitUntil: 'networkidle' });
  await page.getByText('Responsabilidades del Retiro').first().waitFor({ timeout: 15000 }).catch(() => {});
  await sleep(page, 1200);
  const comm = page.locator('button', { hasText: /^\s*Comunicaciones\s*$/i }).first();
  if ((await comm.getAttribute('aria-expanded').catch(() => null)) !== 'true') await comm.click().catch(() => {});
  await sleep(page, 700);
  const palancasLink = page.getByText('Palancas', { exact: true }).first();
  check('link Palancas visible en sidebar', await palancasLink.isVisible().catch(() => false));
  await palancasLink.click().catch(() => {});
  await page.waitForURL(/\/app\/palancas/, { timeout: 15000 }).catch(() => {});
  await page.locator('tr.participant-row').first().waitFor({ timeout: 15000 }).catch(() => {});
  await page.waitForLoadState('networkidle', { timeout: 2000 }).catch(() => {});
  await sleep(page, 1200);
  check('navegó a /app/palancas', /\/app\/palancas/.test(page.url()), page.url());

  const firstRow = page.locator('tr.participant-row').first();
  const rowTextBefore = (await firstRow.innerText().catch(() => '')).replace(/\s+/g, ' ');
  check('fila muestra celular fake inicial', /5500661804/.test(rowTextBefore), rowTextBefore.slice(0, 120));

  // --- Beat 3-4: ✏ → popover
  await firstRow.locator('button[title="Editar teléfonos"]').first().click().catch(() => {});
  await sleep(page, 700);
  const qpCell = page.locator('#qp-cellPhone');
  check('popover tabla abre seeded', (await qpCell.count().catch(() => 0)) > 0, await qpCell.inputValue().catch(() => 'NO'));

  // --- Beat 5: fill +52
  await qpCell.fill('+52 5500 123 456').catch(() => {});
  await sleep(page, 400);

  // --- Beat 6: Save → row updated WITHOUT reload
  await page.getByRole('button', { name: /^Guardar$/ }).first().click().catch(() => {});
  await sleep(page, 900);
  const rowTextAfter = (await firstRow.innerText().catch(() => '')).replace(/\s+/g, ' ');
  check('PATCH interceptado (x1, DB intacta)', patchCalls === 1, `calls=${patchCalls}`);
  check('fila muestra 5500123456 tras guardar', /5500123456/.test(rowTextAfter), rowTextAfter.slice(0, 120));
  check('popover se cerró tras guardar', (await qpCell.count().catch(() => 0)) === 0);

  // --- Beat 7: invalid 123 → visible error, no request
  await firstRow.locator('button[title="Editar teléfonos"]').first().click().catch(() => {});
  await sleep(page, 700);
  await page.locator('#qp-cellPhone').fill('123').catch(() => {});
  await sleep(page, 300);
  await page.getByRole('button', { name: /^Guardar$/ }).first().click().catch(() => {});
  await sleep(page, 700);
  const popText = await page.locator('#qp-cellPhone').locator('xpath=ancestor::*[contains(@class,"absolute") or contains(@class,"popover")][1]').innerText().catch(() => '');
  const bodyText = await page.locator('body').innerText().catch(() => '');
  const errMsg = /inv[lá]lid|10 d[ií]gitos|formato/.test(popText + ' ' + bodyText);
  check('número inválido muestra mensaje de error', errMsg);
  check('sin PATCH extra por el inválido', patchCalls === 1, `calls=${patchCalls}`);
  // @keydown.esc lives on the inputs: re-focus before Escape
  await page.locator('#qp-cellPhone').focus().catch(() => {});
  await page.keyboard.press('Escape').catch(() => {});
  await sleep(page, 600);
  check('Escape cerró el popover', (await qpCell.count().catch(() => 0)) === 0);

  // --- Beat 8: dialog
  await firstRow.locator('button:has(svg.lucide-square-pen-icon)').first().click().catch(() => {});
  await page.getByRole('dialog').waitFor({ timeout: 8000 }).catch(() => {});
  await sleep(page, 1200);
  const dlg = page.getByRole('dialog');
  check('diálogo Gestionar Palancas abre', (await dlg.count().catch(() => 0)) > 0);

  // EC collapsible: open ⇔ the EC values (5500…) are visible (the title always says "emergencia")
  const ecVisible = async () => (await dlg.getByText(/5500836454|5500723755/).count().catch(() => 0)) > 0;
  if (!(await ecVisible())) {
    await dlg.locator('button', { hasText: /datos de contacto y emergencia/i }).first().click().catch(() => {});
    await sleep(page, 600);
  }
  check('colapsable EC abierto (valores 5500 visibles)', await ecVisible());

  // --- Beat 9-10: dialog popover → EC2 → save → card refreshes
  const dlgPencil = dlg.locator('button[title="Editar teléfonos"]').first();
  await dlgPencil.click().catch(() => {});
  await sleep(page, 700);
  const qpEc2 = page.locator('#qp-emergencyContact2CellPhone');
  check('popover diálogo abre seeded', (await qpEc2.count().catch(() => 0)) > 0, await qpEc2.inputValue().catch(() => 'NO'));
  await qpEc2.fill('5500998877').catch(() => {});
  await sleep(page, 400);
  const savesBefore = (await page.getByRole('button', { name: /^Guardar$/ }).count().catch(() => 0));
  log(`ℹ️ botones Guardar con popover abierto: ${savesBefore} (esperados 2)`);
  await page.getByRole('button', { name: /^Guardar$/ }).first().click().catch(() => {});
  await sleep(page, 900);
  check('PATCH interceptado (x2)', patchCalls === 2, `calls=${patchCalls}`);
  const dlgTextAfter = (await dlg.innerText().catch(() => '')).replace(/\s+/g, ' ');
  check('diálogo refresca EC2=5500998877 en caliente', /5500998877/.test(dlgTextAfter), dlgTextAfter.slice(0, 160));

  await page.keyboard.press('Escape').catch(() => {});
  await sleep(page, 500);
  await page.keyboard.press('Escape').catch(() => {});
  await sleep(page, 600);
  check('Escape cerró diálogo', (await dlg.count().catch(() => 0)) === 0);

  await browser.close();
  if (fails > 0) {
    log(`❌ ${fails} checks fallaron`);
    process.exit(1);
  }
  log('✅ smoke completo: guion viable para la toma headed');
}
main().catch((e) => { console.error(e); process.exit(1); });
