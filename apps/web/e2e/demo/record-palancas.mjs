// Video-demo narrado: "El equipo de Palancas: cómo hacen su labor".
//
// Usa el retiro REAL San Agustín (datos completos: palanqueros asignados, palancas solicitadas/
// recibidas). Solo ENMASCARA nombres (PII), incluido el nombre dentro del label "Palanquero N (…)".
// No muta: navegar + abrir dialogs/modal en solo lectura (Cancelar), sin enviar mensajes.
//
//   cd apps/web && node e2e/demo/record-palancas.mjs

import pw from '@playwright/test';
const { chromium } = pw;
import path from 'node:path';
import {
  loadEnv, ensureOutputDir, genTts, OVERLAY_INIT, Narrator, muxVideo,
  computeSyncScale, audioDuration, buildYoutubeChapters, writeVideoMeta, OUTPUT_DIR,
} from './demo-lib.mjs';

const cfg = loadEnv();
const W = 1280, H = 800;
const SYNC_OFFSET_MS = 0;
const OVERLAY = OVERLAY_INIT.replace('✝ Emaús · Tareas Pre-Retiro', '✝ Emaús · Palancas');
const SA = process.env.RETREAT_ID || '4c8173c9-a068-4efe-a936-e3618523bead';

// ── Enmascarado de nombres (determinista) ──
const FF = ['María', 'José', 'Lucía', 'Miguel', 'Ana', 'Carlos', 'Sofía', 'Diego', 'Laura', 'Pedro',
  'Elena', 'Jorge', 'Paula', 'Andrés', 'Rosa', 'Luis', 'Marta', 'Pablo', 'Clara', 'Raúl',
  'Silvia', 'Hugo', 'Nadia', 'Iván', 'Gloria', 'Tomás', 'Irene', 'Óscar', 'Beatriz', 'Víctor'];
const FL = ['González', 'Ramírez', 'Hernández', 'Torres', 'Flores', 'Jiménez', 'Vargas', 'Castro', 'López', 'Pérez',
  'Díaz', 'Cruz', 'Morales', 'Reyes', 'Ortiz', 'Ruiz', 'Mendoza', 'Fuentes', 'Ríos', 'Núñez',
  'Campos', 'Vega', 'Rojas', 'Solís', 'Peña', 'Cabrera', 'Ibarra', 'Salas', 'Duarte', 'Prieto'];
function hstr(s) { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h; }
const cache = {};
function fakeFor(key) {
  if (!cache[key]) { const h = hstr(String(key)); cache[key] = { first: FF[h % FF.length], last: FL[(Math.floor(h / 7)) % FL.length] }; }
  return cache[key];
}
function maskNode(n) {
  if (Array.isArray(n)) return n.forEach(maskNode);
  if (n && typeof n === 'object') {
    if (typeof n.firstName === 'string') {
      const f = fakeFor(n.id || n.participantId || (n.firstName + '|' + (n.lastName || '')));
      n.firstName = f.first;
      if ('lastName' in n) n.lastName = f.last;
      if ('nickname' in n && n.nickname) n.nickname = f.first;
      if ('displayName' in n && n.displayName) n.displayName = `${f.first} ${f.last}`;
      if ('email' in n && typeof n.email === 'string' && n.email.includes('@')) n.email = `${f.first}.${f.last}@correo.com`.toLowerCase();
    }
    // "Palanquero N (Nombre Real)" → "Palanquero N (Nombre Falso)"
    if (typeof n.label === 'string') {
      const m = n.label.match(/^(Palanquero\s*\d+)\s*\((.+)\)$/i);
      if (m) { const f = fakeFor(n.value || m[1]); n.label = `${m[1]} (${f.first} ${f.last})`; }
    }
    for (const k of Object.keys(n)) if (typeof n[k] === 'object') maskNode(n[k]);
  }
}
async function maskRoute(route) {
  if (route.request().method() !== 'GET') return route.continue();
  try { const resp = await route.fetch(); const data = await resp.json(); maskNode(data); return route.fulfill({ response: resp, body: JSON.stringify(data) }); }
  catch { return route.continue(); }
}

const LINES = [
  { id: 'sidebar1', text: 'Palancas vive en el menú, dentro de Comunicaciones.' },
  { id: 'intro', text: 'Una palanca es una carta de apoyo que familiares y amigos escriben para cada caminante. Los palanqueros las consiguen.' },
  { id: 'assign', text: 'Primero se asignan los palanqueros: en Responsabilidades tienes Palanquero 1, 2 y 3, que son servidores. Juntos forman el equipo de Palancas.' },
  { id: 'config', text: 'En la configuración del retiro, pestaña Ajustes, eliges qué avisos salen al registrarse un caminante: al caminante, al que lo invitó, y a los palanqueros.' },
  { id: 'sequences', text: 'Esos avisos son secuencias. El aviso al palanquero llega por WhatsApp a su bandeja; y una secuencia pide la palanca a los familiares, con recordatorio.' },
  { id: 'palancas1', text: 'En la vista de Palancas ves a cada caminante con su palanquero, si ya se solicitó, cuántas se recibieron y las notas.' },
  { id: 'palancas2', text: 'Ahí llevas el avance: asignas el palanquero, marcas solicitadas, anotas cuántas llegaron y dejas notas del contacto.' },
  { id: 'contacts', text: 'Para escribirle a la familia, abres el mensaje del caminante: los contactos salen del registro, quién lo invitó y sus contactos de emergencia.' },
  { id: 'outro', text: 'Así trabaja el equipo de Palancas: se asignan, la app avisa al registrarse, contactan a la familia con secuencias y llevan el conteo hasta recibir cada carta.' },
];

const YT_TITLE = 'El equipo de Palancas en Emaús: cómo consiguen las cartas';
const YT_DESCRIPTION =
  'Tutorial del equipo de Palancas en Emaús (las cartas de apoyo que familiares y amigos escriben ' +
  'para cada caminante). Cómo se asignan los Palanquero 1, 2 y 3 (servidores del equipo de Palancas); ' +
  'la configuración del retiro para avisar al registrarse un caminante (al caminante, al invitador y a ' +
  'los palanqueros); las secuencias que piden la palanca a los familiares con recordatorio (WhatsApp a ' +
  'la bandeja, correo automático); la vista de Palancas para llevar el registro (por contactar, ' +
  'solicitadas, recibidas y notas); y cómo escribirle a la familia con los contactos capturados en el ' +
  'registro. Los nombres son ficticios.';
const YT_TAGS = ['Emaús', 'retiro', 'palancas', 'palanquero', 'cartas', 'familiares', 'secuencias', 'tutorial'];
const CHAPTER_LABELS = {
  sidebar1: 'Dónde está en el menú', intro: 'Qué es una palanca', assign: 'Asignar Palanquero 1, 2 y 3',
  config: 'Avisos al registrarse', sequences: 'Secuencias a la familia', palancas1: 'La vista de Palancas',
  palancas2: 'Llevar el registro', contacts: 'Contactar a la familia', outro: 'Resumen',
};

const log = (...a) => console.log(...a);
const sleep = (page, ms) => page.waitForTimeout(ms);
async function cueBox(nar, loc) {
  try { await loc.scrollIntoViewIfNeeded(); const b = await loc.boundingBox(); if (b) await nar.cueAt(b.x + b.width / 2, b.y + b.height / 2); } catch {}
}

async function main() {
  ensureOutputDir();
  log('🎙️  TTS…');
  const clips = {};
  for (const l of LINES) clips[l.id] = { id: l.id, text: l.text, ...(await genTts(cfg, l.id, l.text)) };

  const browser = await chromium.launch({ headless: false, slowMo: 45 });
  log('🔐 Login…');
  let state;
  for (let attempt = 1; attempt <= 3; attempt++) {
    const auth = await browser.newContext({ viewport: { width: W, height: H }, locale: 'es-MX' });
    const ap = await auth.newPage();
    try {
      await ap.goto(cfg.baseUrl + '/login', { waitUntil: 'networkidle' });
      await ap.fill('#email', cfg.email); await ap.fill('#password', cfg.password);
      await ap.press('#password', 'Enter'); await ap.waitForURL(/\/app/, { timeout: 20000 });
      await ap.waitForTimeout(1500); state = await auth.storageState(); await auth.close(); break;
    } catch (e) { await auth.close(); if (attempt === 3) throw e; await new Promise((r) => setTimeout(r, 2000)); }
  }

  const ctx = await browser.newContext({
    storageState: state, viewport: { width: W, height: H }, locale: 'es-MX',
    recordVideo: { dir: OUTPUT_DIR, size: { width: W, height: H } },
  });
  await ctx.addInitScript(() => localStorage.setItem('preferred-locale', 'es'));
  await ctx.addInitScript(OVERLAY);
  const page = await ctx.newPage();
  page.setDefaultTimeout(6000);
  page.setDefaultNavigationTimeout(30000);
  for (const pat of ['**/responsibilities**', '**/participants**', '**/service-teams**', '**/sequences**', '**/message-sequences**']) {
    await page.route(pat, maskRoute);
  }

  const video = page.video();
  const nar = new Narrator(page, cfg);
  nar.start();

  const rows = () => page.locator('tr.participant-row');

  try {
    // Seleccionar San Agustín + ir a Palancas
    await page.goto(`${cfg.baseUrl}/app/retreats/${SA}/responsibilities`, { waitUntil: 'networkidle' });
    await page.getByText('Responsabilidades del Retiro').first().waitFor({ timeout: 15000 });
    await sleep(page, 1000);

    // 3. Asignar palanqueros (en Responsabilidades) — narramos aquí primero para aprovechar la vista
    // Buscar tarjeta "Palanquero"
    await page.getByPlaceholder(/Buscar/i).first().fill('Palanquero').catch(() => {});
    await sleep(page, 1000);
    // 1. Sidebar (Comunicaciones → Palancas)
    const comm = page.locator('button', { hasText: /^\s*Comunicaciones\s*$/i }).first();
    await cueBox(nar, comm);
    await nar.say(clips.sidebar1);
    await comm.click().catch(() => {});
    await sleep(page, 700);
    await cueBox(nar, page.getByText('Palancas', { exact: true }).first());
    await nar.say(clips.intro);
    await cueBox(nar, page.getByText(/Palanquero/i).first());
    await nar.say(clips.assign);

    // 4. Config del retiro → Ajustes
    await page.locator('button:has(svg.lucide-square-pen-icon)').first().click().catch(() => {});
    await page.getByText('Editar Retiro').first().waitFor({ timeout: 6000 }).catch(() => {});
    await sleep(page, 800);
    await page.getByRole('tab', { name: /Ajustes/i }).click().catch(() => {});
    await sleep(page, 800);
    await cueBox(nar, page.getByText(/Notificaciones por correo al registrar/i).first());
    await nar.say(clips.config);
    await page.getByRole('button', { name: /Cancelar/i }).first().click().catch(() => page.keyboard.press('Escape'));
    await sleep(page, 700);

    // 5. Secuencias
    await page.goto(`${cfg.baseUrl}/app/settings/message-sequences`, { waitUntil: 'networkidle' });
    await page.getByText('Secuencias automáticas').first().waitFor({ timeout: 15000 }).catch(() => {});
    await sleep(page, 1500);
    await cueBox(nar, page.getByText(/palanquero|Palancas|invitador/i).first());
    await nar.say(clips.sequences);

    // 6-7. Vista Palancas
    await page.goto(`${cfg.baseUrl}/app/palancas`, { waitUntil: 'networkidle' });
    await rows().first().waitFor({ timeout: 15000 }).catch(() => {});
    await sleep(page, 1200);
    await cueBox(nar, page.getByText(/COORD\.|SOLICITADAS|RECIBIDAS/i).first());
    await nar.say(clips.palancas1);
    // abrir la ficha de un caminante con palanquero (editar) — solo lectura
    await rows().first().locator('button:has(svg.lucide-square-pen-icon)').first().click().catch(() => {});
    await page.getByRole('dialog').waitFor({ timeout: 6000 }).catch(() => {});
    await sleep(page, 800);
    await cueBox(nar, page.getByRole('dialog').getByText(/Palanca|Coordinador|Solicit|Recibid|Notas/i).first());
    await nar.say(clips.palancas2);
    await page.getByRole('button', { name: /Cancelar/i }).first().click().catch(() => page.keyboard.press('Escape'));
    await sleep(page, 700);

    // 8. Mensaje individual (contactos del registro)
    await rows().first().locator('button:has(svg.lucide-message-square-icon)').first().click().catch(() => {});
    await page.getByRole('dialog').waitFor({ timeout: 6000 }).catch(() => {});
    await sleep(page, 900);
    await cueBox(nar, page.getByRole('dialog').getByText(/Tel|Correo|Contacto|N.mero/i).first());
    await nar.say(clips.contacts);
    await page.keyboard.press('Escape');
    await sleep(page, 600);

    await nar.say(clips.outro);
    await sleep(page, 1000);
    await nar.clear();
    await sleep(page, 400);
  } catch (err) {
    console.error('❌ Error:', err);
    await page.screenshot({ path: path.join(OUTPUT_DIR, 'error-palancas.png') }).catch(() => {});
  }

  const wallMs = nar.elapsedMs;
  await ctx.close();
  const videoPath = await video.path();
  await browser.close();
  log('🎬', videoPath);
  const webmDur = await audioDuration(cfg.ffprobe, videoPath);
  const syncScale = computeSyncScale(webmDur, wallMs);
  log(`⏱ webm ${webmDur.toFixed(1)}s reloj ${(wallMs / 1000).toFixed(1)}s scale ${syncScale.toFixed(4)}`);
  const out = path.join(OUTPUT_DIR, 'palancas-demo.mp4');
  await muxVideo(cfg, { video: videoPath, timeline: nar.timeline, out, syncOffsetMs: SYNC_OFFSET_MS, syncScale });
  const chapters = buildYoutubeChapters(nar.timeline, { labels: CHAPTER_LABELS });
  writeVideoMeta(out, { title: YT_TITLE, description: YT_DESCRIPTION, tags: YT_TAGS, chapters });
  log('✅ Listo:', out);
  for (const t of nar.timeline) log(`  ${(t.offsetMs / 1000).toFixed(1)}s  ${t.id}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
