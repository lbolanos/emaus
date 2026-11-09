// Video-demo narrado de la Bandeja WhatsApp de solo lectura (specs/whatsapp-inbox,
// v1.4/v1.5): pestañas Mensajes/Configuración, lista agrupada por caminante con
// contactos de emergencia, división ajustable y visor de archivos.
//
// Conduce la app REAL (Chromium visible) sobre el retiro demo (San Agustín, con
// conversaciones sembradas en la DB de QA y el binario fake-wacli para el flujo
// de vinculación), con subtítulos + narración TTS (Deepgram Aura-2) y produce un
// MP4 (H.264 + AAC) + metadata para YouTube.
//
//   cd apps/web && DEMO_BASE_URL=http://localhost:5174 node e2e/demo/record-wa-inbox.mjs
//
// Requiere el QA de la bandeja arriba desde el checkout principal (web 5174 +
// API 3002 con WA_BRIDGE_WACLI_BIN=/tmp/emaus-wa-video/fake-wacli, DB
// database.worktree.sqlite con conversaciones sembradas) y .env con la key.

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
  { id: 'intro', text: 'Este es el WhatsApp del Retiro: los mensajes de los caminantes y de sus familias, en un solo lugar.' },
  { id: 'donde', text: 'Vive en el menú Comunicaciones: WhatsApp del Retiro.' },
  { id: 'pestanas', text: 'Tiene dos pestañas: Mensajes, la bandeja; y Configuración, los teléfonos vinculados.' },
  { id: 'activa', text: 'La activa el superadmin en Configuración, retiro por retiro: consume memoria por cada teléfono conectado.' },
  { id: 'enlaces', text: 'Cada logístico vincula su WhatsApp escaneando un código. Aquí ves quién está conectado.' },
  { id: 'grupos', text: 'En Mensajes, cada caminante es una fila con sus chats: los suyos y los de sus contactos de emergencia.' },
  { id: 'contacto', text: 'Lo que manda la mamá o el esposo entra marcado, y solo lo ve quien puede ver datos de salud.' },
  { id: 'buscar', text: '¿La duda ya se resolvió? Buscas cualquier palabra y aparece el mensaje; también encuentra por nombre.' },
  { id: 'hilo', text: 'Abres un chat y ves la conversación completa.' },
  { id: 'leer', text: 'Al abrirlo se marca como leído para ti, sin avisarle al caminante: nada de visto azul.' },
  { id: 'ampliar', text: 'Y cualquier mensaje se lee más grande con un solo toque.' },
  { id: 'espacio', text: '¿Necesitas más espacio? Arrastra esta línea, o amplía la conversación a toda la pantalla.' },
  { id: 'documento', text: 'Los documentos se abren en grande: si es Word o PowerPoint, lo descargas y tu programa lo abre.' },
  { id: 'comprobante', text: 'Si mandan su comprobante, lo registras como pago con un clic, con la foto ya adjunta.' },
  { id: 'responder', text: 'Y respondes desde tu propio WhatsApp, con este botón.' },
  { id: 'telefono', text: '¿La familia escribe desde otro número? Lo agregas con este lápiz, sin salir de la bandeja.' },
  { id: 'vincular', text: 'Para vincular el tuyo: en Configuración, tocas Vincular mi WhatsApp y aceptas el aviso.' },
  { id: 'qr', text: 'Escaneas el código con tu teléfono, como un WhatsApp Web más.' },
  { id: 'conectado', text: '¡Listo, conectado! Tu número alimenta la bandeja solo durante el retiro.' },
  { id: 'ciclo', text: 'Terminado el retiro, todo se borra solo: sesiones cerradas e historial purgado a los quince días.' },
  { id: 'outro', text: 'WhatsApp del Retiro: el equipo entero ve lo que mandan los caminantes y sus familias, sin dejar de ser solo lectura.' },
];

const CHAPTER_LABELS = {
  intro: 'Intro', donde: 'Dónde vive', pestanas: 'Dos pestañas',
  activa: 'Se activa por retiro', enlaces: 'Teléfonos vinculados',
  grupos: 'Agrupado por caminante', contacto: 'Contactos de emergencia',
  buscar: 'Búsqueda', hilo: 'Abrir un chat', leer: 'Leído sin visto azul',
  ampliar: 'Ver más grande', espacio: 'División ajustable',
  documento: 'Documentos en grande', comprobante: 'Comprobante → pago',
  responder: 'Responder desde mi WhatsApp', telefono: 'Agregar un teléfono',
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
  // Los TabsTrigger de reka activan por mousedown: click real, no domClick.
  const goConfig = async () => {
    await page.getByRole('tab', { name: 'Configuración' }).click();
    await page.waitForSelector('[data-testid="wa-link-panel"]', { timeout: 8000 });
    await sleep(page, 600);
  };
  const goMessages = async () => {
    await page.getByRole('tab', { name: 'Mensajes' }).click();
    await page.waitForSelector('[data-testid="wa-conversation-list"]', { timeout: 8000 });
    await sleep(page, 600);
  };

  try {
    await page.goto(DASHBOARD, { waitUntil: 'networkidle' });
    await page.waitForSelector('text=Dashboard del Retiro', { timeout: 15000 }).catch(() => {});
    await page.waitForLoadState('networkidle', { timeout: 3000 }).catch(() => {});
    await sleep(page, 1000);

    // ── intro (sobre el dashboard del retiro demo) ──
    await nar.say(clips.intro);

    // ── donde (sidebar: expandir Comunicaciones y señalar el ítem) ──
    await expandSection(page, 'Comunicaciones');
    // El nombre accesible lleva pegado el contador de no leídos
    // ("WhatsApp del Retiro9"): anclar al inicio, no `exact`.
    const item = page.getByRole('link', { name: /^WhatsApp del Retiro/ });
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
    await page.waitForSelector('[data-testid="wa-tab-messages"]', { timeout: 15000 });
    await page.waitForLoadState('networkidle', { timeout: 3000 }).catch(() => {});
    await nar.clearCue();
    await sleep(page, 800);

    // ── pestanas (v1.4: Mensajes / Configuración en la URL) ──
    const tabs = page.locator('[role="tablist"]');
    const tbox = await tabs.boundingBox().catch(() => null);
    if (tbox) await nar.cueAt(tbox.x + tbox.width / 2, tbox.y + tbox.height / 2);
    await sleep(page, 400);
    await nar.say(clips.pestanas);
    await nar.clearCue();

    // ── activa + enlaces (pestaña Configuración) ──
    await goConfig();
    const controls = page.locator('[data-testid="wa-superadmin-controls"]');
    if (await controls.count()) {
      const cbox = await controls.boundingBox();
      if (cbox) await nar.cueAt(cbox.x + 60, cbox.y + cbox.height / 2);
      await sleep(page, 400);
    }
    await nar.say(clips.activa);
    await nar.clearCue();
    const panel = page.locator('[data-testid="wa-link-panel"]');
    if (await panel.count()) {
      const pbox = await panel.boundingBox();
      if (pbox) await nar.cueAt(pbox.x + 120, pbox.y + pbox.height / 2);
    }
    await nar.say(clips.enlaces);
    await nar.clearCue();
    await goMessages();

    // ── grupos (v1.4: lista agrupada por caminante) ──
    const list = page.locator('[data-testid="wa-conversation-list"]');
    const groupToggle = page.locator('[data-testid^="wa-group-toggle-"]').first();
    const anchor =
      (await groupToggle.isVisible().catch(() => false))
        ? groupToggle
        : list;
    const gbox = await anchor.boundingBox().catch(() => null);
    if (gbox) await nar.cueAt(gbox.x + Math.min(gbox.width / 2, 260), gbox.y + 30);
    await sleep(page, 400);
    await nar.say(clips.grupos);
    await nar.clearCue();

    // ── contacto (rotulados 👪; solo con participant:health) ──
    const contactLabel = page.locator('[data-testid="wa-contact-label"]').first();
    const contactRow = (await contactLabel.count())
      ? contactLabel
      : page.locator('[data-testid^="wa-chat-row-"]:has-text("👪")').first();
    const kbox = await contactRow.boundingBox().catch(() => null);
    if (kbox) await nar.cueAt(kbox.x + Math.min(kbox.width / 2, 260), kbox.y + 10);
    await sleep(page, 400);
    await nar.say(clips.contacto);
    await nar.clearCue();

    // ── buscar (escribe, aparece el mensaje; matchea nombres también) ──
    const searchInput = page.locator('[data-testid="wa-search-input"]');
    await searchInput.click();
    await searchInput.pressSequentially('sabana', { delay: 90 });
    await page.waitForSelector('button:has-text("sábana")', { timeout: 8000 }).catch(() => {});
    await sleep(page, 700);
    await nar.say(clips.buscar);
    await searchInput.fill('');
    await sleep(page, 500);

    // ── hilo (abrir el primer chat; los grupos pueden quedar colapsados) ──
    const firstChat = page.locator('[data-testid^="wa-chat-row-"]').first();
    if (!(await firstChat.isVisible().catch(() => false))) {
      const toggles = await page.locator('[data-testid^="wa-group-toggle-"]').all();
      for (const t of toggles) await domClick(t).catch(() => {});
      await sleep(page, 500);
    }
    await firstChat.click();
    await page.waitForSelector('[data-testid="wa-chat-thread"]', { timeout: 8000 }).catch(() => {});
    await sleep(page, 900);
    await nar.say(clips.hilo);

    // ── leer (sin visto azul) ──
    await sleep(page, 400);
    await nar.say(clips.leer);

    // ── ampliar (tap en la burbuja → vista grande; cierra con Escape) ──
    const bubble = page.locator('[data-testid^="wa-message-"] button').first();
    await bubble.click();
    await page.waitForSelector('[role="dialog"]', { timeout: 8000 });
    await sleep(page, 900);
    await nar.say(clips.ampliar);
    await page.keyboard.press('Escape');
    await sleep(page, 600);

    // ── espacio (v1.4: dividir arrastrable + ampliar conversación) ──
    const handle = page.locator('[data-testid="wa-split-handle"]');
    const hbox = await handle.boundingBox().catch(() => null);
    if (hbox) await nar.cueAt(hbox.x + hbox.width / 2, hbox.y + hbox.height / 2);
    await sleep(page, 400);
    await nar.say(clips.espacio);
    await nar.clearCue();
    if (hbox) {
      // Arrastre real: +90 px y doble clic para volver al ancho de reposo.
      await page.mouse.move(hbox.x + hbox.width / 2, hbox.y + hbox.height / 2);
      await page.mouse.down();
      await page.mouse.move(hbox.x + hbox.width / 2 + 90, hbox.y + hbox.height / 2, { steps: 6 });
      await page.mouse.up();
      await sleep(page, 700);
      await handle.dblclick().catch(() => {});
      await sleep(page, 500);
    }
    const expandBtn = page.locator('[data-testid="wa-thread-expand"]');
    if (await expandBtn.isVisible().catch(() => false)) {
      await domClick(expandBtn);
      await sleep(page, 900);
      await domClick(expandBtn); // volver a la vista con la lista
      await sleep(page, 600);
    }

    // ── documento (v1.5: visor de archivos; Word → descarga con su nombre) ──
    // La carta y el comprobante los manda la mamá (chat del contacto, fila 👪
    // dentro del grupo del caminante): ese chat se abre aquí y la escena del
    // comprobante sigue en él. El data-testid del DialogContent no sobrevive el
    // wrapper de reka-ui (lección del modal de vinculación): el ancla es
    // [role="dialog"].
    const contactChat = page.locator('[data-testid^="wa-chat-row-"]:has-text("👪")').first();
    if (await contactChat.isVisible().catch(() => false)) {
      await contactChat.click();
      await page.waitForSelector('[data-testid="wa-thread-contact-of"]', { timeout: 8000 }).catch(() => {});
      await sleep(page, 900);
    }
    const docBubble = page.locator('[data-testid="wa-document"]').first();
    if (await docBubble.isVisible().catch(() => false)) {
      await docBubble.click();
      await page.waitForSelector('[role="dialog"]', { timeout: 10000 });
      await page
        .waitForSelector('[data-testid="wa-file-download"], [data-testid="wa-file-pdf"]', { timeout: 15000 })
        .catch(() => {});
      await sleep(page, 900);
      await nar.say(clips.documento);
      await page.keyboard.press('Escape').catch(() => {});
      await domClick(page.locator('[role="dialog"] button:has-text("Cerrar")').first()).catch(() => {});
      await sleep(page, 700);
    } else {
      log('   ⚠ sin documento en este chat: beat "documento" omitido');
    }

    // ── comprobante (FR14: imagen → modal de pago con la foto adjunta) ──
    // El comprobante (WA-VIDEO-IMG) está en el chat de la mamá, ya abierto en
    // la escena anterior; si no, se abre la fila 👪. El testid de la acción es
    // wa-action-payment-<mensajeId> (v1.3); el pago se prellena con el
    // caminante del grupo (activeWalkerId, v1.4).
    // El PDF también ofrece "Registrar como pago": acotar a la burbuja con foto.
    const regBtn = page
      .locator('[data-testid^="wa-message-"]:has([data-testid="wa-thumb"]) [data-testid^="wa-action-payment-"]')
      .first();
    if (!(await regBtn.isVisible().catch(() => false))) {
      await contactChat.click().catch(() => {});
      await sleep(page, 900); // dejar asentar openChat (fetchThread + markSeen)
    }
    if (await regBtn.isVisible().catch(() => false) || (await regBtn.waitFor({ state: 'visible', timeout: 8000 }).then(() => true).catch(() => false))) {
      await regBtn.scrollIntoViewIfNeeded().catch(() => {});
      // Sin esperar un POST /receipt: la foto ya vino con el lote de miniaturas
      // y el store la toma de su caché (esperar la respuesta dejó 25 s muertos).
      await domClick(regBtn);
      await page.waitForSelector('[role="dialog"]', { timeout: 20000 });
      await sleep(page, 1000);
      // El modal abre arriba (participante y saldo); la foto adjunta va al
      // final: centrarla para que se vea "con la foto ya adjunta".
      // scrollIntoViewIfNeeded no sirve: la foto ya asoma al fondo (tapada por
      // el subtítulo) y para Playwright eso cuenta como visible.
      await page
        .locator('[role="dialog"] img')
        .last()
        .evaluate((el) => el.scrollIntoView({ block: 'center' }))
        .catch(() => {});
      await sleep(page, 600);
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

    // ── telefono (v1.4: editor rápido de teléfonos en la cabecera) ──
    // Se muestra el popover y se cierra: NADA se guarda (no mutar).
    const pencil = page.getByRole('button', { name: 'Editar teléfonos' }).first();
    if (await pencil.isVisible().catch(() => false)) {
      const pb = await pencil.boundingBox().catch(() => null);
      if (pb) await nar.cueAt(pb.x + pb.width / 2, pb.y + pb.height / 2);
      await sleep(page, 400);
      await domClick(pencil);
      const telInput = page.locator('input[type="tel"]').first();
      await telInput.waitFor({ state: 'visible', timeout: 6000 }).catch(() => {});
      await sleep(page, 900);
      await nar.say(clips.telefono);
      await nar.clearCue();
      await telInput.press('Escape').catch(() => {}); // @keydown.esc del editor
      await sleep(page, 600);
    } else {
      log('   ⚠ sin editor de teléfonos visible: beat "telefono" omitido');
    }

    // ── vincular (pestaña Configuración → modal: consentimiento) ──
    await goConfig();
    await domClick(page.locator('[data-testid="wa-link-button"]'));
    // OJO: el data-testid del DialogContent no sobrevive el wrapper de reka-ui;
    // el ancla de "modal abierto" es el checkbox del consentimiento.
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

    // ── outro (de vuelta a Mensajes: la bandeja agrupada como plano final) ──
    await goMessages();
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
      'Los caminantes y sus contactos de emergencia escriben por WhatsApp a los teléfonos del equipo; ' +
      'con esta bandeja el equipo entero los ve agrupados por caminante, en un solo lugar, solo de ' +
      'lectura y solo durante el retiro. Los documentos se abren en grande (el PDF, página por página) ' +
      'o se descargan con su nombre, los comprobantes se registran como pago, cada logístico vincula ' +
      'su número escaneando un QR y al terminar el retiro todo se borra automáticamente.',
    tags: ['Emaús', 'retiro', 'whatsapp', 'bandeja', 'logística', 'comunicación', 'contactos de emergencia', 'documentos'],
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
