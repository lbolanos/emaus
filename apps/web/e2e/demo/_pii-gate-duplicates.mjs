// Puerta de PII del video de duplicados de comunidad.
//
// Recorre las MISMAS pantallas que record-duplicates.mjs (Miembros → diálogo
// Duplicados → preview) con el enmascarado ACTIVO y afirma que ningún nombre
// completo, correo ni teléfono REAL aparece en el texto de la página. Decide si
// el video puede publicarse.
//
//   cd apps/web && node e2e/demo/_pii-gate-duplicates.mjs
//   → sale 0 si está limpio, 1 con la lista de fugas.
//
// La PII a vigilar NO sale del sqlite (la dev corre en WAL con el API encima):
// sale de los mismos endpoints que consume el video, vía ctx.request (que no
// pasa por page.route y llega cruda). Se vigilan los members (overlay incluido)
// y los participantes de los pares — que incluyen fichas de retiro no-member.
//
// Antes de fiarse de un verde: correr con NO_MASK=1 (enmascarado desactivado)
// y comprobar que detecta fugas.
import pw from '@playwright/test';
const { chromium } = pw;
import { loadEnv, maskRoute } from './demo-lib.mjs';

const cfg = loadEnv();
const CID = 'f1060047-5305-4f75-89c4-a649e449975e';
const NO_MASK = process.env.NO_MASK === '1';
const log = (...a) => console.log(...a);

// ── PII real: members (overlay incluido) + participantes de los pares ──
const b = await chromium.launch({ headless: true });

let state;
for (let attempt = 1; attempt <= 3; attempt++) {
  const auth = await b.newContext({ viewport: { width: 1280, height: 800 }, locale: 'es-MX' });
  const ap = await auth.newPage();
  try {
    await ap.goto(cfg.baseUrl + '/login', { waitUntil: 'networkidle' });
    await ap.fill('#email', cfg.email);
    await ap.fill('#password', cfg.password);
    await ap.press('#password', 'Enter');
    await ap.waitForURL(/\/app/, { timeout: 20000 });
    await ap.waitForTimeout(1200);
    state = await auth.storageState();
    await auth.close();
    break;
  } catch (e) {
    await auth.close();
    if (attempt === 3) throw e;
    await new Promise((r) => setTimeout(r, 2000));
  }
}

const ctx = await b.newContext({ storageState: state, viewport: { width: 1280, height: 800 }, locale: 'es-MX' });
await ctx.addInitScript(() => localStorage.setItem('preferred-locale', 'es'));

const nombres = new Set();
const correos = new Set();
const tels = new Set();
const fullNameOf = (p) => `${(p.firstName ?? '').trim()} ${(p.lastName ?? '').trim()}`.replace(/\s+/g, ' ').trim();
const harvest = (p) => {
  if (!p) return;
  const full = fullNameOf(p);
  if (full.length > 8 && full.split(' ').length >= 2) nombres.add(full);
  if (p.email && p.email.includes('@')) correos.add(p.email.toLowerCase());
  if (p.cellPhone) {
    const d = String(p.cellPhone).replace(/\D/g, '');
    if (d.length >= 10) tels.add(d);
  }
};

const membersResp = await ctx.request.get(`${cfg.baseUrl}/api/communities/${CID}/members`);
if (membersResp.ok()) {
  const members = await membersResp.json();
  const list = Array.isArray(members) ? members : members.data ?? members.members ?? [];
  for (const m of list) {
    harvest(m); // overlay (firstName/lastName/email/cellPhone del member)
    harvest(m.participant); // ficha global
  }
  log(`members: ${list.length}`);
} else {
  log(`⚠ GET members → ${membersResp.status()}`);
}

const dupResp = await ctx.request.get(`${cfg.baseUrl}/api/communities/${CID}/duplicates`);
if (dupResp.ok()) {
  const pairs = await dupResp.json();
  for (const pair of pairs ?? []) for (const p of pair.participants ?? []) harvest(p);
  log(`pares: ${pairs?.length ?? 0}`);
} else {
  log(`⚠ GET duplicates → ${dupResp.status()}`);
}

// ── Recorrido con el MISMO enmascarado del video ──
const p = await ctx.newPage();
p.setDefaultTimeout(8000);
p.setDefaultNavigationTimeout(30000);
if (!NO_MASK) await p.route('**/api/**', maskRoute);

const muestras = [];
await p.goto(`${cfg.baseUrl}/app/communities/${CID}/members`, { waitUntil: 'networkidle' });
await p.getByRole('button', { name: /Duplicados/ }).first().waitFor({ timeout: 10000 }).catch(() => {});
await p.waitForTimeout(1500);
muestras.push(['miembros (fondo)', await p.evaluate(() => document.body.innerText)]);

await p.getByRole('button', { name: /Duplicados/ }).first().click().catch(() => {});
await p.getByRole('dialog').waitFor({ timeout: 8000 }).catch(() => {});
await p.waitForTimeout(1500);
muestras.push(['diálogo pares', await p.evaluate(() => document.body.innerText)]);

await p.getByRole('button', { name: 'Ver qué se movería' }).first().click().catch(() => {});
await p.waitForTimeout(1500);
muestras.push(['preview', await p.evaluate(() => document.body.innerText)]);

await b.close();

let fugas = 0;
for (const [donde, texto] of muestras) {
  const plano = texto.replace(/\s+/g, ' ');
  const digitos = plano.replace(/\D/g, '');
  for (const nombre of nombres) if (plano.includes(nombre)) { console.log(`❌ ${donde}: NOMBRE real "${nombre}"`); fugas++; }
  for (const c of correos) if (plano.toLowerCase().includes(c)) { console.log(`❌ ${donde}: CORREO real "${c}"`); fugas++; }
  for (const t of tels) if (digitos.includes(t)) { console.log(`❌ ${donde}: TELÉFONO real "${t}"`); fugas++; }
}
console.log(`\n[${NO_MASK ? 'SIN enmascarar (prueba negativa)' : 'enmascarado'}] pantallas: ${muestras.length} | nombres completos: ${nombres.size} | correos: ${correos.size} | teléfonos: ${tels.size}`);
console.log(fugas === 0 ? '✅ SIN FUGAS DE PII' : `❌ ${fugas} FUGAS — NO PUBLICAR`);
process.exit(fugas === 0 ? 0 : 1);
