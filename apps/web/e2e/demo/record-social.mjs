// Video-demo narrado: "Familia Emaús" (capa social) — Mi Perfil, Buscar Hermanos, Hermanos,
// Seguidores y Testimonios. Recorre el grupo "Familia Emaús" del sidebar RESALTANDO el ítem
// exacto de cada pantalla y entrando a ella. Orden natural: perfil → buscar → conectar → testimonios.
//
// 100% DATOS PERSONALES → SANDBOX POR INTERCEPCIÓN. Toda pantalla se puebla con datos FICTICIOS
// (perfil, hermanos, seguidores, testimonios); no se muta nada. Como red de seguridad, cualquier
// GET no fabricado pasa por maskNode (enmascara nombres/correos/teléfonos, blanquea fotos), incluido
// el nombre/correo del propio dueño en el sidebar y Mi Perfil (vía /api/auth/status).
//
//   cd apps/web && node e2e/demo/record-social.mjs

import pw from '@playwright/test';
const { chromium } = pw;
import path from 'node:path';
import { existsSync } from 'node:fs';
import {
  loadEnv, ensureOutputDir, genTts, OVERLAY_INIT, Narrator, muxVideo,
  computeSyncScale, audioDuration, buildYoutubeChapters, writeVideoMeta, OUTPUT_DIR,
  renderEndCard, appendEndCard,
} from './demo-lib.mjs';
import { installSocialSandbox } from './social-sandbox.mjs';

const cfg = loadEnv();
const W = 1280, H = 800;
const SYNC_OFFSET_MS = 0;
const OVERLAY = OVERLAY_INIT.replace('✝ Emaús · Tareas Pre-Retiro', '✝ Emaús · Familia Emaús');

// ── Guion ─────────────────────────────────────────────────────────────────────────────────────
const LINES = [
  { id: 'intro', text: 'Conoce la Familia Emaús: tu espacio para conectar con los demás hermanos de la comunidad. Todo vive en este grupo del menú.' },
  { id: 'perfil', text: 'Empieza por Mi Perfil: tu presencia en la comunidad. Aquí pones tu foto, una biografía y de dónde eres.' },
  { id: 'tags', text: 'Agregas tus intereses y tus dones para servir, así otros hermanos afines pueden encontrarte.' },
  { id: 'privacy', text: 'Y tú decides qué se ve: tu correo, tu teléfono y los retiros en los que participaste.' },
  { id: 'buscar', text: 'En Buscar Hermanos encuentras a otros por nombre, o filtras por intereses, habilidades o retiro.' },
  { id: 'acciones', text: 'Desde cada tarjeta puedes conectar como hermano o seguir a la persona.' },
  { id: 'hermanos', text: 'En Hermanos gestionas tus conexiones: los aceptados, y las solicitudes que llegan o que enviaste.' },
  { id: 'pendientes', text: 'Cuando alguien te envía una solicitud, la aceptas o la rechazas desde Pendientes.' },
  { id: 'seguidores', text: 'En Seguidores ves quién te sigue, a quién sigues tú, y quiénes aún no te siguen de vuelta.' },
  { id: 'testimonios', text: 'Y en Testimonios compartes lo que viviste en tu retiro. Aquí guardas los tuyos.' },
  { id: 'nuevoTest', text: 'Escribes tu experiencia y eliges quién puede verla: solo tú, los de tu retiro, tus hermanos, o todos.' },
  { id: 'landing', text: 'Y si quieres, lo ofreces para la página pública del sitio; un administrador lo revisa antes de publicarlo.' },
  { id: 'outro', text: 'Esa es la Familia Emaús: tu perfil, tus hermanos y tus testimonios, en un mismo lugar.' },
];

// Cada paso: url (navega), item (resalta el ítem del grupo "Familia Emaús"), scroll, search, etc.
const GROUP = 'Familia Emaús';
const STEPS = [
  { clip: 'intro', url: '/app/profile', wait: /Mi Perfil/i, group: true, settle: 2200 },
  { clip: 'perfil', item: 'Mi Perfil', cue: /Informaci[óo]n b[áa]sica/i },
  { clip: 'tags', scrollText: /Intereses|Habilidades|dones/i, cue: /Intereses|Habilidades/i },
  { clip: 'privacy', scrollText: /Mostrar tel[eé]fono/i, cue: /Configuración de Privacidad/i },
  { clip: 'buscar', url: '/app/social/search', wait: /Buscar Hermanos/i, item: 'Buscar Hermanos', search: 'a', settle: 1200 },
  { clip: 'acciones', cueBtn: /Conectar como hermano/i },
  { clip: 'hermanos', url: '/app/social/friends', wait: /Gestiona tus hermanos/i, item: 'Hermanos' },
  { clip: 'pendientes', tab: 'Pendientes', cueTab: 'Pendientes' },
  { clip: 'seguidores', url: '/app/social/followers', wait: /Gestiona tus seguidores/i, item: 'Seguidores', cue: /No te siguen de vuelta|Te sigue desde/i },
  { clip: 'testimonios', url: '/app/testimonials', wait: /Comparte tus experiencias/i, item: 'Testimonios', settle: 1200 },
  { clip: 'nuevoTest', openTestimonial: true, cueSel: '#visibility' },
  { clip: 'landing', cueSel: '#allowLandingPage', holdMs: 1600, closeTestimonial: true },
  { clip: 'outro', group: true },
];

const YT_TITLE = 'Familia Emaús: tu perfil, tus hermanos y tus testimonios';
const YT_DESCRIPTION =
  'La capa social de Emaús para conectar con la comunidad. Recorremos el grupo "Familia Emaús" del menú: ' +
  'Mi Perfil (foto, biografía, ubicación, intereses y dones, y la privacidad de tu correo, teléfono y retiros); ' +
  'Buscar Hermanos (por nombre o con filtros de intereses, habilidades y retiro, y las acciones de conectar o seguir); ' +
  'Hermanos (conexiones aceptadas, solicitudes pendientes y enviadas); Seguidores (quién te sigue, a quién sigues y ' +
  'quiénes no te siguen de vuelta); y Testimonios (comparte tu experiencia del retiro, elige quién puede verla y ' +
  'ofrécela para la página pública, con aprobación del administrador). Todos los datos mostrados son ficticios.';
const YT_TAGS = ['Emaús', 'retiro', 'tutorial', 'Familia Emaús', 'perfil', 'hermanos', 'seguidores', 'testimonios', 'comunidad', 'social'];
// Nota: buildYoutubeChapters exige ≥10s entre capítulos (regla de YouTube), así que beats muy
// juntos se fusionan. Los labels evitan numerales para no dejar huérfanos ("2." sin "1.").
const CHAPTER_LABELS = {
  intro: 'Mi Perfil', perfil: 'Mi Perfil', tags: 'Intereses y privacidad', privacy: 'Intereses y privacidad',
  buscar: 'Buscar Hermanos', acciones: 'Conectar o seguir', hermanos: 'Hermanos', pendientes: 'Solicitudes',
  seguidores: 'Seguidores', testimonios: 'Testimonios', nuevoTest: 'Testimonios', landing: 'Página pública', outro: 'Resumen',
};

const log = (...a) => console.log(...a);
const sleep = (page, ms) => page.waitForTimeout(ms);
async function cueLoc(nar, loc) {
  try {
    await loc.scrollIntoViewIfNeeded();
    const b = await loc.boundingBox();
    if (b) await nar.cueAt(b.x + b.width / 2, b.y + b.height / 2);
  } catch {}
}
async function cue(nar, page, sel) {
  const loc = (sel instanceof RegExp) ? page.getByText(sel).first() : page.locator(sel).first();
  await cueLoc(nar, loc);
}
function sectionBtn(page, label) {
  const esc = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return page.locator('button', { hasText: new RegExp(`^\\s*${esc}\\s*$`, 'i') }).first();
}
async function ensureExpanded(page, label) {
  const hdr = sectionBtn(page, label);
  if ((await hdr.getAttribute('aria-expanded').catch(() => null)) !== 'true') {
    await hdr.scrollIntoViewIfNeeded().catch(() => {});
    await hdr.click().catch(() => {});
    await page.waitForTimeout(450);
  }
}

async function main() {
  ensureOutputDir();
  log('🎙️  TTS…');
  const clips = {};
  for (const l of LINES) { clips[l.id] = { id: l.id, text: l.text, ...(await genTts(cfg, l.id, l.text)) }; }

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
  await installSocialSandbox(page);

  const video = page.video();
  const nar = new Narrator(page, cfg);
  nar.start();

  try {
    for (const step of STEPS) {
      await nar.clearCue().catch(() => {});
      if (step.url) {
        await page.goto(`${cfg.baseUrl}${step.url}`, { waitUntil: 'domcontentloaded' }).catch(() => {});
        await page.waitForLoadState('networkidle', { timeout: 2500 }).catch(() => {});
        if (step.wait) await page.getByText(step.wait).first().waitFor({ timeout: 6000 }).catch(() => {});
        await sleep(page, step.settle || 900);
      }
      // Buscar Hermanos: escribir término y buscar.
      if (step.search) {
        await page.locator('input[type="text"]').first().fill(step.search).catch(() => {});
        await page.locator('input[type="text"]').first().press('Enter').catch(() => {});
        await page.waitForLoadState('networkidle', { timeout: 3000 }).catch(() => {});
        await sleep(page, 1000);
      }
      // Resaltar el ítem exacto del grupo "Familia Emaús" (expandir el grupo si está colapsado).
      if (step.item) {
        await ensureExpanded(page, GROUP);
        const esc = step.item.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const link = page.getByRole('link', { name: new RegExp('^\\s*' + esc, 'i') }).first();
        await cueLoc(nar, link);
      }
      // Resaltar el encabezado del grupo (intro/outro).
      if (step.group) {
        await ensureExpanded(page, GROUP);
        await cueLoc(nar, sectionBtn(page, GROUP));
      }
      // Cambiar de pestaña (Pendientes / etc.).
      if (step.tab) {
        const tab = page.getByRole('tab', { name: new RegExp(step.tab, 'i') }).first();
        await tab.click().catch(() => page.getByText(step.tab, { exact: true }).first().click().catch(() => {}));
        await sleep(page, 800);
        if (step.cueTab) await cueLoc(nar, page.getByRole('tab', { name: new RegExp(step.cueTab, 'i') }).first());
      }
      // Abrir el formulario de Nuevo testimonio.
      if (step.openTestimonial) {
        await page.getByRole('button', { name: /Nuevo testimonio/i }).first().evaluate((el) => el.click()).catch(() => {});
        await sleep(page, 900);
        await page.locator('#content').first().waitFor({ timeout: 4000 }).catch(() => {});
      }
      if (step.scrollText) { await page.getByText(step.scrollText).first().scrollIntoViewIfNeeded().catch(() => {}); await sleep(page, 600); }
      if (step.cueBtn) await cueLoc(nar, page.getByRole('button', { name: step.cueBtn }).first());
      if (step.cueSel) await cueLoc(nar, page.locator(step.cueSel).first());
      if (step.cue) await cue(nar, page, step.cue);
      await nar.say(clips[step.clip]);
      if (step.holdMs) await sleep(page, step.holdMs);
      if (step.closeTestimonial) {
        await page.getByRole('button', { name: /Cancelar/i }).first().click().catch(() => {});
        await sleep(page, 700);
      }
    }
    await sleep(page, 800);
    await nar.clear();
    await sleep(page, 400);
  } catch (err) {
    console.error('❌ Error:', err);
    await page.screenshot({ path: path.join(OUTPUT_DIR, 'error-social.png') }).catch(() => {});
  }

  const wallMs = nar.elapsedMs;
  await ctx.close();
  const videoPath = await video.path();
  const endcardPng = path.join(OUTPUT_DIR, 'endcard-social.png');
  await renderEndCard(browser, {
    title: 'La Familia<br>Emaús',
    subtitle: 'Tu perfil, tus hermanos y tus testimonios, en un mismo lugar.',
    bgPath: path.join(OUTPUT_DIR, 'thumb-social-bg.png'),
    out: endcardPng,
  }).catch((e) => console.warn('⚠️ endcard render:', e.message));
  await browser.close();
  log('🎬', videoPath);

  const webmDur = await audioDuration(cfg.ffprobe, videoPath);
  const syncScale = computeSyncScale(webmDur, wallMs);
  log(`⏱ webm ${webmDur.toFixed(1)}s reloj ${(wallMs / 1000).toFixed(1)}s scale ${syncScale.toFixed(4)}`);

  const out = path.join(OUTPUT_DIR, 'social-demo.mp4');
  await muxVideo(cfg, { video: videoPath, timeline: nar.timeline, out, syncOffsetMs: SYNC_OFFSET_MS, syncScale });

  if (existsSync(endcardPng)) {
    await appendEndCard(cfg, { video: out, card: endcardPng, out, seconds: 14 }).catch((e) => console.warn('⚠️ appendEndCard:', e.message));
    log('🎬 tarjeta final agregada (14s)');
  }

  const LEAD_KEEP_MS = 700;
  const scaled = nar.timeline.map((t) => t.offsetMs * syncScale + SYNC_OFFSET_MS);
  const leadTrimMs = scaled.length ? Math.max(0, Math.min(...scaled) - LEAD_KEEP_MS) : 0;
  const chapterTimeline = nar.timeline.map((t) => ({ ...t, offsetMs: Math.max(0, Math.round(t.offsetMs * syncScale + SYNC_OFFSET_MS - leadTrimMs)) }));
  const chapters = buildYoutubeChapters(chapterTimeline, { labels: CHAPTER_LABELS });
  writeVideoMeta(out, { title: YT_TITLE, description: YT_DESCRIPTION, tags: YT_TAGS, chapters });
  log('✅ Listo:', out);
  for (const t of nar.timeline) log(`  ${(t.offsetMs / 1000).toFixed(1)}s  ${t.id}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
