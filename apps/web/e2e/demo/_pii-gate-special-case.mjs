// Puerta de PII del video "Casos especiales".
//
// Adaptación de _pii-gate.mjs (video de Seguimiento): replica las rutas del
// script de grabación (record-special-case.mjs), recorre las MISMAS pantallas
// —dashboard, Palancas con el diálogo de marca abierto, bandeja— y afirma que
// ningún nombre completo, correo ni teléfono REAL de la base aparece en el
// texto de la página. Decide si el video puede publicarse.
//
//   cd apps/web && node e2e/demo/_pii-gate-special-case.mjs
//   → sale 0 si está limpio, 1 con la lista de fugas.
//
// Lee una COPIA de la DB del checkout principal (nunca la viva en WAL):
// la copia a /tmp con sus 3 archivos es el patrón de reference_lookup_dev_db.
//
// Antes de fiarse de un verde: correrla con el enmascarado desactivado y
// comprobar que detecta fugas (ver _pii-gate.mjs).

import pw from '@playwright/test';
const { chromium } = pw;
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { loadEnv, maskRoute } from './demo-lib.mjs';

const cfg = loadEnv();
const SAN_AGUSTIN = '4c8173c9-a068-4efe-a936-e3618523bead';
const SRC = path.resolve(process.cwd(), '../api/database.sqlite');
const DB = '/tmp/emaus-pii-gate-special-case.sqlite';
for (const ext of ['', '-wal', '-shm']) {
  if (existsSync(SRC + ext)) copyFileSync(SRC + ext, DB + ext);
}

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
const ctx0 = await b.newContext({ locale: 'es-MX' });
await ctx0.addInitScript(() => localStorage.setItem('preferred-locale', 'es'));
const p0 = await ctx0.newPage();
await p0.goto(`${cfg.baseUrl}/login`, { waitUntil: 'domcontentloaded' });
await p0.fill('#email', cfg.email);
await p0.fill('#password', cfg.password);
await p0.press('#password', 'Enter');
await p0.waitForTimeout(4000);
const state = await ctx0.storageState();
await ctx0.close();

const ctx = await b.newContext({ storageState: state, viewport: { width: 1280, height: 800 }, locale: 'es-MX' });
await ctx.addInitScript(() => localStorage.setItem('preferred-locale', 'es'));
const p = await ctx.newPage();
p.setDefaultTimeout(8000);
p.setDefaultNavigationTimeout(30000);
await p.route('**/api/**', maskRoute);

const muestras = [];
const snap = async (donde) => muestras.push([donde, await p.evaluate(() => document.body.innerText)]);

// MISMAS rutas que la grabación.
await p.goto(`${cfg.baseUrl}/app/retreats/${SAN_AGUSTIN}/dashboard`, { waitUntil: 'networkidle' });
await p.waitForTimeout(1500);
await snap('dashboard');

await p.goto(`${cfg.baseUrl}/app/palancas`, { waitUntil: 'networkidle' });
await p.waitForSelector('[data-testid="special-case-toggle"]', { timeout: 12000 }).catch(() => {});
await p.waitForTimeout(1500);
await snap('palancas');

// El diálogo de marca muestra el nombre del caminante (markDescription {name}).
await p.locator('[data-testid="special-case-toggle"]').first().click().catch(() => {});
await p.waitForTimeout(900);
await snap('diálogo de marca');
await p.keyboard.press('Escape');
await p.waitForTimeout(400);

await p.goto(`${cfg.baseUrl}/app/special-cases`, { waitUntil: 'networkidle' });
await p.waitForTimeout(1500);
await snap('bandeja');
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
