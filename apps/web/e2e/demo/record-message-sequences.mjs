// Video-demo narrado: "Plantillas y Secuencias Automáticas de mensajes".
//
// Muestra Comunicaciones: qué es una PLANTILLA y cómo se crea (nombre, tipo→audiencia,
// mensaje con variables, vista previa), y cómo las SECUENCIAS AUTOMÁTICAS las envían solas
// según un disparador (al registrarse, días antes/después, cumpleaños), con pasos por
// plantilla + canal + desfase y condiciones.
//
//   cd apps/web && node e2e/demo/record-message-sequences.mjs
//
// Vista de ADMIN → login por storageState. NO muta: crear plantilla / crear secuencia se
// CANCELAN. NUNCA clica "Ejecutar ahora" (enrola y envía de verdad). Para privacidad de la
// vista previa, intercepta /participants y devuelve participantes ficticios (sin PII).

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
const OVERLAY = OVERLAY_INIT.replace('✝ Emaús · Tareas Pre-Retiro', '✝ Emaús · Comunicaciones');

// Participantes ficticios (solo para que cualquier vista previa use datos falsos, no PII).
const FAKES = [
  { firstName: 'María', lastName: 'González', nickname: 'María', email: 'maria.gonzalez@correo.com', cellPhone: '524611000001', parish: 'La Asunción' },
  { firstName: 'José', lastName: 'Ramírez', nickname: 'José', email: 'jose.ramirez@correo.com', cellPhone: '524611000002', parish: 'San Judas Tadeo' },
];
let TMPL = { birthDate: '1990-01-01T00:00:00.000Z', type: 'walker' };
function buildParticipants() {
  return FAKES.map((f, i) => ({
    ...JSON.parse(JSON.stringify(TMPL)), id: `fake-${i}`, id_on_retreat: i + 1, type: 'walker',
    payments: [], debts: [], tags: [], messageCount: 0, tableId: null, tableMesa: null,
    homePhone: '', workPhone: '', userId: null, retreatBed: null, isCancelled: false,
    paymentRemaining: 0, paymentStatus: 'paid', ...f,
  }));
}

const LINES = [
  { id: 'sidebar1', text: '¿Dónde viven? En el menú de la izquierda abre la sección Comunicaciones.' },
  { id: 'sidebar2', text: 'Ahí tienes Plantillas de Mensajes y Secuencias Automáticas. Empecemos por las plantillas.' },
  { id: 'tpl_intro', text: 'Una plantilla es un mensaje que escribes una vez y reutilizas: bienvenidas, recordatorios, invitaciones.' },
  { id: 'tpl_new', text: 'Para crear una, tocas Agregar Nueva Plantilla.' },
  { id: 'tpl_type', text: 'Le pones un nombre y eliges el tipo. El tipo define a quién va dirigida: caminantes, servidores o familiares.' },
  { id: 'tpl_vars', text: 'Escribes el mensaje y, con un clic, insertas variables como el nombre o la fecha del retiro; se rellenan solas al enviar.' },
  { id: 'tpl_save', text: 'La ves como WhatsApp o correo, revisas la vista previa y guardas. Ya quedó lista para usar.' },
  { id: 'seq_intro', text: 'Ahora las secuencias. Envían esas plantillas solas, según un evento o el tiempo.' },
  { id: 'seq_sub', text: 'El correo se manda solo; el WhatsApp queda en una bandeja para que lo mandes desde tu cuenta.' },
  { id: 'seq_list', text: 'Aquí ves tus secuencias: su disparador, a quién van y cuántos mensajes se enviaron.' },
  { id: 'seq_new', text: 'Creas una nueva con nombre, disparador —al registrarse, días antes o después, o en su cumpleaños— y la audiencia.' },
  { id: 'seq_step', text: 'Agregas pasos: cada paso es una plantilla, un canal, cuántos días de desfase y a qué hora. Puedes condicionar por pago o asistencia.' },
  { id: 'seq_run', text: 'La dejas Activa y listo. Con Ejecutar ahora la corres al momento, y en Pendientes y Problemas vigilas los envíos.' },
  { id: 'outro', text: 'Así escribes tus mensajes una sola vez como plantillas, y las secuencias los envían por ti en el momento justo.' },
];

const YT_TITLE = 'Plantillas y secuencias automáticas de mensajes en Emaús';
const YT_DESCRIPTION =
  'Tutorial de Comunicaciones en Emaús. Qué es una plantilla de mensaje y cómo se crea (nombre, ' +
  'tipo/audiencia, texto con variables que se rellenan solas, vista previa para WhatsApp o correo), ' +
  'y cómo las secuencias automáticas envían esas plantillas por ti según un disparador (al registrarse, ' +
  'días antes o después del retiro, o en el cumpleaños), con pasos por plantilla, canal, desfase y ' +
  'condiciones. El correo se envía solo; el WhatsApp queda en una bandeja. Los datos son ficticios.';
const YT_TAGS = ['Emaús', 'retiro', 'mensajes', 'plantillas', 'secuencias', 'automatización', 'WhatsApp', 'correo', 'tutorial'];
const CHAPTER_LABELS = {
  sidebar1: 'Dónde está en el menú', sidebar2: 'Plantillas y Secuencias', tpl_intro: 'Qué es una plantilla',
  tpl_new: 'Crear una plantilla', tpl_type: 'Nombre y tipo (audiencia)', tpl_vars: 'Variables',
  tpl_save: 'Vista previa y guardar', seq_intro: 'Secuencias automáticas', seq_sub: 'Correo vs. WhatsApp',
  seq_list: 'Tus secuencias', seq_new: 'Nueva secuencia', seq_step: 'Pasos: plantilla, canal, desfase',
  seq_run: 'Activar y ejecutar', outro: 'Resumen',
};

const log = (...a) => console.log(...a);
const sleep = (page, ms) => page.waitForTimeout(ms);
async function cueBox(nar, loc) {
  try {
    await loc.scrollIntoViewIfNeeded();
    const b = await loc.boundingBox();
    if (b) await nar.cueAt(b.x + b.width / 2, b.y + b.height / 2);
  } catch {}
}

async function main() {
  ensureOutputDir();
  log('🎙️  Generando narración TTS…');
  const clips = {};
  for (const l of LINES) {
    clips[l.id] = { id: l.id, text: l.text, ...(await genTts(cfg, l.id, l.text)) };
    log(`   · ${l.id} → ${clips[l.id].duration.toFixed(1)}s`);
  }

  const browser = await chromium.launch({ headless: false, slowMo: 55 });

  log('🔐 Login…');
  let state;
  for (let attempt = 1; attempt <= 3; attempt++) {
    const auth = await browser.newContext({ viewport: { width: W, height: H }, locale: 'es-MX' });
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
      log(`   login reintento ${attempt}…`);
      await new Promise((r) => setTimeout(r, 2000));
    }
  }

  const ctx = await browser.newContext({
    storageState: state, viewport: { width: W, height: H }, locale: 'es-MX',
    recordVideo: { dir: OUTPUT_DIR, size: { width: W, height: H } },
  });
  await ctx.addInitScript(() => localStorage.setItem('preferred-locale', 'es'));
  await ctx.addInitScript(OVERLAY);
  const page = await ctx.newPage();
  page.setDefaultTimeout(6000);
  page.setDefaultNavigationTimeout(30000); // goto/networkidle no debe heredar el 6s de acciones

  // 🔒 Cualquier dato de participante (p.ej. vista previa) = ficticio.
  await page.route('**/participants**', async (route) => {
    const req = route.request();
    if (req.method() !== 'GET' || !req.url().includes('?')) return route.continue();
    try {
      const resp = await route.fetch();
      const data = await resp.json();
      const arr = Array.isArray(data) ? data : (data.data || data.participants || []);
      TMPL = arr.find((p) => p.type === 'walker') || arr[0] || TMPL;
      return route.fulfill({ response: resp, body: JSON.stringify(buildParticipants()) });
    } catch {
      return route.continue();
    }
  });

  const video = page.video();
  const nar = new Narrator(page, cfg);
  nar.start();

  try {
    // ── Plantillas ──
    await page.goto(`${cfg.baseUrl}/app/settings/message-templates`, { waitUntil: 'networkidle' });
    await page.getByText('Plantillas de Mensajes').first().waitFor({ timeout: 15000 });
    await sleep(page, 1200);

    // Ubicación en el sidebar
    const comm = page.locator('button', { hasText: /^\s*Comunicaciones\s*$/i }).first();
    await cueBox(nar, comm);
    await nar.say(clips.sidebar1);
    await comm.click().catch(() => {});
    await sleep(page, 900);
    await cueBox(nar, page.getByText('Plantillas de Mensajes', { exact: true }).first());
    await nar.say(clips.sidebar2);

    await cueBox(nar, page.getByText('20 plantillas', { exact: false }).first());
    await nar.say(clips.tpl_intro);

    // Crear plantilla
    const newTpl = page.getByRole('button', { name: /Agregar Nueva Plantilla/i });
    await cueBox(nar, newTpl);
    await nar.say(clips.tpl_new);
    await newTpl.click().catch(() => {});
    await page.getByText('Nueva Plantilla').first().waitFor({ timeout: 6000 }).catch(() => {});
    await sleep(page, 800);
    // Nombre + tipo
    await page.locator('#name').fill('Recordatorio de pago').catch(() => {});
    await sleep(page, 300);
    await cueBox(nar, page.getByText('Tipo', { exact: true }).first());
    await nar.say(clips.tpl_type);
    // Escribir en el editor + insertar una variable con clic (queda "Hola {participant.firstName}")
    await page.locator('[contenteditable]').first().click().catch(() => {});
    await page.keyboard.type('Hola ');
    await sleep(page, 300);
    await cueBox(nar, page.getByText('Variables Disponibles').first());
    await page.locator('div').filter({ hasText: /^Nombre\{participant.firstName\}$/ }).first().click().catch(() => {});
    await sleep(page, 400);
    await nar.say(clips.tpl_vars);
    // Vista previa / canal
    await cueBox(nar, page.getByText('Vista Previa', { exact: false }).first());
    await nar.say(clips.tpl_save);
    await page.getByRole('button', { name: /Cancelar/i }).first().click().catch(() => page.keyboard.press('Escape'));
    await sleep(page, 700);

    // ── Secuencias ──
    await page.goto(`${cfg.baseUrl}/app/settings/message-sequences`, { waitUntil: 'networkidle' });
    await page.getByText('Secuencias automáticas').first().waitFor({ timeout: 15000 });
    await sleep(page, 1000);
    await nar.say(clips.seq_intro);
    await cueBox(nar, page.getByText(/El Email se envía solo/i).first());
    await nar.say(clips.seq_sub);
    // lista
    await cueBox(nar, page.getByText('Bienvenida al caminante').first());
    await nar.say(clips.seq_list);

    // Nueva secuencia
    const newSeq = page.getByRole('button', { name: /Nueva secuencia/i }).first();
    await newSeq.click().catch(() => {});
    await page.getByText('Nueva secuencia').first().waitFor({ timeout: 6000 }).catch(() => {});
    await sleep(page, 800);
    await page.getByPlaceholder(/Bienvenida a caminantes/i).fill('Recordatorio de pago').catch(() => {});
    await sleep(page, 300);
    await cueBox(nar, page.getByText('Disparador', { exact: true }).first());
    await nar.say(clips.seq_new);
    // Agregar paso
    await page.getByRole('button', { name: /Agregar paso/i }).first().click().catch(() => {});
    await sleep(page, 700);
    await cueBox(nar, page.getByText('Paso 1').first());
    await nar.say(clips.seq_step);
    // Activa + Ejecutar ahora (SOLO señalar, NO clicar)
    await cueBox(nar, page.getByText('Activa', { exact: true }).first());
    await page.getByRole('button', { name: /Cancelar/i }).first().click().catch(() => page.keyboard.press('Escape'));
    await sleep(page, 700);
    await cueBox(nar, page.getByRole('button', { name: /Ejecutar ahora/i }).first());
    await nar.say(clips.seq_run);

    await nar.say(clips.outro);
    await sleep(page, 1000);
    await nar.clear();
    await sleep(page, 400);
  } catch (err) {
    console.error('❌ Error durante la grabación:', err);
    await page.screenshot({ path: path.join(OUTPUT_DIR, 'error-sequences.png') }).catch(() => {});
  }

  const wallMs = nar.elapsedMs;
  await ctx.close();
  const videoPath = await video.path();
  await browser.close();
  log('🎬 Video crudo:', videoPath);

  const webmDur = await audioDuration(cfg.ffprobe, videoPath);
  const syncScale = computeSyncScale(webmDur, wallMs);
  log(`⏱  sync: webm ${webmDur.toFixed(1)}s / reloj ${(wallMs / 1000).toFixed(1)}s → scale ${syncScale.toFixed(4)}`);

  const out = path.join(OUTPUT_DIR, 'message-sequences-demo.mp4');
  log('🔊 Muxeando audio…');
  await muxVideo(cfg, { video: videoPath, timeline: nar.timeline, out, syncOffsetMs: SYNC_OFFSET_MS, syncScale });

  const chapters = buildYoutubeChapters(nar.timeline, { labels: CHAPTER_LABELS });
  writeVideoMeta(out, { title: YT_TITLE, description: YT_DESCRIPTION, tags: YT_TAGS, chapters });
  log('✅ Listo:', out);
  log('— Timeline —');
  for (const t of nar.timeline) log(`  ${(t.offsetMs / 1000).toFixed(1)}s  ${t.id}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
