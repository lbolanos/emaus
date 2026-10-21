// Video-demo narrado de la feature "Caso especial" (specs/special-case).
//
// Conduce la app REAL (Chromium visible) sobre San Agustín, con subtítulos
// sobre-impuestos + narración TTS (Deepgram Aura-2 → fallback macOS `say`) y
// produce un MP4 (H.264 + AAC). PII enmascarada con maskRoute sobre **/api/**.
//
//   cd apps/web && node e2e/demo/record-special-case.mjs
//
// Requiere dev arriba (web 5173 + API 3084) y apps/web/e2e/demo/.env con la key.
// Mutación REAL acotada: marca UN caminante durante el guion y lo desmarca al
// final; si el guion muere a mitad, el bloque de limpieza (contexto aparte, sin
// grabación) quita la marca para dejar la base como estaba.

import pw from '@playwright/test';
const { chromium } = pw;
import path from 'node:path';
import { existsSync } from 'node:fs';
import {
  loadEnv,
  ensureOutputDir,
  genTts,
  maskRoute,
  OVERLAY_INIT,
  Narrator,
  muxVideo,
  computeSyncScale,
  audioDuration,
  buildYoutubeChapters,
  writeVideoMeta,
  renderEndCard,
  appendEndCard,
  OUTPUT_DIR,
} from './demo-lib.mjs';

const cfg = loadEnv();
const RETREAT = process.env.RETREAT_ID || '4c8173c9-a068-4efe-a936-e3618523bead'; // San Agustín
const W = 1280,
  H = 800;
const SYNC_OFFSET_MS = 0; // ajustar tras verificar frames si audio↔video se desfasa

// ── Guion (tuteo, frases < 25 palabras; el cartel = lo narrado) ───────────────
const LINES = [
  { id: 'intro', text: 'Cuando el palanquero detecta algo que el coordinador debe revisar, marca al caminante como caso especial.' },
  { id: 'palancas', text: 'Todo nace en Comunicaciones, dentro de Palancas.' },
  { id: 'toggle', text: 'Cada caminante trae este interruptor para marcarlo.' },
  { id: 'dialog', text: 'Eliges el motivo: habitación aparte, salud u otra; y puedes anotar el detalle.' },
  { id: 'saved', text: 'Guardado: el caminante queda con esta etiqueta ámbar junto a su nombre.' },
  { id: 'menu', text: 'El menú muestra cuántos casos esperan atención. Entremos a la bandeja.' },
  { id: 'bandeja', text: 'Aquí el coordinador ve cada caso: categoría, nota y teléfono para contactarlo.' },
  { id: 'dashboard', text: 'El dashboard también resume los casos pendientes por categoría.' },
  { id: 'remove', text: 'Cuando lo atendiste, quitas la marca y el motivo se borra.' },
  { id: 'outro', text: 'Solo los roles con permiso de salud ven esta información. Casos especiales: nada queda en el olvido.' },
];

// ── Metadata para YouTube (upload-to-youtube.mjs la lee del .meta.json) ───────
const YT_TITLE = 'Casos especiales — la marca que llega al coordinador | Emaús';
const YT_DESCRIPTION = [
  'Cómo funciona la marca de Casos especiales en Emaús: el palanquero marca a un',
  'caminante desde Palancas con un motivo (habitación aparte, salud u otra) y una',
  'nota; el coordinador lo ve en su bandeja con contador en el menú, resumen por',
  'categoría en el dashboard, y quita la marca cuando ya lo atendió.',
].join(' ');
const YT_TAGS = ['Emaús', 'retiro', 'casos especiales', 'palancas', 'coordinador', 'tutorial'];
// Etiquetas cortas de capítulo por id de línea (el timeline decide cuáles entran).
const CHAPTER_LABELS = {
  intro: 'Qué es un caso especial',
  palancas: 'Dónde se marca: Palancas',
  toggle: 'El interruptor por caminante',
  dialog: 'Motivo y nota',
  saved: 'La etiqueta ámbar',
  menu: 'El contador del menú',
  bandeja: 'La bandeja del coordinador',
  dashboard: 'Resumen en el dashboard',
  remove: 'Quitar la marca',
  outro: 'Cierre',
};

const log = (...a) => console.log(...a);
const sleep = (page, ms) => page.waitForTimeout(ms);

// Anillo de cue sobre un locator (posición dinámica vía boundingBox).
async function cueLocator(nar, loc) {
  const b = await loc.boundingBox().catch(() => null);
  if (b) await nar.cueAt(b.x + b.width / 2, b.y + b.height + 16).catch(() => {});
}

// Expande una sección del sidebar solo si está colapsada (clic de más lo cerraría).
async function ensureExpanded(page, label) {
  const btn = page.locator('button', { hasText: new RegExp(`^\\s*${label}\\s*$`, 'i') }).first();
  const expanded = await btn.getAttribute('aria-expanded').catch(() => null);
  if (expanded !== 'true') {
    await btn.click().catch(() => {});
    await sleep(page, 600);
  }
}

// Login sin grabar → storageState. La navegación post-login no es confiable
// (cuelga en headless y a veces en headed); las cookies quedan asentadas, así
// que verificamos sesión por /auth/status y capturamos el estado.
async function loginWithRetries(browser, attempts = 3) {
  for (let i = 1; i <= attempts; i++) {
    const ctx = await browser.newContext({ viewport: { width: W, height: H }, locale: 'es-MX' });
    await ctx.addInitScript(() => localStorage.setItem('preferred-locale', 'es'));
    const p = await ctx.newPage();
    try {
      await p.goto(cfg.baseUrl + '/login', { waitUntil: 'domcontentloaded', timeout: 30000 });
      await p.fill('#email', cfg.email, { timeout: 10000 });
      await p.fill('#password', cfg.password);
      await p.press('#password', 'Enter');
      await p.waitForURL(/\/app/, { timeout: 15000 }).catch(() => {});
      await p.waitForTimeout(2500);
      const ok = await p
        .evaluate(async () => {
          const r = await fetch('/api/auth/status', { credentials: 'include' });
          const j = await r.clone().json().catch(() => ({}));
          return r.status === 200 && j.authenticated !== false && !!j.id;
        })
        .catch(() => false);
      if (!ok) throw new Error('sesión no activa tras login');
      const state = await ctx.storageState();
      await ctx.close();
      return state;
    } catch (e) {
      log(`   login intento ${i} falló: ${e.message.split('\n')[0]}`);
      await ctx.close().catch(() => {});
      if (i === attempts) throw e;
      await new Promise((r) => setTimeout(r, 4000 * i));
    }
  }
}

async function main() {
  ensureOutputDir();

  // 1) Pre-generar TTS (duraciones conocidas antes de grabar).
  log('🎙️  Generando narración TTS…');
  const clips = {};
  for (const l of LINES) {
    clips[l.id] = { id: l.id, text: l.text, ...(await genTts(cfg, l.id, l.text)) };
    log(`   · ${l.id} → ${clips[l.id].duration.toFixed(1)}s`);
  }

  const browser = await chromium.launch({ headless: false, slowMo: 55 });

  // 2) Login sin grabar → storageState (el video arranca ya autenticado).
  log('🔐 Login…');
  const state = await loginWithRetries(browser);

  // 3) Contexto de grabación (autenticado, español, PII enmascarada).
  const ctx = await browser.newContext({
    storageState: state,
    locale: 'es-MX',
    viewport: { width: W, height: H },
    recordVideo: { dir: OUTPUT_DIR, size: { width: W, height: H } },
  });
  await ctx.addInitScript(OVERLAY_INIT);
  await ctx.addInitScript(() => localStorage.setItem('preferred-locale', 'es'));
  const page = await ctx.newPage();
  await page.route('**/api/**', maskRoute);
  page.setDefaultTimeout(6000);
  page.setDefaultNavigationTimeout(30000);
  // window.confirm al quitar la marca: visible ~1.2 s (se graba), luego aceptar.
  page.on('dialog', async (d) => {
    try {
      await page.waitForTimeout(1200);
      await d.accept();
    } catch {}
  });

  const video = page.video();
  const nar = new Narrator(page, cfg);
  nar.start(); // t0 = inicio del video

  try {
    // ── E0: Dashboard de San Agustín (intro) ──
    await page.goto(`${cfg.baseUrl}/app/retreats/${RETREAT}/dashboard`, { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
    await page.waitForSelector('#ds-section-specialCases', { timeout: 12000 }).catch(() => {});
    await sleep(page, 1500);
    await nar.say(clips.intro);

    // ── E1: Sidebar → Palancas (dónde vive) ──
    await ensureExpanded(page, 'Comunicaciones');
    const palancasItem = page.getByRole('link', { name: /^Palancas/i }).first();
    await cueLocator(nar, palancasItem);
    await nar.say(clips.palancas);
    await palancasItem.click();
    await page.waitForSelector('[data-testid="special-case-toggle"]', { timeout: 12000 }).catch(() => {});
    await sleep(page, 1200);

    // ── E2: el interruptor del primer caminante ──
    const toggle = page.locator('[data-testid="special-case-toggle"]').first();
    await toggle.scrollIntoViewIfNeeded().catch(() => {});
    await sleep(page, 600);
    await cueLocator(nar, toggle);
    await nar.say(clips.toggle);

    // ── E3: diálogo motivo + nota (abierto durante la narración) ──
    await toggle.click();
    await sleep(page, 900);
    await nar.say(clips.dialog);
    const dlg = page.locator('[data-testid="special-case-form"]');
    await dlg.locator('input[name="special-case-category"][value="health"]').check().catch(() => {});
    await sleep(page, 400);
    const note = dlg.locator('textarea');
    await note.click().catch(() => {});
    await note.pressSequentially('Necesita medicación en horarios fijos', { delay: 45 }).catch(() => {});
    await sleep(page, 600);

    // ── E4: guardar → badge ámbar en la fila ──
    await dlg.getByRole('button', { name: /Marcar caso especial/ }).click();
    await sleep(page, 2000); // PUT + refetch + badge
    const badge = page.locator('[data-testid="special-case-badge"]').first();
    await badge.scrollIntoViewIfNeeded().catch(() => {});
    await sleep(page, 500);
    await cueLocator(nar, badge);
    await nar.say(clips.saved);

    // ── E5: sidebar → Casos especiales (contador) ──
    await ensureExpanded(page, 'Comunicaciones');
    const scItem = page.getByRole('link', { name: /^Casos especiales/i }).first();
    await cueLocator(nar, scItem);
    await nar.say(clips.menu);
    await scItem.click();
    await page
      .waitForSelector('[data-testid="special-cases-count"], [data-testid="special-cases-empty"], [data-testid="special-case-row"]', {
        timeout: 12000,
      })
      .catch(() => {});
    await sleep(page, 1200);

    // ── E6: bandeja (fila, categoría, nota, contacto) ──
    const row = page.locator('[data-testid="special-case-row"]').first();
    await cueLocator(nar, row);
    await nar.say(clips.bandeja);

    // ── E7: tarjeta en el dashboard (goto directo: el click del ítem se topa con
    //    las grace-areas de Favoritos/Comunidad del sidebar que interceptan) ──
    await page.goto(`${cfg.baseUrl}/app/retreats/${RETREAT}/dashboard`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#ds-section-specialCases', { timeout: 12000 }).catch(() => {});
    await sleep(page, 1000);
    const card = page.locator('#ds-section-specialCases');
    await card.scrollIntoViewIfNeeded().catch(() => {});
    await sleep(page, 500);
    await cueLocator(nar, card);
    await nar.say(clips.dashboard);

    // ── E8: volver a la bandeja → quitar marca (confirm nativo) ──
    //    El retiro sigue seleccionado en este contexto → goto directo a la bandeja.
    await page.goto(`${cfg.baseUrl}/app/special-cases`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-testid="special-case-row"]', { timeout: 12000 }).catch(() => {});
    await sleep(page, 900);
    await nar.say(clips.remove);
    const removeBtn = page.locator('[data-testid="special-case-row"] [data-testid="special-case-toggle"]').first();
    await cueLocator(nar, removeBtn);
    await removeBtn.click();
    await sleep(page, 2400);

    // ── E9: cierre ──
    await nar.clearCue();
    await nar.say(clips.outro);
    await sleep(page, 1200);
    await nar.clear();
    await sleep(page, 400);
  } catch (err) {
    console.error('❌ Error durante la grabación:', err);
    await page.screenshot({ path: path.join(OUTPUT_DIR, 'error-special-case.png') }).catch(() => {});
  }

  const wallMs = nar.elapsedMs;
  await ctx.close(); // finaliza el .webm
  const videoPath = await video.path();

  // 4) Limpieza defensiva en contexto APARTE (sin grabación): si el guion murió
  //    tras marcar, quitar la marca para dejar la base como estaba.
  const clean = await browser.newContext({ storageState: state, locale: 'es-MX' });
  const cp = await clean.newPage();
  try {
    // La bandeja requiere retiro seleccionado: fijarlo con el dashboard con :id
    // ANTES (sin esto el contexto fresco redirige y el conteo da 0 falso).
    await cp.goto(`${cfg.baseUrl}/app/retreats/${RETREAT}/dashboard`, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await cp.waitForTimeout(2000);
    await cp.goto(`${cfg.baseUrl}/app/special-cases`, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await cp.waitForSelector('[data-testid="special-case-row"]', { timeout: 6000 }).catch(() => {});
    const rows = await cp.locator('[data-testid="special-case-row"]').count();
    if (rows > 0) {
      cp.on('dialog', (d) => d.accept().catch(() => {}));
      log(`🧹 quitando ${rows} caso(s) marcado(s)…`);
      for (let i = 0; i < rows; i++) {
        await cp.locator('[data-testid="special-case-toggle"]').first().click();
        await cp.waitForTimeout(1500);
      }
      log(`🧹 filas restantes: ${await cp.locator('[data-testid="special-case-row"]').count()}`);
    } else {
      log('🧹 sin casos marcados al cerrar ✓');
    }
  } catch (e) {
    log('⚠️ limpieza:', e.message.split('\n')[0]);
  }
  await clean.close();

  // 5) Tarjeta final (fondo acuarela si existe, si no degradado).
  const endcardPng = path.join(OUTPUT_DIR, 'endcard-special-case.png');
  await renderEndCard(browser, {
    title: 'Casos<br>especiales',
    subtitle: 'La marca del palanquero llega al coordinador.',
    out: endcardPng,
  }).catch((e) => console.warn('⚠️ endcard render:', e.message));
  await browser.close();
  log('🎬 Video crudo:', videoPath);

  // 6) Mux: video + clips a sus offsets → MP4 (escala corrige el drift del webm).
  const webmDur = await audioDuration(cfg.ffprobe, videoPath);
  const syncScale = computeSyncScale(webmDur, wallMs);
  log(`⏱  sync: webm ${webmDur.toFixed(1)}s / reloj ${(wallMs / 1000).toFixed(1)}s → scale ${syncScale.toFixed(4)}`);
  const out = path.join(OUTPUT_DIR, 'special-case-demo.mp4');
  log('🔊 Muxeando audio…');
  await muxVideo(cfg, { video: videoPath, timeline: nar.timeline, out, syncOffsetMs: SYNC_OFFSET_MS, syncScale });

  // Tarjeta final: 14s de lienzo limpio para las Pantallas Finales de YouTube.
  if (existsSync(endcardPng)) {
    await appendEndCard(cfg, { video: out, card: endcardPng, out, seconds: 14 }).catch((e) =>
      console.warn('⚠️ appendEndCard:', e.message)
    );
    log('🎬 tarjeta final agregada (14s)');
  }
  log('✅ Listo:', out);

  // 7) Metadata para YouTube (título, descripción, tags y capítulos del timeline).
  const chapters = buildYoutubeChapters(nar.timeline, { labels: CHAPTER_LABELS });
  const metaPath = writeVideoMeta(out, {
    title: YT_TITLE,
    description: YT_DESCRIPTION,
    tags: YT_TAGS,
    chapters,
  });
  log('📝 Metadata:', metaPath, `(${chapters.length} capítulos)`);

  // Timeline para depurar sincronía (offsets en seg).
  log('— Timeline —');
  for (const t of nar.timeline) log(`  ${(t.offsetMs / 1000).toFixed(1)}s  ${t.id}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
