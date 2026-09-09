// Puerta de PII del video de Seguimiento de caminantes.
//
// Replica las rutas del script de grabación, recorre las MISMAS pantallas y
// afirma que ningún nombre completo, correo ni teléfono REAL de la base aparece
// en el texto de la página. Es la comprobación que decide si el video puede
// publicarse — revisar tres frames a ojo no basta: el hilo del historial tiene
// decenas de eventos y el leak de 2026-08-22 (video retirado por YouTube) se
// colaba en un solo segundo.
//
//   cd apps/web && node e2e/demo/_pii-gate.mjs
//   → sale 0 si está limpio, 1 con la lista de fugas.
//
// La lista de PII a vigilar la saca del sqlite del worktree. Ojo: compara
// nombres COMPLETOS, porque un nombre de pila suelto ("Carlos", "Luis") también
// existe en el catálogo de nombres falsos y daría falsos positivos.
//
// Antes de fiarse de un verde: correrla con el enmascarado desactivado y
// comprobar que detecta fugas (con la red quitada da ~318).
import pw from '@playwright/test';
const { chromium } = pw;
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { loadEnv, maskRoute, maskNode } from './demo-lib.mjs';

const cfg = loadEnv();
const SAN_AGUSTIN = '4c8173c9-a068-4efe-a936-e3618523bead';
const DB = process.env.DEMO_DB
  || path.resolve(process.cwd(), '../api/database.worktree.sqlite');

const q = (sql) =>
  execFileSync('sqlite3', [DB, sql], { encoding: 'utf8' })
    .split('\n').map((r) => r.trim()).filter(Boolean);

const DEL_RETIRO = `JOIN retreat_participants rp ON rp.participantId = p.id
  JOIN retreat r ON r.id = rp.retreatId WHERE r.id = '${SAN_AGUSTIN}'`;

const reales = [
  ...q(`SELECT DISTINCT TRIM(p.firstName)||' '||TRIM(p.lastName) FROM participants p ${DEL_RETIRO}
        AND p.firstName IS NOT NULL AND p.lastName IS NOT NULL AND LENGTH(TRIM(p.lastName)) > 3;`),
  ...q(`SELECT DISTINCT TRIM(p.emergencyContact1Name) FROM participants p ${DEL_RETIRO}
        AND p.emergencyContact1Name IS NOT NULL AND LENGTH(TRIM(p.emergencyContact1Name)) > 8;`),
].filter((s) => s.length > 8);
const correos = q(`SELECT DISTINCT LOWER(TRIM(p.email)) FROM participants p ${DEL_RETIRO}
  AND p.email LIKE '%@%';`);
const tels = q(`SELECT DISTINCT p.cellPhone FROM participants p ${DEL_RETIRO}
  AND p.cellPhone IS NOT NULL;`).map((s) => s.replace(/\D/g, '')).filter((s) => s.length >= 10);

const b = await chromium.launch({ headless: true });
const ctx = await b.newContext({ viewport: { width: 1280, height: 800 }, locale: 'es-MX' });
await ctx.addInitScript(() => localStorage.setItem('preferred-locale', 'es'));
const p = await ctx.newPage();
p.setDefaultTimeout(8000);
p.setDefaultNavigationTimeout(30000);

await p.goto(`${cfg.baseUrl}/login`);
await p.fill('#email', cfg.email);
await p.fill('#password', cfg.password);
await p.press('#password', 'Enter');
await p.waitForURL(/\/app\//, { timeout: 20000 });

// MISMAS rutas que la grabación.
await p.route('**/api/**', maskRoute);
const CUERPOS = ['Hola, te confirmo que ya está apartado tu lugar para el retiro. Nos vemos pronto.'];
await p.route('**/api/crm/**/timeline', async (route) => {
  try {
    const resp = await route.fetch();
    const data = await resp.json();
    maskNode(data);
    if (Array.isArray(data)) data.forEach((e, i) => {
      if ((e.type === 'message' || e.type === 'message_scheduled') && e.detail) e.detail = CUERPOS[0];
      if (e.meta && typeof e.meta.subject === 'string' && e.meta.subject) e.meta.subject = 'Mensaje del retiro';
    });
    return route.fulfill({ response: resp, body: JSON.stringify(data) });
  } catch { return route.continue(); }
});

const muestras = [];
await p.goto(`${cfg.baseUrl}/app/retreats/${SAN_AGUSTIN}/dashboard`, { waitUntil: 'networkidle' });
await p.goto(`${cfg.baseUrl}/app/follow-up`, { waitUntil: 'networkidle' });
await p.waitForTimeout(2000);
muestras.push(['tablero', await p.evaluate(() => document.body.innerText)]);

// Abrir el panel de varias tarjetas (el hilo es lo más expuesto).
const cards = p.locator('section').first().locator('[draggable="true"]');
const n = Math.min(await cards.count(), 5);
for (let i = 0; i < n; i++) {
  await cards.nth(i).click().catch(() => {});
  await p.locator('div.fixed.inset-0.z-50 aside').waitFor({ timeout: 6000 }).catch(() => {});
  await p.waitForTimeout(900);
  muestras.push([`panel ${i}`, await p.evaluate(() => document.body.innerText)]);
  await p.locator('div.fixed.inset-0.z-50 aside header button').click().catch(() => {});
  await p.waitForTimeout(400);
}
await b.close();

let fugas = 0;
for (const [donde, texto] of muestras) {
  const plano = texto.replace(/\s+/g, ' ');
  const digitos = plano.replace(/\D/g, '');
  for (const nombre of reales) if (plano.includes(nombre)) { console.log(`❌ ${donde}: NOMBRE real "${nombre}"`); fugas++; }
  for (const c of correos) if (plano.toLowerCase().includes(c)) { console.log(`❌ ${donde}: CORREO real "${c}"`); fugas++; }
  for (const t of tels) if (digitos.includes(t)) { console.log(`❌ ${donde}: TELÉFONO real "${t}"`); fugas++; }
}
console.log(`\nPantallas revisadas: ${muestras.length} | nombres completos: ${reales.length} | correos: ${correos.length} | teléfonos: ${tels.length}`);
console.log(fugas === 0 ? '✅ SIN FUGAS DE PII' : `❌ ${fugas} FUGAS — NO PUBLICAR`);
process.exit(fugas === 0 ? 0 : 1);
