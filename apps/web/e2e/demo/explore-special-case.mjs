// Exploración headless de la feature "Caso especial" (specs/special-case) para el
// video-demo: descubre selectores/contadores EN VIVO y saca screenshots de cada
// pantalla antes de escribir el guion. No muta nada (el diálogo solo se abre y
// se cancela).
//
//   cd apps/web && node e2e/demo/explore-special-case.mjs

import pw from '@playwright/test';
const { chromium } = pw;
import { loadEnv, maskRoute } from './demo-lib.mjs';

const cfg = loadEnv();
const BASE = cfg.baseUrl;
const RETREAT = process.env.RETREAT_ID || '4c8173c9-a068-4efe-a936-e3618523bead'; // San Agustín
const SHOTS = '/tmp/chrome';
const log = (...a) => console.log(...a);

async function loginWithRetries(browser, attempts = 3) {
  for (let i = 1; i <= attempts; i++) {
    const ctx = await browser.newContext({ locale: 'es-MX' });
    await ctx.addInitScript(() => localStorage.setItem('preferred-locale', 'es'));
    const p = await ctx.newPage();
    try {
      await p.goto(BASE + '/login', { waitUntil: 'domcontentloaded', timeout: 30000 });
      await p.fill('#email', cfg.email, { timeout: 10000 });
      await p.fill('#password', cfg.password);
      await p.press('#password', 'Enter');
      // La navegación post-login se cuelga en headless, pero las cookies de
      // sesión quedan asentadas: las capturamos y entramos por URL directa.
      await p.waitForTimeout(4000);
      const status = await p.evaluate(async () => {
        const r = await fetch('/api/auth/status', { credentials: 'include' });
        const j = await r.clone().json().catch(() => ({}));
        // Autenticado = 200 con usuario (sin campo authenticated:false), igual
        // que checkAuthStatus del authStore.
        return r.status === 200 && j.authenticated !== false && !!j.id;
      }).catch(() => false);
      if (!status) throw new Error('sesión no activa tras login');
      const state = await ctx.storageState();
      await ctx.close();
      return state;
    } catch (e) {
      log(`   login intento ${i} falló: ${e.message.split('\n')[0]}`);
      await ctx.close().catch(() => {});
      if (i === attempts) throw e;
      await new Promise((r) => setTimeout(r, 4000 * i));
    }
  }
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  log('🔐 login…');
  const state = await loginWithRetries(browser);

  const ctx = await browser.newContext({ storageState: state, locale: 'es-MX', viewport: { width: 1280, height: 800 } });
  await ctx.addInitScript(() => localStorage.setItem('preferred-locale', 'es'));
  const page = await ctx.newPage();
  await page.route('**/api/**', maskRoute);
  page.setDefaultTimeout(6000);
  page.setDefaultNavigationTimeout(30000);

  // ── Dashboard de San Agustín: ¿existe la tarjeta specialCases? ¿contador? ──
  await page.goto(`${BASE}/app/retreats/${RETREAT}/dashboard`, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(1500);
  const card = page.locator('#ds-section-specialCases');
  log(`dashboard: tarjeta specialCases visible=${await card.isVisible().catch(() => false)}`);
  const dashTxt = (await card.innerText().catch(() => '')).replace(/\n/g, ' | ');
  log(`dashboard tarjeta texto: ${dashTxt.slice(0, 300)}`);
  await page.screenshot({ path: `${SHOTS}/sc-01-dashboard.png`, fullPage: false });

  // ── Sidebar: sección Comunicaciones + item Casos especiales ──
  const secBtn = page.locator('button', { hasText: /^\s*Comunicaciones\s*$/i }).first();
  if ((await secBtn.getAttribute('aria-expanded').catch(() => null)) !== 'true') {
    await secBtn.click().catch(() => {});
    await page.waitForTimeout(500);
  }
  const item = page.getByRole('link', { name: /^Casos especiales/i }).first();
  log(`sidebar item "Casos especiales" visible=${await item.isVisible().catch(() => false)}`);
  const badge = item.locator('span, [class*="badge"]');
  log(`sidebar item innerText: ${(await item.innerText().catch(() => '')).replace(/\n/g, ' | ')}`);
  await page.screenshot({ path: `${SHOTS}/sc-02-sidebar.png` });

  // ── Palancas: toggles por fila ──
  // Hija de /app (sin :id); el retiro queda fijado por el goto al dashboard.
  await page.goto(`${BASE}/app/palancas`, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(2000);
  const toggles = page.locator('[data-testid="special-case-toggle"]');
  const nToggles = await toggles.count();
  log(`palancas: toggles special-case-toggle = ${nToggles}`);
  const badges = page.locator('[data-testid="special-case-badge"]');
  log(`palancas: badges ya marcados = ${await badges.count()}`);
  // ¿la sección de palancas tiene pestañas o filtro? log del encabezado de la vista
  const header = await page.locator('h1, h2').first().innerText().catch(() => '');
  log(`palancas header: ${header}`);
  if (nToggles > 0) {
    await toggles.first().scrollIntoViewIfNeeded().catch(() => {});
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${SHOTS}/sc-03-palancas.png` });
    // abrir el diálogo del primer toggle y capturarlo
    await toggles.first().click();
    await page.waitForTimeout(700);
    const dlg = page.locator('[role="dialog"], [data-testid="special-case-form"]').first();
    log(`diálogo abierto visible=${await dlg.isVisible().catch(() => false)}`);
    const dlgTxt = (await page.locator('[data-testid="special-case-form"]').innerText().catch(() => '')).replace(/\n/g, ' | ');
    log(`diálogo texto: ${dlgTxt.slice(0, 400)}`);
    const radios = page.locator('[role="dialog"] [role="radio"], [role="dialog"] input[type="radio"], [role="dialog"] label:has(input[type="radio"])');
    log(`diálogo radios = ${await radios.count()}`);
    await page.screenshot({ path: `${SHOTS}/sc-04-dialog.png` });
    // cancelar sin mutar
    const cancel = page.locator('[role="dialog"] button', { hasText: /cancelar|cerrar/i }).first();
    await cancel.click().catch(() => {});
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
  }

  // ── Bandeja special-cases ──
  await page.goto(`${BASE}/app/special-cases`, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(1500);
  const empty = page.locator('[data-testid="special-cases-empty"]');
  const rows = page.locator('[data-testid="special-case-row"]');
  log(`bandeja: vacía=${await empty.isVisible().catch(() => false)} rows=${await rows.count()}`);
  const cnt = await page.locator('[data-testid="special-cases-count"]').innerText().catch(() => '');
  log(`bandeja contador: ${cnt}`);
  await page.screenshot({ path: `${SHOTS}/sc-05-bandeja.png` });

  await browser.close();
  log('✅ exploración lista — revisá /tmp/chrome/sc-*.png');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
