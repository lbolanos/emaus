// Headless exploration for the "edición rápida de teléfonos en Palancas" video.
// Logs live selectors (column, ✏, popover, dialog) with the network masked and
// takes screenshots to /tmp/chrome to confirm every interaction before recording.
//
//   cd apps/web && node e2e/demo/explore-quick-phones.mjs

import pw from '@playwright/test';
const { chromium } = pw;
import fs from 'node:fs';
import { loadEnv, maskRoute } from './demo-lib.mjs';

const cfg = loadEnv();
const BD = process.env.RETREAT_ID || 'e9b3c568-050a-4d66-a99d-305f287a59df'; // Buen Despacho (worktree DB)
const SHOTS = '/tmp/chrome/quick-phones';
fs.mkdirSync(SHOTS, { recursive: true });

const log = (...a) => console.log(...a);

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
  log('✅ login');

  const ctx = await browser.newContext({ storageState: state, viewport: { width: 1280, height: 800 }, locale: 'es-MX' });
  await ctx.addInitScript(() => localStorage.setItem('preferred-locale', 'es'));
  const page = await ctx.newPage();
  page.setDefaultTimeout(8000);
  page.setDefaultNavigationTimeout(30000);
  await page.route('**/api/**', maskRoute);

  // 1. Select the retreat and look at the sidebar
  await page.goto(`${cfg.baseUrl}/app/retreats/${BD}/responsibilities`, { waitUntil: 'networkidle' });
  await page.getByText('Responsabilidades del Retiro').first().waitFor().catch(() => log('⚠️ responsibilities header no apareció'));
  await page.waitForTimeout(1200);

  const comm = page.locator('button', { hasText: /^\s*Comunicaciones\s*$/i }).first();
  log('sidebar Comunicaciones visible:', await comm.isVisible().catch(() => false));
  const expanded = await comm.getAttribute('aria-expanded').catch(() => null);
  log('aria-expanded inicial:', expanded);
  if (expanded !== 'true') await comm.click().catch((e) => log('⚠️ click Comunicaciones:', e.message));
  await page.waitForTimeout(600);
  const palancasLink = page.getByText('Palancas', { exact: true }).first();
  log('link Palancas visible:', await palancasLink.isVisible().catch(() => false));
  await page.screenshot({ path: `${SHOTS}/01-sidebar.png` });

  // 2. Palancas view
  await palancasLink.click().catch((e) => log('⚠️ click Palancas:', e.message));
  await page.waitForURL(/\/app\/palancas/, { timeout: 15000 }).catch(() => log('⚠️ no navegó a /app/palancas'));
  await page.locator('tr.participant-row').first().waitFor({ timeout: 15000 }).catch(() => log('⚠️ sin filas'));
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${SHOTS}/02-palancas.png`, fullPage: false });

  // Celular column + per-row ✏
  const headers = await page.locator('th').allTextContents();
  log('TH:', JSON.stringify(headers));
  const pencils = page.locator('button[title="Editar teléfonos"]');
  log('✏ count:', await pencils.count());
  const firstRow = page.locator('tr.participant-row').first();
  log('primera fila texto:', (await firstRow.innerText()).replace(/\s+/g, ' ').slice(0, 220));

  // 3. Inline popover
  await firstRow.locator('button[title="Editar teléfonos"]').first().click().catch((e) => log('⚠️ click ✏:', e.message));
  await page.waitForTimeout(700);
  for (const id of ['qp-cellPhone', 'qp-emergencyContact1CellPhone', 'qp-emergencyContact2CellPhone']) {
    const inp = page.locator(`#${id}`);
    const label = page.locator(`label[for="${id}"]`);
    log(
      `${id}: input=${await inp.count() > 0 ? await inp.inputValue() : 'NO'} · label=${await label.count() > 0 ? await label.innerText() : 'NO'}`,
    );
  }
  const popSave = page.getByRole('button', { name: /^Guardar$/ });
  log('botones Guardar visibles con popover abierto:', await popSave.count());
  await page.screenshot({ path: `${SHOTS}/03-popover.png` });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);

  // 4. Gestionar Palancas dialog → header ✏
  await firstRow.locator('button:has(svg.lucide-square-pen-icon)').first().click().catch((e) => log('⚠️ click editar fila:', e.message));
  await page.getByRole('dialog').waitFor({ timeout: 8000 }).catch(() => log('⚠️ diálogo no abrió'));
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${SHOTS}/04-dialog.png` });
  const dlgPencil = page.getByRole('dialog').locator('button[title="Editar teléfonos"]').first();
  log('✏ del diálogo visible:', await dlgPencil.isVisible().catch(() => false));
  const dlgHeader = await page.getByRole('dialog').innerText().catch(() => '');
  log('header diálogo (primeros 300):', dlgHeader.replace(/\s+/g, ' ').slice(0, 300));
  await dlgPencil.click().catch((e) => log('⚠️ click ✏ diálogo:', e.message));
  await page.waitForTimeout(700);
  const dlgCell = page.locator('#qp-cellPhone');
  log('popover diálogo, #qp-cellPhone =', await dlgCell.count() > 0 ? await dlgCell.inputValue() : 'NO');
  await page.screenshot({ path: `${SHOTS}/05-dialog-popover.png` });
  log('botones Guardar (popover+diálogo):', await popSave.count());
  await page.keyboard.press('Escape').catch(() => {});
  await page.waitForTimeout(400);
  await page.keyboard.press('Escape').catch(() => {});
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${SHOTS}/06-closed.png` });

  await browser.close();
  log('✅ exploración completa');
}
main().catch((e) => { console.error(e); process.exit(1); });
