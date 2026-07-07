// Video-demo narrado: "Crear y configurar un retiro".
//
// Muestra dónde está en el menú (sección Retiro → Agregar Retiro) y recorre el formulario:
// General (parroquia, tipo, número, casa, fechas, zona horaria) y Logística (máximos), y menciona
// las demás pestañas. NO envía (evita crear un retiro real).
//
//   cd apps/web && node e2e/demo/record-create-retreat.mjs
//
// Login por storageState + español forzado. Enmascara el endpoint de usuarios (el fondo es la
// pantalla de roles, que muestra correos reales) por privacidad.

import pw from '@playwright/test';
const { chromium } = pw;
import path from 'node:path';
import {
  loadEnv, ensureOutputDir, genTts, OVERLAY_INIT, Narrator, muxVideo,
  computeSyncScale, audioDuration, buildYoutubeChapters, writeVideoMeta, OUTPUT_DIR,
} from './demo-lib.mjs';

const cfg = loadEnv();
const RETREAT = process.env.RETREAT_ID || '96f06c40-327a-4513-ae48-fb4c60bbab17'; // Celaya (fondo)
const W = 1280, H = 800;
const SYNC_OFFSET_MS = 0;
const OVERLAY = OVERLAY_INIT.replace('✝ Emaús · Tareas Pre-Retiro', '✝ Emaús · Crear un Retiro');

// Enmascarar PII del endpoint de usuarios (fondo = pantalla de roles).
const FAKES = ['María López', 'Juan Pérez', 'Ana Torres', 'Pedro Gómez'];
function maskPII(node, ctr) {
  if (Array.isArray(node)) return node.forEach((n) => maskPII(n, ctr));
  if (node && typeof node === 'object') {
    if (typeof node.email === 'string' && node.email.includes('@')) {
      const name = FAKES[ctr.i++ % FAKES.length];
      node.email = name.toLowerCase().replace(/[^a-z]/g, '.') + '@correo.com';
      if ('displayName' in node) node.displayName = name;
      if ('firstName' in node) node.firstName = name.split(' ')[0];
      if ('lastName' in node) node.lastName = name.split(' ')[1] || '';
      if ('photo' in node) node.photo = null;
    } else if (typeof node.displayName === 'string') {
      node.displayName = 'Coordinación';
    }
    for (const k of Object.keys(node)) maskPII(node[k], ctr);
  }
}

const LINES = [
  { id: 'sidebar', text: '¿Cómo creas un retiro nuevo? En el menú, en la sección Retiro, toca Agregar Retiro.' },
  { id: 'general', text: 'En General escribes la parroquia, el tipo y el número. El enlace corto se genera solo.' },
  { id: 'house', text: 'Eliges la casa donde se hará y las fechas. La zona horaria se hereda de la casa.' },
  { id: 'maximos', text: 'Al elegir la casa, los máximos de caminantes y servidores se toman de sus camas. Puedes ajustarlos aquí.' },
  { id: 'templates', text: 'También eliges los templates: al crear, se clonan la agenda del Minuto a Minuto y las Tareas Pre-Retiro.' },
  { id: 'publish', text: 'En Ajustes decides si el retiro es público. Al publicarlo, cualquiera puede inscribirse con el enlace; hazlo cuando estés listo.' },
  { id: 'finanzas', text: 'En Finanzas pones el costo del caminante, el cobro del servidor y el valor por comida.' },
  { id: 'recuerdos', text: 'Y los Recuerdos, las fotos del retiro, se agregan después, cuando el retiro ya terminó.' },
  { id: 'save', text: 'Al terminar, tocas Crear Retiro y queda listo para organizarlo.' },
];

const YT_TITLE = 'Cómo crear y configurar un retiro en Emaús';
const YT_DESCRIPTION =
  'Guía para crear un retiro nuevo en Emaús: dónde está en el menú (sección Retiro → Agregar ' +
  'Retiro) y cómo llenar el formulario — parroquia, tipo y número, la casa y las fechas, la zona ' +
  'horaria, los máximos de caminantes y servidores en Logística, y las demás pestañas (finanzas, ' +
  'notas, clausura, volante, recuerdos).';
const YT_TAGS = ['Emaús', 'retiro', 'crear retiro', 'configurar', 'casa', 'tutorial'];
const CHAPTER_LABELS = {
  sidebar: 'Dónde crear el retiro', general: 'Datos generales', house: 'Casa y fechas',
  maximos: 'Máximos (desde la casa)', templates: 'Templates', publish: 'Publicar el retiro',
  finanzas: 'Finanzas (costos)', recuerdos: 'Recuerdos (post-retiro)', save: 'Crear Retiro',
};

const log = (...a) => console.log(...a);
const sleep = (page, ms) => page.waitForTimeout(ms);

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
  await page.route('**/retreat-roles/retreat/*/users', async (route) => {
    try {
      const resp = await route.fetch();
      const data = await resp.json();
      maskPII(data, { i: 0 });
      await route.fulfill({ response: resp, body: JSON.stringify(data) });
    } catch { await route.continue(); }
  });

  const video = page.video();
  const nar = new Narrator(page, cfg);
  nar.start();

  const pickFirstOption = async () => {
    await page.getByRole('option').first().click({ timeout: 3000 }).catch(() => page.keyboard.press('Escape'));
  };

  try {
    // fondo con sidebar (renderiza confiable)
    await page.goto(`${cfg.baseUrl}/app/retreats/${RETREAT}/role-management`, { waitUntil: 'networkidle' });
    await page.getByText('Gestión de Roles del Retiro').first().waitFor({ timeout: 15000 });
    await sleep(page, 1200);

    // ── Ubicación en el menú: sección Retiro → Agregar Retiro ──
    const addBtn = page.getByRole('button', { name: /Agregar Retiro/i }).first();
    const abox = await addBtn.boundingBox().catch(() => null);
    const cx = abox ? abox.x + abox.width / 2 : 0;
    const cy = abox ? abox.y + abox.height / 2 : 0;
    await addBtn.hover().catch(() => {}); // resaltar el botón durante la narración
    if (abox) await nar.cueAt(cx, cy);
    await nar.say(clips.sidebar); // 1ª voz (recorte) → el clic queda después
    if (abox) await nar.cueAt(cx, cy); // otro anillo sobre el "+"
    await sleep(page, 700); // dejar el "+" señalado un momento más antes de abrir
    await addBtn.click().catch(() => {});
    await page.getByText('Agregar Retiro').first().waitFor({ timeout: 8000 }).catch(() => {});
    await sleep(page, 900);

    // ── General ──
    await page.fill('#parish', 'San José Obrero');
    await sleep(page, 250);
    await page.locator('#retreatType').click().catch(() => {});
    await sleep(page, 400);
    await pickFirstOption();
    await page.fill('#retreatNumber', 'XLVII');
    await sleep(page, 300);
    await nar.say(clips.general);

    // ── Casa + fechas (al elegir casa se auto-llenan los máximos) ──
    await page.locator('#houseId').click().catch(() => {});
    await sleep(page, 400);
    // Elegir una casa con bastantes camas (números realistas en los máximos).
    await page
      .getByRole('option', { name: /Casa de Retiro Ema/i })
      .first()
      .click({ timeout: 3000 })
      .catch(() => pickFirstOption());
    await sleep(page, 500);
    await page.fill('#startDate', '2026-09-18').catch(() => {});
    await page.fill('#endDate', '2026-09-21').catch(() => {});
    await sleep(page, 300);
    await nar.say(clips.house);

    // ── Logística: máximos (desde la casa, editables) ──
    await page.getByRole('tab', { name: /Logística/i }).click().catch(() => {});
    await sleep(page, 700);
    await page.locator('#max_walkers').scrollIntoViewIfNeeded().catch(() => {});
    await nar.say(clips.maximos);
    await page.fill('#max_walkers', '45').catch(() => {}); // mostrar que es editable
    await sleep(page, 500);

    // ── Logística: templates (Minuto a Minuto + Tareas Pre-Retiro) ──
    await page.getByText('Template Minuto a Minuto').first().scrollIntoViewIfNeeded().catch(() => {});
    await sleep(page, 500);
    await nar.say(clips.templates);

    // ── Ajustes: publicar el retiro ──
    await page.getByRole('tab', { name: /Ajustes/i }).click().catch(() => {});
    await sleep(page, 700);
    await page.locator('#isPublic-yes').click().catch(() => {}); // marcar Público
    await sleep(page, 400);
    await nar.say(clips.publish);

    // ── Finanzas: costos ──
    await page.getByRole('tab', { name: /Finanzas/i }).click().catch(() => {});
    await sleep(page, 700);
    await page.fill('#cost', '3500').catch(() => {});
    await page.fill('#serverFeeAmount', '1200').catch(() => {});
    await page.fill('#mealCost', '150').catch(() => {});
    await sleep(page, 300);
    await nar.say(clips.finanzas);

    // ── Recuerdos: post-retiro ──
    await page.getByRole('tab', { name: /Recuerdos/i }).click().catch(() => {});
    await sleep(page, 700);
    await nar.say(clips.recuerdos);

    // ── Guardar (señalar, sin enviar) ──
    await page.getByRole('tab', { name: /General/i }).click().catch(() => {});
    await sleep(page, 500);
    const saveBtn = page.getByRole('button', { name: /Crear Retiro/i }).first();
    const sbox = await saveBtn.boundingBox().catch(() => null);
    if (sbox) await nar.cueAt(sbox.x + sbox.width / 2, sbox.y + sbox.height / 2);
    await nar.say(clips.save);

    await sleep(page, 1200);
    await nar.clear();
    await sleep(page, 400);
  } catch (err) {
    console.error('❌ Error durante la grabación:', err);
    await page.screenshot({ path: path.join(OUTPUT_DIR, 'error-create-retreat.png') }).catch(() => {});
  }

  const wallMs = nar.elapsedMs;
  await ctx.close();
  const videoPath = await video.path();
  await browser.close();
  log('🎬 Video crudo:', videoPath);

  const webmDur = await audioDuration(cfg.ffprobe, videoPath);
  const syncScale = computeSyncScale(webmDur, wallMs);
  log(`⏱  sync: webm ${webmDur.toFixed(1)}s / reloj ${(wallMs / 1000).toFixed(1)}s → scale ${syncScale.toFixed(4)}`);

  const out = path.join(OUTPUT_DIR, 'create-retreat-demo.mp4');
  log('🔊 Muxeando audio…');
  await muxVideo(cfg, { video: videoPath, timeline: nar.timeline, out, syncOffsetMs: SYNC_OFFSET_MS, syncScale });

  const chapters = buildYoutubeChapters(nar.timeline, { labels: CHAPTER_LABELS });
  writeVideoMeta(out, { title: YT_TITLE, description: YT_DESCRIPTION, tags: YT_TAGS, chapters });
  log('✅ Listo:', out);
  log('— Timeline —');
  for (const t of nar.timeline) log(`  ${(t.offsetMs / 1000).toFixed(1)}s  ${t.id}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
