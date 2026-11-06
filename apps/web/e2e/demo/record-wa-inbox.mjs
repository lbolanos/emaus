// Video-demo narrado de la Bandeja WhatsApp de solo lectura (specs/whatsapp-inbox).
//
// Conduce la app REAL (Chromium visible) sobre el retiro demo (San Agustín, con
// conversaciones sembradas en la DB del worktree y el binario fake-wacli para el
// flujo de vinculación), con subtítulos + narración TTS (Deepgram Aura-2) y
// produce un MP4 (H.264 + AAC) + metadata para YouTube.
//
//   cd apps/web && DEMO_BASE_URL=http://localhost:5174 node e2e/demo/record-wa-inbox.mjs
//
// Requiere el dev del worktree (web 5174 + API 3002 con
// WA_BRIDGE_WACLI_BIN=/tmp/emaus-wa-video/fake-wacli) y .env con la key.

import pw from '@playwright/test';
const { chromium } = pw;
import path from 'node:path';
import {
  loadEnv,
  ensureOutputDir,
  genTts,
  OVERLAY_INIT,
  Narrator,
  muxVideo,
  computeSyncScale,
  audioDuration,
  buildYoutubeChapters,
  alignChapterTimeline,
  writeVideoMeta,
  maskRoute,
  OUTPUT_DIR,
} from './demo-lib.mjs';

const cfg = loadEnv();
const RETREAT = process.env.RETREAT_ID || '4c8173c9-a068-4efe-a936-e3618523bead'; // San Agustín (demo)
const W = 1280,
  H = 800;
const SYNC_OFFSET_MS = 0;
const OVERLAY = OVERLAY_INIT.replace('✝ Emaús · Tareas Pre-Retiro', '✝ Emaús · WhatsApp del Retiro');

// ── Guion (tuteo, frases < 25 palabras; el cartel = lo narrado) ───────────────
const LINES = [
  { id: 'intro', text: 'Este es el WhatsApp del Retiro: los mensajes que los caminantes mandan al equipo, en un solo lugar.' },
  { id: 'donde', text: 'Vive en el menú Comunicaciones: WhatsApp del Retiro.' },
  { id: 'activa', text: 'La activa el superadmin, retiro por retiro: consume memoria por cada teléfono conectado.' },
  { id: 'consolidada', text: 'Es de solo lectura y consolidada: lo que llega a cualquier teléfono del equipo, lo ve todo el equipo.' },
  { id: 'enlaces', text: 'Cada logístico vincula su WhatsApp escaneando un código. Arriba ves quién está conectado.' },
  { id: 'conversaciones', text: 'Aquí aparecen las conversaciones de los caminantes, con su nombre y lo que no has leído.' },
  { id: 'hilo', text: 'Abres un chat y ves la conversación completa.' },
  { id: 'leer', text: 'Al abrirlo se marca como leído para ti, sin avisar al caminante: nada de visto azul.' },
  { id: 'comprobante', text: 'Si el caminante manda su comprobante, lo registras como pago con un clic, con la foto ya adjunta.' },
  { id: 'responder', text: 'Y respondes desde tu propio WhatsApp, con este botón.' },
  { id: 'vincular', text: 'Para vincular el tuyo, tocas Vincular mi WhatsApp y aceptas el aviso: qué se sincroniza y los riesgos.' },
  { id: 'qr', text: 'Escaneas el código con tu teléfono, como un WhatsApp Web más.' },
  { id: 'conectado', text: '¡Listo, conectado! Tu número alimenta la bandeja solo durante el retiro.' },
  { id: 'ciclo', text: 'Terminado el retiro, todo se borra solo: sesiones cerradas e historial purgado a los quince días.' },
  { id: 'outro', text: 'WhatsApp del Retiro: el equipo entero ve lo que mandan los caminantes, sin dejar de ser solo lectura.' },
];

const CHAPTER_LABELS = {
  intro: 'Intro', donde: 'Dónde vive', activa: 'Se activa por retiro',
  consolidada: 'Solo lectura y consolidada',
  enlaces: 'Teléfonos vinculados', conversaciones: 'Conversaciones', hilo: 'Abrir un chat',
  leer: 'Leído sin visto azul', comprobante: 'Comprobante → pago', responder: 'Responder desde mi WhatsApp',
  vincular: 'Vincular: aviso y consentimiento', qr: 'Escanear el QR',
  conectado: 'Conectado', ciclo: 'Se borra solo al terminar', outro: 'Cierre',
};

const log = (...a) => console.log(...a);
const sleep = (page, ms) => page.waitForTimeout(ms);

// Click por DOM: la sección expandida de Configuración intercepta punteros
// (lección del tour) y el SPA a veces intercepta el click del ítem.
const domClick = (locator) => locator.evaluate((el) => el.click());

async function expandSection(page, name) {
  const header = page.locator('button', { hasText: name }).first();
  if ((await header.count()) === 0) return;
  const expanded = await header.getAttribute('aria-expanded').catch(() => null);
  if (expanded !== 'true') await domClick(header);
  await sleep(page, 400);
}

async function main() {
  ensureOutputDir();

  log('🎙️  Generando narración TTS…');
  const clips = {};
  for (const l of LINES) {
    clips[l.id] = { id: l.id, text: l.text, ...(await genTts(cfg, l.id, l.text)) };
    log(`   · ${l.id} → ${clips[l.id].duration.toFixed(1)}s`);
  }

  const browser = await chromium.launch({
    headless: false,
    slowMo: 55,
    args: ['--window-size=1280,800'],
  });

  log('🔐 Login…');
  let state;
  for (let attempt = 1; attempt <= 3; attempt++) {
    const auth = await browser.newContext({ viewport: { width: W, height: H } });
    const ap = await auth.newPage();
    try {
      await ap.goto(cfg.baseUrl + '/login', { waitUntil: 'networkidle' });
      await ap.fill('#email', cfg.email);
      await ap.fill('#password', cfg.password);
      await ap.press('#password', 'Enter');
      await ap.waitForURL(/\/app/, { timeout: 15000 });
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
    storageState: state,
    viewport: { width: W, height: H },
    recordVideo: { dir: OUTPUT_DIR, size: { width: W, height: H } },
  });
  await ctx.addInitScript(OVERLAY);
  const page = await ctx.newPage();
  page.setDefaultTimeout(6000);
  page.setDefaultNavigationTimeout(30000);
  // Enmascarado canónico de PII sobre TODO el API (nombres, correos, teléfonos).
  await page.route('**/api/**', maskRoute);
  // Diagnóstico: todos los POST del contexto de grabación.
  page.on('request', (r) => {
    if (r.method() === 'POST' && r.url().includes('/api/')) log('   ↗ POST', r.url().replace(cfg.baseUrl, ''));
  });
  page.on('response', (r) => {
    if (r.request().method() === 'POST' && r.url().includes('/api/')) log('   ↙ POST', r.status(), r.url().replace(cfg.baseUrl, ''));
  });
  const video = page.video();
  const nar = new Narrator(page, cfg);
  nar.start();
  // Diagnóstico: alerts del flujo (participantId null, fallos de descarga) y
  // errores de consola quedan en el log de la corrida.
  page.on('dialog', (d) => {
    log(`   ⚠ dialog [${d.type()}]: ${d.message()}`);
    void d.accept();
  });
  page.on('console', (m) => {
    if (m.type() === 'error') log('   🖥 console error:', m.text().slice(0, 160));
  });

  const DASHBOARD = `${cfg.baseUrl}/app/retreats/${RETREAT}/dashboard`;

  try {
    await page.goto(DASHBOARD, { waitUntil: 'networkidle' });
    await page.waitForSelector('text=Dashboard del Retiro', { timeout: 15000 }).catch(() => {});
    await page.waitForLoadState('networkidle', { timeout: 3000 }).catch(() => {});
    await sleep(page, 1000);

    // ── intro (sobre el dashboard del retiro demo) ──
    await nar.say(clips.intro);

    // ── donde (sidebar: expandir Comunicaciones y señalar el ítem) ──
    await expandSection(page, 'Comunicaciones');
    const item = page.getByRole('link', { name: 'WhatsApp del Retiro', exact: true });
    await item.waitFor({ state: 'attached', timeout: 6000 });
    // La sección Comunicaciones queda debajo del pliegue del sidebar (la nav
    // es scrollable): bajarla a la vista ANTES de calcular el cue.
    await item.scrollIntoViewIfNeeded();
    await sleep(page, 400);
    const box = await item.boundingBox();
    if (box) await nar.cueAt(box.x + box.width / 2, box.y + box.height / 2);
    await sleep(page, 500);
    await nar.say(clips.donde);
    await domClick(item);
    await page.waitForSelector('text=Mensajes que los caminantes envían', { timeout: 15000 });
    await page.waitForLoadState('networkidle', { timeout: 3000 }).catch(() => {});
    await nar.clearCue();
    await sleep(page, 800);

    // ── activa (switch del superadmin, D13) ──
    const controls = page.locator('[data-testid="wa-superadmin-controls"]');
    const sw = page.locator('[data-testid="wa-enabled-switch"]');
    if (await controls.count()) {
      const cbox = await controls.boundingBox();
      if (cbox) await nar.cueAt(cbox.x + 60, cbox.y + cbox.height / 2);
      await sleep(page, 400);
    }
    await nar.say(clips.activa);
    await nar.clearCue();

    // ── consolidada + enlaces (tablero arriba) ──
    await page.evaluate(() => window.scrollTo({ top: 0 }));
    await nar.say(clips.consolidada);
    const panel = page.locator('[data-testid="wa-link-panel"]');
    if (await panel.count()) {
      const pbox = await panel.boundingBox();
      if (pbox) await nar.cueAt(pbox.x + 120, pbox.y + pbox.height / 2);
    }
    await nar.say(clips.enlaces);
    await nar.clearCue();

    // ── conversaciones (lista) ──
    const list = page.locator('[data-testid="wa-conversation-list"]');
    const lbox = await list.boundingBox();
    if (lbox) await nar.cueAt(lbox.x + lbox.width / 2, lbox.y + 80);
    await nar.say(clips.conversaciones);
    await nar.clearCue();

    // ── hilo (abrir el primer chat) ──
    const firstChat = page.locator('[data-testid^="wa-chat-row"]').first();
    await firstChat.click();
    await page.waitForSelector('[data-testid="wa-chat-thread"]', { timeout: 8000 }).catch(() => {});
    await sleep(page, 900);
    await nar.say(clips.hilo);

    // ── leer (sin visto azul) ──
    await sleep(page, 400);
    await nar.say(clips.leer);

    // ── comprobante (FR14: imagen → modal de pago con la foto adjunta) ──
    // La fila del comprobante es la 2ª conversación por última actividad
    // (siembra: WA-VIDEO-IMG de "Elio", enmascarado en pantalla). El click del
    // botón va por DOM: el contenedor scrolleable del hilo intercepta puntero
    // (misma lección que Configuración Global).
    const receiptChat = page.locator('[data-testid^="wa-chat-row"]').nth(1);
    if (await receiptChat.count()) {
      await receiptChat.click();
      await sleep(page, 900); // dejar asentar openChat (fetchThread + markSeen)
      await page.waitForSelector('[data-testid^="wa-register-payment"]', { timeout: 8000 });
      const regBtn = page.locator('[data-testid^="wa-register-payment"]').first();
      // Instrumentación: capturar el POST del comprobante para diagnosticar.
      const receiptResponse = page
        .waitForResponse((r) => r.url().includes('/receipt') && r.request().method() === 'POST', {
          timeout: 25000,
        })
        .catch(() => null);
      await domClick(regBtn);
      const resp = await receiptResponse;
      if (resp) {
        const body = await resp.json().catch(() => null);
        log(
          `   🧾 receipt POST → ${resp.status()} participantId=${body?.participantId ?? 'null'}`,
        );
      } else {
        log('   🧾 receipt POST: sin respuesta en 25 s');
      }
      await page.waitForSelector('[role="dialog"]', { timeout: 20000 });
      await sleep(page, 1200);
      await nar.say(clips.comprobante);
      // Cerrar el modal de pago: Escape (reka) + Cancelar por DOM; verificar
      // que cerró antes de seguir (taparía el modal de consentimiento).
      await page.keyboard.press('Escape').catch(() => {});
      await domClick(page.locator('[role="dialog"] button:has-text("Cancelar")').first()).catch(() => {});
      await sleep(page, 800);
    }

    // ── responder (cue al botón; NO se clican ventanas externas) ──
    const reply = page.locator('[data-testid="wa-reply-button"]');
    const rbox = await reply.boundingBox().catch(() => null);
    if (rbox) await nar.cueAt(rbox.x + rbox.width / 2, rbox.y + rbox.height / 2);
    await sleep(page, 400);
    await nar.say(clips.responder);
    await nar.clearCue();

    // ── vincular (modal: consentimiento) ──
    // OJO: el data-testid del DialogContent no sobrevive el wrapper de reka-ui;
    // el ancla de "modal abierto" es el checkbox del consentimiento.
    const linkBtn = page.locator('button:has-text("Vincular mi WhatsApp")').first();
    await domClick(linkBtn);
    await page.waitForSelector('[data-testid="wa-consent-checkbox"]', { timeout: 8000 });
    await sleep(page, 900);
    await nar.say(clips.vincular);
    await page.locator('[data-testid="wa-consent-checkbox"] input').check();
    await sleep(page, 400);
    await page.locator('[data-testid="wa-consent-continue"]').click();
    await page.waitForSelector('[data-testid="wa-qr-stage"] canvas', { timeout: 20000 });
    await sleep(page, 900);

    // ── qr ──
    await nar.say(clips.qr);

    // ── conectado (fake-wacli conecta ~7-9 s; el modal pasa solo) ──
    await page.waitForSelector('[data-testid="wa-connected-stage"]', { timeout: 25000 });
    await sleep(page, 500);
    await nar.say(clips.conectado);
    await page.locator('button:has-text("Cerrar")').first().click().catch(() => {});
    await sleep(page, 1600);

    // ── ciclo de vida (tablero de nuevo, ahora con dos vínculos) ──
    await nar.clearCue();
    await page.evaluate(() => window.scrollTo({ top: 0 }));
    await sleep(page, 500);
    await nar.say(clips.ciclo);

    // ── outro ──
    await nar.say(clips.outro);
    await sleep(page, 1400);
    await nar.clear();
    await sleep(page, 400);
  } catch (err) {
    console.error('❌ Error durante la grabación:', err);
    await page.screenshot({ path: path.join(OUTPUT_DIR, 'error-wa-inbox.png') }).catch(() => {});
  }

  const wallMs = nar.elapsedMs;
  await ctx.close();
  const videoPath = await video.path();
  await browser.close();
  log('🎬 Video crudo:', videoPath);

  const webmDur = await audioDuration(cfg.ffprobe, videoPath);
  const syncScale = computeSyncScale(webmDur, wallMs);
  log(`⏱  sync: webm ${webmDur.toFixed(1)}s / reloj ${(wallMs / 1000).toFixed(1)}s → scale ${syncScale.toFixed(4)}`);

  const out = path.join(OUTPUT_DIR, 'wa-inbox-demo.mp4');
  log('🔊 Muxeando audio…');
  await muxVideo(cfg, { video: videoPath, timeline: nar.timeline, out, syncOffsetMs: SYNC_OFFSET_MS, syncScale });

  const chapters = buildYoutubeChapters(alignChapterTimeline(nar.timeline, { syncScale }), {
    labels: CHAPTER_LABELS,
  });
  writeVideoMeta(out, {
    title: 'WhatsApp del Retiro — la bandeja de mensajes de los caminantes | Emaús',
    description:
      'Los caminantes escriben por WhatsApp a los teléfonos del equipo; con esta bandeja, el equipo ' +
      'entero los ve en un solo lugar, solo de lectura y solo durante el retiro. Cada logístico vincula ' +
      'su número escaneando un QR, las conversaciones se comparten sin exponer teléfonos personales, ' +
      'respondes desde tu propio WhatsApp y al terminar el retiro todo se borra automáticamente.',
    tags: ['Emaús', 'retiro', 'whatsapp', 'bandeja', 'logística', 'comunicación'],
    chapters,
  });
  log('✅ Listo:', out);

  log('— Timeline —');
  for (const t of nar.timeline) log(`  ${(t.offsetMs / 1000).toFixed(1)}s  ${t.id}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
