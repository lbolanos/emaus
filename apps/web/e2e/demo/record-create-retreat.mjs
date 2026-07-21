// Video-demo narrado: "Crear y gestionar un retiro" (versión ampliada).
//
// Cubre, desde el hub "Mis Retiros":
//   1. Dónde se gestionan los retiros (crear / editar / eliminar).
//   2. El formulario de creación recorriendo LOS 8 TABS (General, Logística, Ajustes,
//      Finanzas, Notas, Clausura, Volante, Recuerdos) explicando qué hace cada uno.
//   3. El detector de duplicados (badge "Posible duplicado").
//   4. Editar el VOLANTE en vivo: cambiar un texto y ver cómo cambia en el cartel.
//   5. Eliminar con seguridad: advertencia de impacto + confirmación por nombre.
//   6. Los botones de crear/editar/eliminar en el menú lateral (con tooltip).
//
// NO envía formularios ni borra nada (Cancela / no confirma). Usa interceptación
// (page.route) para: enmascarar PII, inyectar un duplicado de demo y reflejar el
// cambio del volante sin persistir.
//
//   cd apps/web && node e2e/demo/record-create-retreat.mjs
//
// Requiere `pnpm dev`/`make dev` arriba y carga baja (grabación headed).

import pw from '@playwright/test';
const { chromium } = pw;
import path from 'node:path';
import {
  loadEnv, ensureOutputDir, genTts, OVERLAY_INIT, Narrator, muxVideo,
  computeSyncScale, audioDuration, buildYoutubeChapters, writeVideoMeta, OUTPUT_DIR,
} from './demo-lib.mjs';

const cfg = loadEnv();
const SAN_AGUSTIN = process.env.RETREAT_ID || '4c8173c9-a068-4efe-a936-e3618523bead';
const W = 1280, H = 800;
const SYNC_OFFSET_MS = 0;
const OVERLAY = OVERLAY_INIT.replace('✝ Emaús · Tareas Pre-Retiro', '✝ Emaús · Crear y gestionar un retiro');

// ── Estado mutable para la interceptación (se activa en beats concretos) ──
const state = {
  injectDuplicate: false, // duplica un retiro en la lista para mostrar el badge
  flyerTitleOverride: null, // inyecta titleOverride en el flyer sin persistir
};

// Enmascarar PII (nombres/correos/teléfonos) de forma determinista por id.
const FAKES = ['María López', 'Juan Pérez', 'Ana Torres', 'Pedro Gómez', 'Luis Ramírez', 'Sofía Cruz'];
function fakeFor(id) {
  let h = 0;
  for (const c of String(id || '')) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return FAKES[h % FAKES.length];
}
function maskNode(node) {
  if (Array.isArray(node)) return node.forEach(maskNode);
  if (node && typeof node === 'object') {
    const name = fakeFor(node.id || node.userId || node.email);
    if (typeof node.email === 'string' && node.email.includes('@')) {
      node.email = name.toLowerCase().replace(/[^a-z]/g, '.') + '@correo.com';
    }
    if (typeof node.firstName === 'string') node.firstName = name.split(' ')[0];
    if (typeof node.lastName === 'string') node.lastName = name.split(' ')[1] || '';
    if (typeof node.nickname === 'string') node.nickname = name.split(' ')[0];
    if (typeof node.displayName === 'string') node.displayName = name;
    if ('photo' in node) node.photo = null;
    if ('avatarUrl' in node) node.avatarUrl = null;
    for (const k of Object.keys(node)) {
      if (/phone|celular|tel[eé]fono|whatsapp/i.test(k) && typeof node[k] === 'string') {
        node[k] = '55 0000 0000';
      } else {
        maskNode(node[k]);
      }
    }
  }
}

const LINES = [
  { id: 'nav', text: 'En el menú lateral, dentro de Familia Emaús, entra a Mis Retiros.' },
  { id: 'hub', text: 'Aquí, en Mis Retiros, administras tus retiros: los creas, los editas y los eliminas.' },
  { id: 'create', text: 'Para crear uno nuevo, toca Crear retiro.' },
  { id: 'general', text: 'En General escribes la parroquia, el tipo y el número. El enlace corto se genera solo.' },
  { id: 'house', text: 'Eliges la casa donde se hará y las fechas. La zona horaria se hereda de la casa.' },
  { id: 'logistics', text: 'En Logística, los máximos de caminantes y servidores vienen de las camas de la casa, y puedes ajustarlos.' },
  { id: 'templates', text: 'Aquí también eliges los templates: al crear, se clonan la agenda y las tareas del equipo.' },
  { id: 'settings', text: 'En Ajustes decides si el retiro es público. Al publicarlo, cualquiera se inscribe con el enlace.' },
  { id: 'financials', text: 'En Finanzas defines el costo del caminante, el cobro del servidor y el valor por comida.' },
  { id: 'notes', text: 'En Notas escribes la bienvenida, qué llevar y las indicaciones para los participantes.' },
  { id: 'closing', text: 'En Clausura registras la iglesia de la misa final, con su dirección y su mapa.' },
  { id: 'flyer', text: 'En Volante personalizas los textos del cartel de invitación: encabezado, contenido y pie.' },
  { id: 'memories', text: 'Y en Recuerdos, cuando el retiro ya terminó, subes las fotos.' },
  { id: 'save', text: 'Al terminar, tocas Crear Retiro y queda listo para organizarlo.' },
  { id: 'dup', text: 'Si por error creas dos retiros con el mismo nombre y fecha, se marcan como posible duplicado.' },
  { id: 'edit', text: 'Para editar un retiro, toca el lápiz de su tarjeta.' },
  { id: 'flyerEdit', text: 'Cambia un texto del volante, por ejemplo el título de portada.' },
  { id: 'flyerView', text: 'Y así, al instante, se ve reflejado en el cartel del retiro.' },
  { id: 'deleteImpact', text: 'Al eliminar, el sistema te avisa cuánta información se perdería.' },
  { id: 'deleteConfirm', text: 'Y te pide escribir el nombre exacto para confirmar. Así nadie borra un retiro por error.' },
  { id: 'sidebar', text: 'En la sección Retiro del menú eliges el retiro con el que vas a trabajar.' },
  { id: 'sidebarButtons', text: 'Y con estos botones lo agregas, lo editas o lo eliminas, sin salir del menú.' },
  { id: 'outro', text: 'Así puedes crear, configurar y gestionar por completo tus retiros en Emaús.' },
];

const YT_TITLE = 'Crear y gestionar un retiro en Emaús (formulario completo + volante)';
const YT_DESCRIPTION =
  'Recorrido completo para crear y gestionar un retiro en Emaús desde "Mis Retiros": el formulario ' +
  'tab por tab (General, Logística, Ajustes, Finanzas, Notas, Clausura, Volante y Recuerdos), el ' +
  'detector de duplicados, cómo se refleja en el cartel al editar el volante, y el borrado seguro ' +
  '(aviso de impacto + confirmación por nombre). También los botones de crear/editar/eliminar del menú lateral.';
const YT_TAGS = ['Emaús', 'retiro', 'crear retiro', 'gestionar', 'volante', 'eliminar', 'tutorial'];
const CHAPTER_LABELS = {
  nav: 'Menú → Mis Retiros',
  hub: 'Mis Retiros (hub)', create: 'Crear retiro', general: 'General', house: 'Casa y fechas',
  logistics: 'Logística: máximos', templates: 'Logística: templates', settings: 'Ajustes (público)',
  financials: 'Finanzas', notes: 'Notas', closing: 'Clausura', flyer: 'Volante', memories: 'Recuerdos',
  save: 'Crear Retiro', dup: 'Duplicados', edit: 'Editar', flyerEdit: 'Editar el volante',
  flyerView: 'Volante actualizado', deleteImpact: 'Eliminar: impacto', deleteConfirm: 'Eliminar: confirmar',
  sidebar: 'Menú: elegir retiro', sidebarButtons: 'Menú: agregar/editar/eliminar', outro: 'Cierre',
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
  let authState;
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
      authState = await auth.storageState();
      await auth.close();
      break;
    } catch (e) {
      await auth.close();
      if (attempt === 3) throw e;
      await new Promise((r) => setTimeout(r, 2000));
    }
  }

  const ctx = await browser.newContext({
    storageState: authState, viewport: { width: W, height: H }, locale: 'es-MX',
    recordVideo: { dir: OUTPUT_DIR, size: { width: W, height: H } },
  });
  await ctx.addInitScript(() => localStorage.setItem('preferred-locale', 'es'));
  await ctx.addInitScript(OVERLAY);
  const page = await ctx.newPage();
  page.setDefaultTimeout(6000);
  page.setDefaultNavigationTimeout(30000);

  // ── Interceptación de API (todas prefijadas con **/api/ para no tocar navegaciones SPA) ──
  // Enmascarar PII en endpoints con datos de personas.
  for (const pat of ['**/api/**/participants**', '**/api/**/service-teams**', '**/api/**/responsibilities**', '**/api/retreat-roles/**']) {
    await page.route(pat, async (route) => {
      try {
        const resp = await route.fetch();
        const data = await resp.json();
        maskNode(data);
        await route.fulfill({ response: resp, body: JSON.stringify(data) });
      } catch { await route.continue().catch(() => {}); }
    });
  }
  // Recuerdos (Mis Retiros): vaciar galerías para NO mostrar fotos reales (PII) de fondo.
  await page.route('**/api/retreats/attended', async (route) => {
    try {
      const resp = await route.fetch();
      const data = await resp.json();
      if (Array.isArray(data)) for (const r of data) {
        r.memoryPhotoUrl = null; r.musicPlaylistUrl = null;
        if (Array.isArray(r.memoryPhotos)) r.memoryPhotos = [];
        if (Array.isArray(r.memorySongs)) r.memorySongs = [];
      }
      await route.fulfill({ response: resp, body: JSON.stringify(data) });
    } catch { await route.continue().catch(() => {}); }
  });
  // Lista de retiros: opcionalmente inyecta un duplicado para mostrar el badge.
  await page.route('**/api/retreats', async (route) => {
    if (route.request().method() !== 'GET') return route.continue();
    try {
      const resp = await route.fetch();
      const data = await resp.json();
      if (state.injectDuplicate && Array.isArray(data) && data.length) {
        const base = data.find((r) => /agust/i.test(r.parish)) || data[0];
        data.unshift({ ...base, id: 'dup-demo-0000', });
      }
      await route.fulfill({ response: resp, body: JSON.stringify(data) });
    } catch { await route.continue().catch(() => {}); }
  });
  // Detalle del retiro (lo usa el flyer): inyecta titleOverride sin persistir.
  await page.route(`**/api/retreats/${SAN_AGUSTIN}`, async (route) => {
    if (route.request().method() !== 'GET') return route.continue();
    try {
      const resp = await route.fetch();
      const data = await resp.json();
      if (state.flyerTitleOverride) {
        data.flyer_options = { ...(data.flyer_options || {}), titleOverride: state.flyerTitleOverride };
      }
      maskNode(data.memoryPhotos); maskNode(data.memorySongs);
      await route.fulfill({ response: resp, body: JSON.stringify(data) });
    } catch { await route.continue().catch(() => {}); }
  });

  const video = page.video();
  const nar = new Narrator(page, cfg);
  nar.start();

  const cueBtn = async (locator) => {
    const box = await locator.boundingBox().catch(() => null);
    if (box) await nar.cueAt(box.x + box.width / 2, box.y + box.height / 2);
    return box;
  };
  const clickTab = async (name) => {
    await page.getByRole('tab', { name }).first().click({ timeout: 4000 }).catch(() => {});
    await sleep(page, 600);
  };
  // Expande una sección del sidebar (acordeón) si está colapsada.
  const expandSection = async (name) => {
    const header = page.getByRole('button', { name }).first();
    const expanded = await header.getAttribute('aria-expanded').catch(() => null);
    if (expanded !== 'true') await header.click().catch(() => {});
    await sleep(page, 400);
  };
  const pickFirstOption = async () => {
    await page.getByRole('option').first().click({ timeout: 3000 }).catch(() => page.keyboard.press('Escape'));
  };

  try {
    // ═══ 0. Navegación: DÓNDE vive "Mis Retiros" en el sidebar ═══
    await page.goto(`${cfg.baseUrl}/app/retreats/${SAN_AGUSTIN}/dashboard`, { waitUntil: 'networkidle' }).catch(() => {});
    await page.waitForLoadState('networkidle', { timeout: 2500 }).catch(() => {});
    await sleep(page, 900);
    // Expandir la sección "Familia Emaús" y resaltar el ítem "Mis Retiros".
    await expandSection(/Familia Emaús/i);
    const misRetirosLink = page.getByRole('link', { name: /^Mis Retiros$/i }).first();
    await misRetirosLink.scrollIntoViewIfNeeded().catch(() => {});
    await cueBtn(misRetirosLink).catch(() => {});
    await nar.say(clips.nav);
    await cueBtn(misRetirosLink).catch(() => {}); // reforzar el anillo sobre el ítem del menú
    await sleep(page, 500);
    await misRetirosLink.click().catch(() => page.goto(`${cfg.baseUrl}/app/my-retreats`).catch(() => {}));
    await page.getByRole('heading', { name: /Retiros que administras/i }).first().waitFor({ timeout: 10000 }).catch(() => {});
    await nar.clearCue().catch(() => {});
    await sleep(page, 700);

    // ═══ 1. Hub: Mis Retiros ═══
    await nar.say(clips.hub);

    // ═══ 2. Crear: abrir el modal ═══
    const createBtn = page.getByRole('button', { name: /Crear retiro/i }).first();
    await cueBtn(createBtn);
    await nar.say(clips.create);
    await createBtn.click().catch(() => {});
    await page.getByText(/Crear retiro/i).first().waitFor({ timeout: 8000 }).catch(() => {});
    await nar.clearCue().catch(() => {}); // que el cue del botón no quede colgado sobre la modal
    await sleep(page, 800);

    // ── General ──
    await page.fill('#parish', 'San José Obrero').catch(() => {});
    await sleep(page, 250);
    await page.locator('#retreatType').click().catch(() => {});
    await sleep(page, 350); await pickFirstOption();
    await page.fill('#retreatNumber', 'XLVII').catch(() => {});
    await sleep(page, 200);
    await nar.say(clips.general);

    // ── General: casa + fechas ──
    await page.locator('#houseId').click().catch(() => {});
    await sleep(page, 350);
    await page.getByRole('option', { name: /Casa de Retiro Ema/i }).first().click({ timeout: 3000 }).catch(() => pickFirstOption());
    await sleep(page, 400);
    await page.fill('#startDate', '2026-09-18').catch(() => {});
    await page.fill('#endDate', '2026-09-21').catch(() => {});
    await sleep(page, 200);
    await nar.say(clips.house);

    // ── Logística: máximos + templates ──
    await clickTab(/Log[ií]stica/i);
    await page.locator('#max_walkers').scrollIntoViewIfNeeded().catch(() => {});
    await nar.say(clips.logistics);
    await page.fill('#max_walkers', '45').catch(() => {});
    await sleep(page, 400);
    await page.getByText('Template Minuto a Minuto').first().scrollIntoViewIfNeeded().catch(() => {});
    await sleep(page, 300);
    await nar.say(clips.templates);

    // ── Ajustes ──
    await clickTab(/Ajustes/i);
    await page.locator('#isPublic-yes').click().catch(() => {});
    await sleep(page, 300);
    await nar.say(clips.settings);

    // ── Finanzas ──
    await clickTab(/Finanzas/i);
    await page.fill('#cost', '3500').catch(() => {});
    await page.fill('#serverFeeAmount', '1200').catch(() => {});
    await page.fill('#mealCost', '150').catch(() => {});
    await sleep(page, 200);
    await nar.say(clips.financials);

    // ── Notas ──
    await clickTab(/Notas/i);
    await nar.say(clips.notes);

    // ── Clausura ──
    await clickTab(/Clausura/i);
    await nar.say(clips.closing);

    // ── Volante ──
    await clickTab(/Volante/i);
    await sleep(page, 300);
    await nar.say(clips.flyer);

    // ── Recuerdos ──
    await clickTab(/Recuerdos/i);
    await nar.say(clips.memories);

    // ── Crear (señalar, sin enviar) ──
    await clickTab(/General/i);
    const saveBtn = page.getByRole('button', { name: /Crear Retiro/i }).first();
    await cueBtn(saveBtn);
    await nar.say(clips.save);
    await sleep(page, 400);
    // Cerrar el modal sin guardar
    await page.keyboard.press('Escape').catch(() => {});
    await page.getByRole('button', { name: /^Cancelar$/i }).first().click({ timeout: 2000 }).catch(() => {});
    await sleep(page, 600);

    // ═══ 3. Detector de duplicados ═══
    state.injectDuplicate = true;
    await page.goto(`${cfg.baseUrl}/app/my-retreats`, { waitUntil: 'networkidle' }).catch(() => {});
    await page.getByRole('heading', { name: /Retiros que administras/i }).first().waitFor({ timeout: 8000 }).catch(() => {});
    await sleep(page, 700);
    await nar.clearCue?.();
    const dupBadge = page.getByText('Posible duplicado').first();
    await cueBtn(dupBadge).catch(() => {});
    await nar.say(clips.dup);
    state.injectDuplicate = false;

    // ═══ 4. Editar → Volante en vivo ═══
    const editBtn = page.getByRole('button', { name: /Editar retiro/i }).first();
    await cueBtn(editBtn).catch(() => {});
    await nar.say(clips.edit);
    await editBtn.click().catch(() => {});
    await nar.clearCue().catch(() => {});
    await page.getByRole('tab', { name: /Volante/i }).first().waitFor({ timeout: 8000 }).catch(() => {});
    await clickTab(/Volante/i);
    await page.getByRole('tab', { name: /Encabezado/i }).first().click({ timeout: 3000 }).catch(() => {});
    await sleep(page, 400);
    await page.fill('#titleOverride', 'Fin de Semana de Esperanza').catch(() => {});
    await sleep(page, 300);
    await nar.say(clips.flyerEdit);
    // Reflejar en el flyer vía interceptación (sin guardar).
    state.flyerTitleOverride = 'Fin de Semana de Esperanza';
    await page.keyboard.press('Escape').catch(() => {});
    await page.getByRole('button', { name: /^Cancelar$/i }).first().click({ timeout: 2000 }).catch(() => {});
    await sleep(page, 400);
    await page.goto(`${cfg.baseUrl}/app/retreats/${SAN_AGUSTIN}/flyer`, { waitUntil: 'networkidle' }).catch(() => {});
    await sleep(page, 1500);
    await nar.say(clips.flyerView);
    state.flyerTitleOverride = null;

    // ═══ 5. Eliminar con seguridad (NO confirmar) ═══
    await page.goto(`${cfg.baseUrl}/app/my-retreats`, { waitUntil: 'networkidle' }).catch(() => {});
    await page.getByRole('heading', { name: /Retiros que administras/i }).first().waitFor({ timeout: 8000 }).catch(() => {});
    await sleep(page, 700);
    const delBtn = page.getByRole('button', { name: /Eliminar retiro/i }).first();
    await delBtn.click().catch(() => {});
    await page.getByRole('heading', { name: /^Eliminar retiro$/i }).first().waitFor({ timeout: 6000 }).catch(() => {});
    await sleep(page, 700);
    await nar.say(clips.deleteImpact);
    await sleep(page, 400);
    await nar.say(clips.deleteConfirm);
    // Cancelar — NUNCA confirmar el borrado en la demo.
    await page.getByRole('button', { name: /^Cancelar$/i }).first().click({ timeout: 2000 }).catch(() => {});
    await sleep(page, 500);

    // ═══ 6. Sidebar RETIRO: elegir retiro + botones agregar/editar/eliminar ═══
    await expandSection(/^Retiro$/i);
    const selector = page.locator('#retreat-selector').first();
    await selector.scrollIntoViewIfNeeded().catch(() => {});
    await cueBtn(selector).catch(() => {});
    await nar.say(clips.sidebar);
    // Abrir el selector y elegir un retiro → así aparecen los botones para gestionarlo.
    await selector.click().catch(() => {});
    await sleep(page, 500);
    await page.getByRole('option').first().click({ timeout: 3000 }).catch(() => page.keyboard.press('Escape'));
    await sleep(page, 700);
    await nar.clearCue().catch(() => {});
    // Resaltar los tres botones (Agregar / Editar / Eliminar).
    const addSide = page.getByRole('button', { name: /Agregar Retiro/i }).first();
    await cueBtn(addSide).catch(() => {});
    await nar.say(clips.sidebarButtons);

    // ═══ Cierre ═══
    await nar.clearCue().catch(() => {});
    await nar.say(clips.outro);

    await sleep(page, 1000);
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
