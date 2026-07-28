// Verificación HEADLESS del sandbox de "Familia Emaús": navega las 5 pantallas con los datos
// ficticios instalados, saca screenshots a /tmp/chrome y ESCANEA PII real en el texto renderizado.
//   cd apps/web && node e2e/demo/verify-social.mjs
import pw from '@playwright/test';
const { chromium } = pw;
import { loadEnv } from './demo-lib.mjs';
import { installSocialSandbox } from './social-sandbox.mjs';

const cfg = loadEnv();
const W = 1280, H = 800;
const SHOT = '/tmp/chrome';
// Términos que NO deben aparecer nunca en el texto visible (PII real del dueño / dominios reales).
const FORBIDDEN = [/leonardo/i, /bola[ñn]os/i, /gmail\.com/i, /@cariai/i];

async function scan(page, name) {
  const body = (await page.locator('body').innerText().catch(() => '')) || '';
  const hits = FORBIDDEN.filter((re) => re.test(body)).map((re) => re.source);
  if (hits.length) console.log(`  ⛔ PII en ${name}: ${hits.join(', ')}`);
  else console.log(`  ✅ ${name}: sin PII real`);
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const auth = await browser.newContext({ viewport: { width: W, height: H }, locale: 'es-MX' });
  const ap = await auth.newPage();
  await ap.goto(cfg.baseUrl + '/login', { waitUntil: 'networkidle' });
  await ap.fill('#email', cfg.email); await ap.fill('#password', cfg.password);
  await ap.press('#password', 'Enter'); await ap.waitForURL(/\/app/, { timeout: 20000 });
  await ap.waitForTimeout(1500);
  const state = await auth.storageState(); await auth.close();

  const ctx = await browser.newContext({ storageState: state, viewport: { width: W, height: H }, locale: 'es-MX' });
  await ctx.addInitScript(() => localStorage.setItem('preferred-locale', 'es'));
  const page = await ctx.newPage();
  page.setDefaultTimeout(8000);
  await installSocialSandbox(page);

  const shot = (n) => page.screenshot({ path: `${SHOT}/vsocial-${n}.png`, fullPage: true }).catch(() => {});

  // 1. Mi Perfil
  console.log('\n=== Mi Perfil ===');
  await page.goto(cfg.baseUrl + '/app/profile', { waitUntil: 'networkidle' }).catch(() => {});
  await page.getByText(/Mi Perfil/i).first().waitFor({ timeout: 6000 }).catch(() => {});
  await page.waitForTimeout(1500); await shot('profile'); await scan(page, 'profile');

  // 2. Buscar Hermanos (con término)
  console.log('=== Buscar Hermanos ===');
  await page.goto(cfg.baseUrl + '/app/social/search', { waitUntil: 'networkidle' }).catch(() => {});
  await page.locator('input[type="text"]').first().fill('a').catch(() => {});
  await page.locator('input[type="text"]').first().press('Enter').catch(() => {});
  await page.waitForTimeout(2000); await shot('search'); await scan(page, 'search');

  // 3. Hermanos (+ tab Pendientes)
  console.log('=== Hermanos ===');
  await page.goto(cfg.baseUrl + '/app/social/friends', { waitUntil: 'networkidle' }).catch(() => {});
  await page.waitForTimeout(1500); await shot('friends'); await scan(page, 'friends');
  await page.getByRole('tab', { name: /Pendientes/i }).first().click().catch(() => {});
  await page.waitForTimeout(1000); await shot('friends-pending'); await scan(page, 'friends-pending');

  // 4. Seguidores
  console.log('=== Seguidores ===');
  await page.goto(cfg.baseUrl + '/app/social/followers', { waitUntil: 'networkidle' }).catch(() => {});
  await page.waitForTimeout(1500); await shot('followers'); await scan(page, 'followers');

  // 5. Testimonios (+ formulario Nuevo testimonio)
  console.log('=== Testimonios ===');
  await page.goto(cfg.baseUrl + '/app/testimonials', { waitUntil: 'networkidle' }).catch(() => {});
  await page.waitForTimeout(1500); await shot('testimonials'); await scan(page, 'testimonials');
  await page.getByRole('button', { name: /Nuevo testimonio/i }).first().click().catch(() => {});
  await page.waitForTimeout(1000); await shot('testimonial-form'); await scan(page, 'testimonial-form');

  await ctx.close(); await browser.close();
  console.log('\n✅ Verificación lista. Screenshots en /tmp/chrome/vsocial-*.png');
}
main().catch((e) => { console.error(e); process.exit(1); });
