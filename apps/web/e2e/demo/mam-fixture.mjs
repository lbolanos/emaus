// Fixture del retiro de demo para el Minuto a Minuto, vía el API (no toca sqlite).
//   MODE=materialize → importa una agenda fresca (baseDate=hoy → aparece la línea "AHORA").
//   MODE=clear       → borra TODA la agenda del retiro (lo deja como estaba: 0 items).
//
//   MODE=materialize node e2e/demo/mam-fixture.mjs
//   MODE=clear       node e2e/demo/mam-fixture.mjs
import pw from '@playwright/test';
const { chromium } = pw;
import { loadEnv } from './demo-lib.mjs';

const cfg = loadEnv();
const RETREAT = process.env.RETREAT_ID || '96f06c40-327a-4513-ae48-fb4c60bbab17'; // Celaya
const MODE = process.env.MODE || 'materialize';
const BASE_DATE = process.env.BASE_DATE || new Date().toISOString().slice(0, 10); // hoy

// Login robusto (reCAPTCHA/dev puede flaquear): reintenta hasta 3 veces.
export async function loginRobust(browser) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const p = await ctx.newPage();
    try {
      await p.goto(cfg.baseUrl + '/login', { waitUntil: 'networkidle' });
      await p.fill('#email', cfg.email);
      await p.fill('#password', cfg.password);
      await p.press('#password', 'Enter');
      await p.waitForURL(/\/app/, { timeout: 15000 });
      await p.waitForTimeout(1000);
      return { ctx, page: p };
    } catch {
      await ctx.close();
      if (attempt === 3) throw new Error('login falló tras 3 intentos');
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  try {
    const { ctx, page } = await loginRobust(browser);
    await page.goto(`${cfg.baseUrl}/app/retreats/${RETREAT}/minuto-a-minuto`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    if (MODE === 'clear') {
      // Varias pasadas: el token CSRF rota tras cada mutación; capturamos el
      // rotado (x-csrf-token-new) y re-fetch en 403. Repetimos hasta 0 items.
      let remaining = Infinity;
      for (let pass = 1; pass <= 5 && remaining !== 0; pass++) {
        remaining = await page.evaluate(async (retreatId) => {
          const getTok = async () => {
            const r = await fetch('/api/csrf-token', { credentials: 'include' });
            return r.headers.get('x-csrf-token') || (await r.json().catch(() => ({}))).csrfToken || '';
          };
          let token = await getTok();
          const items = await (await fetch(`/api/schedule/retreats/${retreatId}/items`, { credentials: 'include' })).json();
          for (const it of items) {
            let r = await fetch(`/api/schedule/items/${it.id}`, {
              method: 'DELETE', credentials: 'include', headers: { 'X-CSRF-Token': token },
            });
            if (r.status === 403) { token = await getTok(); r = await fetch(`/api/schedule/items/${it.id}`, { method: 'DELETE', credentials: 'include', headers: { 'X-CSRF-Token': token } }); }
            const nt = r.headers.get('x-csrf-token-new'); if (nt) token = nt;
          }
          const left = await (await fetch(`/api/schedule/retreats/${retreatId}/items`, { credentials: 'include' })).json();
          return left.length;
        }, RETREAT);
        console.log(`   pasada ${pass}: quedan ${remaining} items`);
      }
      console.log(remaining === 0 ? '🧹 Agenda borrada (0 items)' : `⚠︎ Quedan ${remaining} items`);
    } else {
      const emptyBtn = page.locator('button:has-text("Importar desde template")').first();
      if (await emptyBtn.count()) {
        await emptyBtn.click();
      } else {
        await page.locator('button[aria-haspopup="menu"]').last().click();
        await page.waitForTimeout(400);
        await page.locator('[role="menuitem"]:has-text("Importar desde template")').click();
      }
      await page.waitForTimeout(800);
      await page.fill('input[type="date"]', BASE_DATE).catch(() => {});
      await page.locator('input[type="checkbox"]').first().check().catch(() => {});
      await page.waitForTimeout(300);
      await page.locator('button:has-text("Importar")').last().click();
      await page.waitForTimeout(4000);
      await page.reload({ waitUntil: 'networkidle' });
      await page.waitForTimeout(1500);
      const rows = await page.locator('[id^="schedule-item-"]').count();
      console.log(`🌱 Agenda materializada (base ${BASE_DATE}) — ${rows} items`);
    }
    await ctx.close();
  } finally {
    await browser.close();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
