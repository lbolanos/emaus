// Video-demo narrado: "Seguimiento de caminantes" (tablero + historial + notas).
//
// Muestra: dónde vive en el sidebar, el tablero de 5 etapas, qué dice cada tarjeta
// (cartas, mensajes, asistencia), el filtro de "a quién le falta palanca", y el panel
// de historial: con quién hemos hablado (familiares e invitador), el botón que abre la
// conversación real de WhatsApp, la caja de notas y el hilo cronológico.
//
//   cd apps/web && node e2e/demo/record-follow-up-board.mjs
//
// NO muta nada: no arrastra tarjetas (eso escribiría la confirmación de asistencia) ni
// agrega notas de verdad — escribe el texto en la caja y lo deja sin enviar.
// PII: enmascara TODO el API con maskRoute (nombres, correos, teléfonos, fotos).

import pw from '@playwright/test';
const { chromium } = pw;
import path from 'node:path';
import {
  loadEnv, ensureOutputDir, genTts, OVERLAY_INIT, Narrator, muxVideo,
  computeSyncScale, audioDuration, buildYoutubeChapters, writeVideoMeta, OUTPUT_DIR,
  maskRoute, maskNode, alignChapterTimeline,
} from './demo-lib.mjs';

const cfg = loadEnv();
// Convención del repo: cada video pone su propia etiqueta de marca.
const OVERLAY = OVERLAY_INIT.replace('✝ Emaús · Tareas Pre-Retiro', '✝ Emaús · Seguimiento de caminantes');
const W = 1280, H = 800;
const SYNC_OFFSET_MS = 0;
const SAN_AGUSTIN = '4c8173c9-a068-4efe-a936-e3618523bead';

const LINES = [
  { id: 'intro',    text: 'Este es el Seguimiento de caminantes: un tablero para saber con quién ya hablaste y con quién falta.' },
  { id: 'sidebar',  text: 'Lo encuentras en el menú, dentro de Comunicaciones.' },
  { id: 'board',    text: 'Cada columna es una etapa. Todos empiezan en Por contactar, sin que tengas que dar de alta a nadie.' },
  { id: 'card',     text: 'La tarjeta te dice lo importante de un vistazo: cuántas cartas lleva y cuántos mensajes le hemos mandado.' },
  { id: 'drag',     text: 'Para moverlo de etapa, arrastras la tarjeta. En el teléfono, la tocas y luego tocas la columna.' },
  { id: 'warn',     text: 'Ojo: al moverlo a Confirmó también se registra su asistencia, y deja de recibir recordatorios.' },
  { id: 'filter',   text: 'El filtro de cartas responde la pregunta de siempre: a quién le falta palanca.' },
  { id: 'open',     text: 'Haz clic en una tarjeta y se abre todo su historial.' },
  { id: 'contacts', text: 'Arriba ves con quién hemos hablado: el caminante, sus familiares y quien lo invitó.' },
  { id: 'whatsapp', text: 'El botón de WhatsApp abre la conversación real con esa persona, para leer lo que te contestó.' },
  { id: 'limit',    text: 'Emaús te muestra lo que enviamos. Las respuestas llegan a tu teléfono, no a la aplicación.' },
  { id: 'note',     text: 'Por eso está la caja de notas: si te dicen algo importante, lo escribes aquí y queda con tu nombre.' },
  { id: 'thread',   text: 'Abajo está el hilo completo: mensajes, notas, pagos, su registro y las cartas que ha recibido.' },
  { id: 'outro',    text: 'Eso es todo: arrastras para mover, haces clic para ver el historial, y anotas lo que te digan.' },
];

const YT_TITLE = 'Seguimiento de caminantes en Emaús: tablero, historial y notas';
const YT_DESCRIPTION =
  'Tutorial del Seguimiento de caminantes en Emaús. Un tablero con las etapas de contacto ' +
  '(por contactar, contactado, confirmó, sin respuesta, declinó) donde arrastras cada tarjeta ' +
  'según cómo va la conversación. Cada tarjeta muestra las cartas recibidas y los mensajes ' +
  'enviados, y el filtro de cartas responde a quién le falta palanca. Al hacer clic se abre el ' +
  'historial de la persona: con quién hemos hablado (el caminante, sus familiares y quien lo ' +
  'invitó), un botón que abre la conversación real de WhatsApp, una caja de notas que no se ' +
  'sobrescriben, y el hilo completo con mensajes, pagos, registro y asistencia. ' +
  'Todos los datos que aparecen son ficticios.';
const YT_TAGS = ['Emaús', 'retiro', 'seguimiento', 'caminantes', 'CRM', 'notas', 'WhatsApp', 'palancas', 'tutorial'];
const CHAPTER_LABELS = {
  intro: 'Qué es', sidebar: 'Dónde está en el menú', board: 'El tablero por etapas',
  card: 'Qué dice cada tarjeta', drag: 'Mover de etapa', warn: 'Ojo con Confirmó',
  filter: 'A quién le falta palanca', open: 'Abrir el historial',
  contacts: 'Con quién hemos hablado', whatsapp: 'Abrir WhatsApp', limit: 'Qué NO ve Emaús',
  note: 'Agregar una nota', thread: 'El hilo completo', outro: 'Resumen',
};

const log = (...a) => console.log(...a);
const sleep = (page, ms) => page.waitForTimeout(ms);

async function cueBox(nar, loc) {
  try {
    await loc.scrollIntoViewIfNeeded({ timeout: 2000 });
    const b = await loc.boundingBox();
    if (b) await nar.cueAt(b.x + b.width / 2, b.y + b.height / 2);
  } catch {}
}

/** Expande la cadena del sidebar; clica el header sólo si está colapsado. */
async function expandSidebar(page, names) {
  for (const name of names) {
    const btn = page.locator('button', { hasText: new RegExp(`^\\s*${name}\\s*$`, 'i') }).first();
    const expanded = await btn.getAttribute('aria-expanded').catch(() => null);
    if (expanded === 'false') await btn.click().catch(() => {});
    await sleep(page, 250);
  }
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
  page.setDefaultNavigationTimeout(30000);

  // 🔒 PII: enmascarar nombres, correos, teléfonos y fotos en TODO el API.
  await page.route('**/api/**', maskRoute);

  // 🔒 El CUERPO de los mensajes es texto libre con nombres reales dentro
  // ("Hola Pepe Toño, …"): ninguna regla por clave puede limpiarlo. Para el
  // video se sustituye por copia ficticia. Va DESPUÉS de la red genérica —
  // Playwright evalúa primero la última ruta registrada.
  const CUERPOS = [
    'Hola, te confirmo que ya está apartado tu lugar para el retiro. Nos vemos pronto.',
    'Buenas tardes, te escribimos para pedirte una carta de apoyo para el retiro.',
    'Gracias por confirmar. Te mandamos los detalles de la salida esta semana.',
    'Recordatorio: la cita es el viernes a las seis de la tarde en la parroquia.',
  ];
  await page.route('**/api/crm/**/timeline', async (route) => {
    try {
      const resp = await route.fetch();
      const data = await resp.json();
      // Esta ruta GANA sobre la genérica `**/api/**` (Playwright evalúa primero
      // la última registrada), así que el enmascarado tiene que aplicarlo ELLA:
      // si no, el timeline sale sin enmascarar y se cuela el nombre real.
      maskNode(data);
      if (Array.isArray(data)) {
        data.forEach((e, i) => {
          if ((e.type === 'message' || e.type === 'message_scheduled') && e.detail) {
            e.detail = CUERPOS[i % CUERPOS.length];
          }
          if (e.meta && typeof e.meta.subject === 'string' && e.meta.subject) {
            e.meta.subject = 'Mensaje del retiro';
          }
        });
      }
      return route.fulfill({ response: resp, body: JSON.stringify(data) });
    } catch {
      return route.continue();
    }
  });

  const video = page.video();
  const nar = new Narrator(page, cfg);
  nar.start();

  try {
    // Fijar San Agustín (retiro con datos completos) navegando por una ruta con :id.
    await page.goto(`${cfg.baseUrl}/app/retreats/${SAN_AGUSTIN}/dashboard`, { waitUntil: 'networkidle' });
    await sleep(page, 800);

    await page.goto(`${cfg.baseUrl}/app/follow-up`, { waitUntil: 'networkidle' });
    await page.getByText('Seguimiento de caminantes').first().waitFor({ timeout: 15000 }).catch(() => {});
    await sleep(page, 1200);

    await nar.say(clips.intro);

    // ── Dónde vive en el menú ──
    await expandSidebar(page, ['Retiro', 'Comunicaciones']);
    const item = page.getByRole('link', { name: /^Seguimiento de caminantes/i }).first();
    await cueBox(nar, item);
    await nar.say(clips.sidebar);
    await nar.clearCue();

    // ── El tablero ──
    const colPor = page.locator('section').first();
    await cueBox(nar, colPor.locator('header').first());
    await nar.say(clips.board);
    await nar.clearCue();

    // ── La tarjeta ──
    const card = colPor.locator('[draggable="true"]').first();
    await cueBox(nar, card);
    await nar.say(clips.card);
    await nar.say(clips.drag);
    await nar.clearCue();

    // ── El aviso de la confirmación ──
    const colConf = page.locator('section').nth(2);
    await cueBox(nar, colConf.locator('header').first());
    await nar.say(clips.warn);
    await nar.clearCue();

    // ── Filtro de cartas ──
    const filtro = page.locator('select:has(option[value="met"])').first();
    await cueBox(nar, filtro);
    await nar.say(clips.filter);
    await filtro.selectOption('below').catch(() => {});
    await sleep(page, 1200);
    await filtro.selectOption('all').catch(() => {});
    await sleep(page, 700);
    await nar.clearCue();

    // ── Abrir el historial ──
    const target = page.locator('section').first().locator('[draggable="true"]').first();
    await cueBox(nar, target);
    await nar.say(clips.open);
    await nar.clearCue();
    await target.click().catch(() => {});
    await page.locator('div.fixed.inset-0.z-50 aside').waitFor({ timeout: 8000 }).catch(() => {});
    await sleep(page, 1000);

    const panel = page.locator('div.fixed.inset-0.z-50 aside');

    // ── Con quién hemos hablado ──
    await cueBox(nar, panel.getByText('CON QUIÉN HEMOS HABLADO').first());
    await nar.say(clips.contacts);
    await nar.clearCue();

    const wa = panel.locator('a[href^="https://api.whatsapp.com"]').nth(1);
    await cueBox(nar, wa);
    await nar.say(clips.whatsapp);
    await nar.clearCue();

    await nar.say(clips.limit);

    // ── La caja de notas: se escribe y se DEJA SIN ENVIAR ──
    const ta = panel.locator('textarea').first();
    await cueBox(nar, ta);
    await ta.click().catch(() => {});
    await ta.type('La mamá pide que le llamemos por la tarde', { delay: 45 }).catch(() => {});
    await nar.say(clips.note);
    await ta.fill('').catch(() => {});
    await nar.clearCue();

    // ── El hilo ──
    await panel.locator('ol').first().scrollIntoViewIfNeeded({ timeout: 2000 }).catch(() => {});
    await sleep(page, 600);
    await nar.say(clips.thread);

    await nar.say(clips.outro);
    await sleep(page, 900);
    await nar.clear();
    await sleep(page, 400);
  } catch (err) {
    console.error('❌ Error durante la grabación:', err);
    await page.screenshot({ path: path.join(OUTPUT_DIR, 'error-follow-up.png') }).catch(() => {});
  }

  const wallMs = nar.elapsedMs;
  await ctx.close();
  const videoPath = await video.path();
  await browser.close();
  log('🎬 Video crudo:', videoPath);

  const webmDur = await audioDuration(cfg.ffprobe, videoPath);
  const syncScale = computeSyncScale(webmDur, wallMs);
  log(`⏱  sync: webm ${webmDur.toFixed(1)}s / reloj ${(wallMs / 1000).toFixed(1)}s → scale ${syncScale.toFixed(4)}`);

  const out = path.join(OUTPUT_DIR, 'follow-up-board-demo.mp4');
  log('🔊 Muxeando audio…');
  await muxVideo(cfg, { video: videoPath, timeline: nar.timeline, out, syncOffsetMs: SYNC_OFFSET_MS, syncScale });

  const aligned = alignChapterTimeline(nar.timeline, { syncScale, syncOffsetMs: SYNC_OFFSET_MS });
  const chapters = buildYoutubeChapters(aligned, { labels: CHAPTER_LABELS });
  writeVideoMeta(out, { title: YT_TITLE, description: YT_DESCRIPTION, tags: YT_TAGS, chapters });
  log('✅ Listo:', out);
  log('— Timeline —');
  for (const t of nar.timeline) log(`  ${(t.offsetMs / 1000).toFixed(1)}s  ${t.id}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
