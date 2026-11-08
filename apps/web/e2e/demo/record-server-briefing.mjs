// Video-demo narrado de la feature "En qué vamos" (briefing de servidores):
// el cruce entre el Minuto a Minuto y las funciones de cada servidor.
//
// Conduce la app REAL (Chromium visible) sobre el retiro San Agustín de dev
// (datos completos: MAM materializado con titulares, responsabilidades, equipos
// y documentos), con enmascarado de PII (maskRoute), subtítulos + narración TTS
// (Deepgram Aura-2 → fallback macOS `say`) y produce un MP4 (H.264 + AAC) + meta.
//
//   cd apps/web && node e2e/demo/record-server-briefing.mjs
//
// Requiere dev arriba (web 5173 + API 3084) y .env con la key. No muta nada
// salvo un "completar actividad" en vivo que se revierte al final (PATCH).

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
  alignChapterTimeline,
  buildYoutubeChapters,
  writeVideoMeta,
  maskRoute,
  renderEndCard,
  appendEndCard,
  OUTPUT_DIR,
} from './demo-lib.mjs';

const cfg = loadEnv();
const RETREAT = process.env.RETREAT_ID || '4c8173c9-a068-4efe-a936-e3618523bead'; // default: San Agustín (demo completo)
const W = 1120,
  H = 780; // 1280x800 no cabe en el área visible de esta pantalla (ventanas abiertas)
const SYNC_OFFSET_MS = 0;
const OVERLAY = OVERLAY_INIT.replace('✝ Emaús · Tareas Pre-Retiro', '✝ Emaús · En qué vamos');

// ── Guion (tuteo, frases < 25 palabras; el cartel = lo narrado) ───────────────
const LINES = [
  { id: 'intro', text: 'Cuando el retiro está corriendo, todos preguntan lo mismo: ¿quién va dónde? Esta pantalla lo responde.' },
  { id: 'sidebar', text: 'La encuentras en Logística, junto al Minuto a Minuto: En qué vamos.' },
  { id: 'concepto', text: 'Eliges en qué actividad están, y la pantalla arma el momento: quién está en escena y dónde.' },
  { id: 'controls', text: 'Y tienes el control desde aquí: inicias, completas o mueves la actividad sin cambiar de pantalla.' },
  { id: 'enescena', text: 'En escena están los responsables de esa actividad, con su ubicación exacta y sus documentos.' },
  { id: 'picker', text: '¿Falta un responsable? Lo agregas aquí mismo, sin cambiar de pantalla.' },
  { id: 'override', text: '¿Quieres mirar otra actividad? Elígela aquí: el grupo se rearma al instante.' },
  { id: 'auto', text: 'Y con un clic vuelves al automático, que sigue la actividad en curso.' },
  { id: 'others', text: 'Los demás servidores aparecen con su próximo momento, su mesa y sus documentos.' },
  { id: 'chips', text: 'Filtra por mesa o por documentos para encontrar a cualquiera al instante.' },
  { id: 'detail', text: 'Toca un servidor y abre su briefing: dónde está ahora, y todo su día momento a momento.' },
  { id: 'assignments', text: 'En asignaciones ves sus responsabilidades fijas y sus equipos, con las instrucciones de cada dinámica.' },
  { id: 'documents', text: 'Los documentos de cada momento se abren directo, listos para el celular.' },
  { id: 'realtime', text: 'Todo corre en tiempo real: al completar una actividad, el grupo En escena se mueve solo a la siguiente.' },
  { id: 'outro', text: 'En qué vamos: el minuto a minuto y las funciones de cada servidor, cruzados al fin.' },
];

const CHAPTER_LABELS = {
  intro: 'Intro', sidebar: 'Dónde vive', concepto: 'El cruce', controls: 'Controles en vivo',
  enescena: 'En escena', picker: 'Agregar responsable', override: 'Elegir actividad',
  auto: 'Volver a automático', others: 'Los demás servidores', chips: 'Filtros',
  detail: 'Briefing del servidor', assignments: 'Asignaciones', documents: 'Documentos',
  realtime: 'Tiempo real', outro: 'Cierre',
};

const log = (...a) => console.log(...a);
const sleep = (page, ms) => page.waitForTimeout(ms);
const VIEW = (id) => `${cfg.baseUrl}/app/retreats/${id}/servidores-minuto`;

/** Expande una sección del sidebar solo si está colapsada (aria-expanded). */
async function ensureExpanded(page, label) {
  const btn = page.locator(`button[aria-expanded]:has-text("${label}")`).first();
  const expanded = await btn.getAttribute('aria-expanded');
  if (expanded !== 'true') {
    await btn.click();
    await sleep(page, 500);
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

  const browser = await chromium.launch({
    headless: false,
    slowMo: 55,
    // Forzar el tamaño de ventana: sin esto, si otra ventana (p.ej. Chrome del
    // usuario) acota el espacio visible, el viewport real sale menor que el
    // lienzo del video y la toma sale zoomada con banda gris a la derecha.
    args: ['--window-size=1120,860', '--window-position=0,0'],
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
    locale: 'es-MX',
    recordVideo: { dir: OUTPUT_DIR, size: { width: W, height: H } },
  });
  await ctx.addInitScript(() => localStorage.setItem('preferred-locale', 'es'));
  await ctx.addInitScript(OVERLAY);
  // PII del retiro real: nombres/correos/teléfonos → fakes (canónico de demo-lib).
  await ctx.route('**/api/**', maskRoute);
  // El WebSocket arranca con HTTP long-polling (/**/api/socket.io/**): si lo
  // intercepta maskRoute el handshake se corrompe y la vista queda "sin conexión
  // realtime" (el grupo En escena nunca se re-arma en vivo). Se registra DESPUÉS
  // para que gane prioridad y el handshake pase intacto. GET, no muta.
  await ctx.route('**/api/socket.io/**', (route) => route.continue());
  const page = await ctx.newPage();
  page.setDefaultTimeout(6000);
  page.setDefaultNavigationTimeout(30000);
  const video = page.video();
  const nar = new Narrator(page, cfg);
  nar.start();

  // Cookie de sesión para la mutación en vivo (completar actividad) desde node.
  const cookieVal = (await ctx.cookies(cfg.baseUrl)).find((c) => c.name === 'emaus.sid')?.value;
  const apiCall = async (method, path, body) => {
    const csrf = await fetch(`${cfg.baseUrl}/api/csrf-token`, { headers: { Cookie: `emaus.sid=${cookieVal}` } });
    const token = (await csrf.json()).csrfToken;
    const r = await fetch(`${cfg.baseUrl}/api${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', Cookie: `emaus.sid=${cookieVal}`, 'X-CSRF-Token': token },
      body: body ? JSON.stringify(body) : undefined,
    });
    return r.ok;
  };

  let completedItemId = null;
  let nextPendingId = null;
  try {
    // ── intro sobre el dashboard del retiro (para mostrar el sidebar) ──
    await page.goto(`${cfg.baseUrl}/app/retreats/${RETREAT}/dashboard`, { waitUntil: 'networkidle' });
    await page.waitForLoadState('networkidle', { timeout: 2000 }).catch(() => {});
    await nar.say(clips.intro);

    // ── sidebar: Retiro → Logística → En qué vamos ──
    await ensureExpanded(page, 'Retiro');
    await ensureExpanded(page, 'Logística');
    const link = page.getByRole('link', { name: /^En qué vamos$/ }).first();
    await link.scrollIntoViewIfNeeded().catch(() => {});
    const box = await link.boundingBox();
    if (box) await nar.cueAt(box.x + box.width / 2, box.y + box.height / 2);
    await nar.say(clips.sidebar);
    await nar.clearCue();
    await link.click();
    await page.waitForSelector('text=Estamos en', { timeout: 15000 });
    await page.waitForLoadState('networkidle', { timeout: 2000 }).catch(() => {});
    await sleep(page, 800);

    // ── concepto ──
    await page.evaluate(() => window.scrollTo({ top: 0 }));
    await nar.say(clips.concepto);

    // ── controls (hero con Iniciar / Completar / ±5) ──
    const completarBtn = page.locator('button:has-text("✓ Completar")').first();
    if (await completarBtn.count()) {
      await completarBtn.scrollIntoViewIfNeeded().catch(() => {});
      const box2 = await completarBtn.boundingBox();
      if (box2) await nar.cueAt(box2.x + box2.width / 2, box2.y + box2.height / 2);
      await sleep(page, 400);
    }
    await nar.say(clips.controls);
    await nar.clearCue();

    // ── en escena (cards del item activo) ──
    const cards = page.locator('[data-testid="briefing-card"]');
    if (await cards.count()) {
      await cards.first().scrollIntoViewIfNeeded().catch(() => {});
      await sleep(page, 500);
    }
    await nar.say(clips.enescena);

    // ── picker inline de responsables (add-only) ──
    const pickerSel = page.locator('select').filter({ hasText: 'Elegir servidor' }).first();
    if (await pickerSel.count()) {
      await pickerSel.scrollIntoViewIfNeeded().catch(() => {});
      const box3 = await pickerSel.boundingBox();
      if (box3) await nar.cueAt(box3.x + box3.width / 2, box3.y + box3.height / 2);
    }
    await nar.say(clips.picker);
    await nar.clearCue();

    // ── override manual: elegir otra actividad ──
    const select = page.locator('#briefing-activity');
    const options = await select.locator('option').allTextContents();
    const pick = options.findIndex((t, i) => i > 0 && t.includes('completed'));
    const target = pick > 0 ? pick : 3;
    if ((await select.locator('option').count()) > target) {
      await select.selectOption({ index: target });
      await sleep(page, 1000);
      await nar.say(clips.override);
      // ── volver a automático ──
      const back = page.locator('button:has-text("volver a automático")');
      if (await back.count()) {
        await back.click();
        await sleep(page, 1000);
      }
      await nar.say(clips.auto);
    } else {
      await nar.say(clips.override);
      await nar.say(clips.auto);
    }

    // ── los demás servidores ──
    const rows = page.locator('[data-testid="briefing-row"]');
    if (await rows.count()) {
      await rows.first().scrollIntoViewIfNeeded().catch(() => {});
      await sleep(page, 500);
    }
    await nar.say(clips.others);

    // ── chips de filtro (mesa / documentos) ──
    const chip = page.locator('button.rounded-full:has-text("Mesa")').first();
    if (await chip.count()) {
      await chip.scrollIntoViewIfNeeded().catch(() => {});
      const box4 = await chip.boundingBox();
      if (box4) await nar.cueAt(box4.x + box4.width / 2, box4.y + box4.height / 2);
    }
    await nar.say(clips.chips);
    await chip.click().catch(() => {});
    await sleep(page, 1000);
    await chip.click().catch(() => {}); // volver a Todas
    await sleep(page, 600);

    // ── briefing del servidor ──
    await page.evaluate(() => window.scrollTo({ top: 0 }));
    await sleep(page, 300);
    const firstCard = page.locator('[data-testid="briefing-card"]').first();
    if (await firstCard.count()) {
      await firstCard.click();
      await page.waitForSelector('text=Ahora —', { timeout: 6000 }).catch(() => {});
      await sleep(page, 700);
    }
    await nar.say(clips.detail);

    await page.locator('[role="tab"]:has-text("Asignaciones")').first().click().catch(() => {});
    await sleep(page, 900);
    await nar.say(clips.assignments);

    await page.locator('[role="tab"]:has-text("Documentos")').first().click().catch(() => {});
    await sleep(page, 900);
    await nar.say(clips.documents);
    await page.keyboard.press('Escape');
    await sleep(page, 500);

    // ── realtime: completar la actividad en curso → el grupo se mueve solo ──
    if (cookieVal) {
      const itemsRes = await fetch(`${cfg.baseUrl}/api/schedule/retreats/${RETREAT}/items`, {
        headers: { Cookie: `emaus.sid=${cookieVal}` },
      });
      const all = await itemsRes.json();
      const orden = all.sort((a, b) => (a.day !== b.day ? a.day - b.day : a.startTime.localeCompare(b.startTime)));
      const actives = orden.filter((i) => i.status === 'active');
      completedItemId = actives[0]?.id ?? null;
      if (completedItemId) {
        const idx = orden.findIndex((i) => i.id === completedItemId);
        const next = orden.find((i, k) => k > idx && i.status === 'pending');
        nextPendingId = next?.id ?? null;
      }
    }
    await nar.cueAt(300, 96);
    await nar.say(clips.realtime);
    if (cookieVal && completedItemId) {
      const ok = await apiCall('POST', `/schedule/items/${completedItemId}/complete`);
      log(ok ? '   · actividad completada en vivo' : '   · no se pudo completar en vivo');
      await sleep(page, 1600);
      if (nextPendingId) {
        const ok2 = await apiCall('POST', `/schedule/items/${nextPendingId}/start`);
        log(ok2 ? '   · siguiente actividad iniciada en vivo' : '   · no se pudo iniciar la siguiente');
        await sleep(page, 1600);
      }
    }

    // ── outro ──
    await page.evaluate(() => window.scrollTo({ top: 0 }));
    await sleep(page, 300);
    await nar.say(clips.outro);
    await sleep(page, 1200);
    await nar.clear();
    await nar.clearCue();
    await sleep(page, 400);

    // revertir la mutación en vivo (dejar San Agustín como estaba)
    if (completedItemId) {
      const back = await apiCall('PATCH', `/schedule/items/${completedItemId}`, { status: 'active' });
      log(back ? '↩︎  mutación revertida (status active)' : '⚠️ no se pudo revertir la mutación');
    }
  } catch (err) {
    console.error('❌ Error durante la grabación:', err);
    await page.screenshot({ path: path.join(OUTPUT_DIR, 'error-server-briefing.png') }).catch(() => {});
    if (completedItemId) {
      await apiCall('PATCH', `/schedule/items/${completedItemId}`, { status: 'active' }).catch(() => {});
    }
  }

  // Tarjeta final mientras el browser sigue vivo (patrón record-tour).
  const cardPath = path.join(OUTPUT_DIR, 'server-briefing-endcard.png');
  await renderEndCard(browser, {
    title: 'En qué vamos',
    subtitle: 'El minuto a minuto y las funciones de cada servidor',
    out: cardPath,
  }).catch((e) => console.warn('⚠️ endcard render:', e.message));

  const wallMs = nar.elapsedMs;
  await ctx.close();
  const videoPath = await video.path();
  await browser.close();
  log('🎬 Video crudo:', videoPath);

  const webmDur = await audioDuration(cfg.ffprobe, videoPath);
  const syncScale = computeSyncScale(webmDur, wallMs);
  log(`⏱  sync: webm ${webmDur.toFixed(1)}s / reloj ${(wallMs / 1000).toFixed(1)}s → scale ${syncScale.toFixed(4)}`);

  const out = path.join(OUTPUT_DIR, 'server-briefing-demo.mp4');
  log('🔊 Muxeando audio…');
  await muxVideo(cfg, { video: videoPath, timeline: nar.timeline, out, syncOffsetMs: SYNC_OFFSET_MS, syncScale });

  const chapters = buildYoutubeChapters(
    alignChapterTimeline(nar.timeline, { syncScale, syncOffsetMs: SYNC_OFFSET_MS }),
    { labels: CHAPTER_LABELS },
  );
  writeVideoMeta(out, {
    title: 'En qué vamos — dónde debe estar cada servidor | Emaús',
    description:
      'El cruce entre el Minuto a Minuto y las funciones: elige la actividad en curso y la plataforma arma el ' +
      'momento — quién está en escena, dónde y qué le toca a cada servidor, con su día completo, sus ' +
      'responsabilidades fijas, sus equipos con instrucciones y los documentos de cada momento. En tiempo real ' +
      'por WebSocket: al completar una actividad, el grupo se mueve solo a la siguiente.',
    tags: ['Emaús', 'retiro', 'servidores', 'minuto a minuto', 'coordinación', 'briefing'],
    chapters,
  });

  const finalOut = path.join(OUTPUT_DIR, 'server-briefing-demo-final.mp4');
  await appendEndCard(cfg, { video: out, card: cardPath, out: finalOut, seconds: 12 }).catch(
    (e) => console.warn('⚠️ endcard append:', e.message),
  );
  log('✅ Listo:', finalOut);

  log('— Timeline —');
  for (const t of nar.timeline) log(`  ${(t.offsetMs / 1000).toFixed(1)}s  ${t.id}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
