// Re-materializa las tareas Pre-Retiro de un retiro desde el template (modo
// "Reemplazar todo"), vía el flujo real del API. Se usa para:
//   1) dejar el retiro de demo en un estado limpio y poblado antes de grabar, y
//   2) resetear las mutaciones que hace la grabación (marcar/asignar) después.
//
// NO toca sqlite directamente: usa la UI/endpoint materialize (camino probado),
// evitando el peligro de backup/restore por CLI sobre una DB en WAL viva.
//
//   RETREAT_ID=<uuid> node e2e/demo/reset-tasks.mjs
import pw from '@playwright/test';
const { chromium } = pw;
import { loadEnv } from './demo-lib.mjs';

const cfg = loadEnv();
const RETREAT = process.env.RETREAT_ID || '96f06c40-327a-4513-ae48-fb4c60bbab17'; // Celaya

const browser = await chromium.launch({ headless: true });
try {
  const a = await browser.newContext();
  const p = await a.newPage();
  await p.goto(cfg.baseUrl + '/login', { waitUntil: 'networkidle' });
  await p.fill('#email', cfg.email);
  await p.fill('#password', cfg.password);
  await p.press('#password', 'Enter'); // robusto vs idioma del botón
  await p.waitForURL(/\/app/, { timeout: 20000 });
  await p.waitForTimeout(1200);
  const state = await a.storageState();
  await a.close();

  const b = await browser.newContext({ storageState: state, viewport: { width: 1280, height: 800 } });
  const page = await b.newPage();
  await page.goto(`${cfg.baseUrl}/app/retreats/${RETREAT}/tareas-pre-retiro`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  const emptyBtn = page.locator('[data-testid="import-empty"]');
  const headerBtn = page.locator('[data-testid="import-template"]');
  if (await emptyBtn.count()) await emptyBtn.click();
  else await headerBtn.click();
  await page.waitForTimeout(800);
  await page.locator('input[type="radio"][value="replace"]').check().catch(() => {});
  await page.waitForTimeout(300);
  await page.locator('button:has-text("Importar")').last().click();
  await page.waitForTimeout(3500);

  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  const cards = await page.locator('[data-testid^="task-"]').count();
  console.log('✔ Celaya re-materializado —', cards, 'tarjetas raíz');
} finally {
  await browser.close();
}
