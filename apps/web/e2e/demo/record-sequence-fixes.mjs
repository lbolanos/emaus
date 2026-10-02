// Video-demo narrado: flujo COMPLETO de secuencias + fixes M2-M5.
//
// Guion de punta a punta sobre el retiro sintético "Demo Secuencias (video)"
// (cero PII): crear plantilla (con aviso de tipo duplicado) → crear secuencia
// (paso fija plantilla por id; paso vencido en ámbar) → modificar →
// "Ejecutar ahora" (M5: el paso vencido PREGUNTA antes de salir → "Enviar
// ahora") → "Detalle por paso" (dónde está cada paso) → "Encolar ya" del paso
// futuro → bandeja → detalle con variables resueltas → "Abrir WhatsApp" (marca
// enviado) → preview/plantilla con {custom_message} cae a Problemas como
// omitida. Toma 6 (2026-10-02): reemplaza la 5, que mostraba el paso vencido
// descartándose en silencio.
//
//   cd apps/web && DEMO_BASE_URL=http://localhost:5174 node e2e/demo/record-sequence-fixes.mjs
//
// Requiere el retiro demo sembrado (scripts no versionados en /tmp/emaus-demo/)
// sobre el stack del worktree (API 3002, web 5174). La toma MUTA datos
// sintéticos (plantilla "Demo flujo (C)" + secuencia "Demo flujo completo"):
// al arrancar se limpian por API los restos de una toma anterior, y el envío
// despacha UN mensaje al Servidor Demo (número fake 555…, link wa.me).
//
// Nota de PII: no se registra maskRoute a propósito — todos los datos visibles
// son sintéticos y maskRoute renombraría a los participantes fake, rompiendo la
// coherencia del guion entre pestañas. Sólo se bloquean los exportes CSV/Excel.

import pw from '@playwright/test';
const { chromium } = pw;
import path from 'node:path';
import {
  loadEnv, ensureOutputDir, genTts, OVERLAY_INIT, Narrator, muxVideo,
  computeSyncScale, audioDuration, buildYoutubeChapters, writeVideoMeta, OUTPUT_DIR,
  alignChapterTimeline,
} from './demo-lib.mjs';

const cfg = loadEnv();
const W = 1280, H = 800;
const SYNC_OFFSET_MS = 0;
const OVERLAY = OVERLAY_INIT.replace('✝ Emaús · Tareas Pre-Retiro', '✝ Emaús · Comunicaciones');

const DEMO_RETREAT_PARISH = 'Demo Secuencias (video)';
const TPL_C = 'Demo flujo — recordatorio prendas (C)';
const TPL_B = 'Último aviso de prendas (demo B)';
const SEQ_FLOW = 'Demo flujo completo — recordatorio de prendas';
const SEQ_M4 = 'Demo M4 — plantilla con hueco manual';

const LINES = [
  { id: 'sidebar', text: '¿Dónde vive? En el menú de la izquierda, abre Comunicaciones y entra a Secuencias automáticas.' },
  { id: 'tpl_dup', text: 'Primero la plantilla. En Plantillas de mensajes creo una nueva del mismo tipo que ya existía, confirmación de camisetas. El sistema me avisa: cada paso de secuencia envía la que tenga elegida, y donde se elige solo por el tipo, va la predeterminada. La creo para el segundo recordatorio.' },
  { id: 'seq_create', text: 'Ahora la secuencia: para servidores, disparada por días antes del retiro. El paso uno usa la plantilla que acabo de crear, a tres días del retiro. El paso dos, a veinticinco días, cae en una fecha que ya pasó: el aviso ámbar me lo dice. Ese paso no se programa solo.' },
  { id: 'seq_edit', text: '¿Y si algo cambia? Abro la secuencia, ajusto la hora del paso y guardo: las fechas se recalculan al momento.' },
  { id: 'run', text: 'Ejecuto ahora. Como el paso dos ya venció, el sistema me pregunta antes de mandarlo: lo envío ahora o lo omito. Esta vez quiero que salga, así que lo envío.' },
  { id: 'steps', text: 'En el detalle por paso veo dónde está cada mensaje: el paso uno, programado para el dieciocho de octubre. El paso dos, ya en la cola de WhatsApp.' },
  { id: 'enqueue', text: 'Si quiero adelantar el paso uno, desde sus programados lo encolo ya: cae a la bandeja de WhatsApp con la plantilla correcta.' },
  { id: 'send', text: 'Abro el detalle: el mensaje ya salió con sus variables resueltas. Al abrirlo en WhatsApp queda marcado como enviado y sale de la bandeja.' },
  { id: 'm4', text: 'Una última protección. Esta plantilla trae un hueco de mensaje personalizado: la vista previa me avisa, y si una secuencia la intenta enviar, el mensaje cae a Problemas, omitido, con la razón para corregirla.' },
  { id: 'outro', text: 'De la plantilla al envío: plantilla fijada por paso, pasos vencidos que te preguntan antes de salir y huecos manuales protegidos. Las secuencias hacen lo que ves.' },
];

const YT_TITLE = 'Secuencias automáticas: de la plantilla al envío';
const YT_DESCRIPTION =
  'Flujo completo del motor de secuencias automáticas de Emaús sobre un retiro de ' +
  'prueba con datos ficticios: crear una plantilla (con aviso cuando ya hay otra del ' +
  'mismo tipo), armar la secuencia fijando la plantilla concreta de cada paso, editarla, ' +
  'ejecutarla (si un paso ya venció, te pregunta si enviarlo ahora u omitirlo), ver el ' +
  'detalle por paso, encolar y enviar por WhatsApp, y la protección para plantillas con ' +
  'hueco de mensaje personalizado. Los datos del demo son ficticios.';
const YT_TAGS = ['Emaús', 'retiro', 'secuencias', 'plantillas', 'mensajes', 'WhatsApp', 'tutorial'];
const CHAPTER_LABELS = {
  sidebar: 'Dónde está en el menú', tpl_dup: 'Crear plantilla (tipo duplicado)',
  seq_create: 'Crear la secuencia (fecha pasada en ámbar)', seq_edit: 'Modificar la secuencia',
  run: 'Ejecutar: el paso vencido pregunta antes', steps: 'Detalle por paso', enqueue: 'Encolar ya',
  send: 'Enviar por WhatsApp', m4: 'Hueco manual protegido', outro: 'Resumen',
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
// Sanidad por dato ANTES de narrar: si la pantalla no muestra lo que la
// narración promete, el log lo dice en la toma (lección de la toma 1).
// `root` scopes the lookup to the visible tab panel: the hidden panels stay
// mounted (v-show), and a first match inside one never becomes visible — the
// wait then burns its whole timeout as dead air in the take (toma 6, try 1).
function assertShown(page, text, label, timeout = 8000, root = page) {
  return root
    .getByText(text)
    .first()
    .waitFor({ timeout })
    .then(() => log(`   ✓ ${label}`))
    .catch(() => log(`   ⚠ ${label} — NO apareció, revisar esta toma`));
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

  // Retiro demo por nombre (re-siembras cambian el id, no el nombre).
  const retreatsResp = await ctx.request.get(cfg.baseUrl + '/api/retreats');
  if (!retreatsResp.ok()) throw new Error(`GET /api/retreats → ${retreatsResp.status()}`);
  const retreats = await retreatsResp.json();
  const demo = (Array.isArray(retreats) ? retreats : retreats.data || [])
    .find((r) => r.parish === DEMO_RETREAT_PARISH);
  if (!demo) throw new Error(`No encontré el retiro "${DEMO_RETREAT_PARISH}" — siembra el demo primero (/tmp/emaus-demo/seed-demo.mjs + seed-participants.mjs)`);
  log(`🎯 Retiro demo: ${demo.id}`);
  await ctx.addInitScript((rid) => {
    localStorage.setItem('preferred-locale', 'es');
    localStorage.setItem('selectedRetreatId', rid);
    // Bandeja: "Abrir WhatsApp" marca el envío y saca el ítem de una vez.
    localStorage.setItem('seq.autoConfirmSend', '1');
  }, demo.id);
  await ctx.addInitScript(OVERLAY);

  // ── Limpieza de tomas anteriores (la toma muta: plantilla C + secuencia) ──
  // Rutas verificadas en vivo: GET /message-sequences/retreat/:rid (array) y
  // DELETE /message-sequences/:id borra steps+mensajes en cascada (sin huérfanos).
  const csrfResp = await ctx.request.get(cfg.baseUrl + '/api/csrf-token');
  const { csrfToken } = await csrfResp.json();
  // HDR, no H: un const H local dejaría al H global (viewport height) en TDZ
  // dentro de todo main() — el login lo lee antes de esta línea.
  const HDR = { 'X-CSRF-Token': csrfToken };
  const clean = async (listUrl, matchName, delUrl) => {
    const resp = await ctx.request.get(`${cfg.baseUrl}${listUrl}`);
    if (!resp.ok()) throw new Error(`limpieza: GET ${listUrl} → ${resp.status()}`);
    const list = await resp.json();
    const rest = Array.isArray(list) ? list : list.data || [];
    for (const x of rest.filter((y) => y.name === matchName)) {
      const del = await ctx.request.delete(`${cfg.baseUrl}${delUrl(x.id)}`, { headers: HDR });
      log(`   limpieza "${matchName}" (${x.id}): ${del.status()}`);
    }
  };
  await clean(`/api/message-sequences/retreat/${demo.id}`, SEQ_FLOW, (id) => `/api/message-sequences/${id}`);
  await clean(`/api/message-templates?retreatId=${demo.id}`, TPL_C, (id) => `/api/message-templates/${id}`);
  // Fatal si quedaron restos: grabar encima de una toma vieja rompe el guion.
  const recheck = await (await ctx.request.get(`${cfg.baseUrl}/api/message-sequences/retreat/${demo.id}`)).json();
  if ((Array.isArray(recheck) ? recheck : []).some((s) => s.name === SEQ_FLOW)) {
    throw new Error('limpieza: la secuencia del flujo sigue existiendo tras el DELETE');
  }

  const page = await ctx.newPage();
  page.setDefaultTimeout(6000);
  page.setDefaultNavigationTimeout(30000);

  // Red de seguridad mínima: los exportes con datos nunca llegan al video.
  await page.route('**/api/**', async (route) => {
    const req = route.request();
    if (req.method() !== 'GET') return route.continue();
    let resp;
    try { resp = await route.fetch(); } catch { return route.continue().catch(() => {}); }
    const ct = resp.headers()['content-type'] || '';
    if (/text\/csv|ms-excel|spreadsheetml/i.test(ct)) {
      return route.fulfill({ status: 204, body: '' }).catch(() => {});
    }
    return route.fulfill({ response: resp }).catch(() => {});
  });

  const video = page.video();
  const nar = new Narrator(page, cfg);
  nar.start();

  const rowOf = (name) => page.locator('div.p-3', { hasText: name }).first();
  const editBtnOf = (name) => rowOf(name).getByRole('button', { name: 'Editar', exact: true });

  try {
    // ── Sidebar ──
    await page.goto(`${cfg.baseUrl}/app`, { waitUntil: 'networkidle' });
    await sleep(page, 1200);
    const comm = page.locator('button', { hasText: /^\s*Comunicaciones\s*$/i }).first();
    await cueBox(nar, comm);
    const item = page.getByRole('link', { name: 'Secuencias automáticas' }).first();
    await item.click({ timeout: 4000 }).catch(async () => {
      await comm.click().catch(() => {});
      await sleep(page, 700);
      await item.click().catch(() => {});
    });
    await page.waitForURL(/message-sequences/, { timeout: 15000 });
    await page.getByText('Secuencias automáticas', { exact: true }).first().waitFor({ timeout: 15000 });
    await sleep(page, 1200);
    await nar.say(clips.sidebar);

    // ── Plantillas: crear la C con tipo duplicado → aviso en vivo ──
    const tplLink = page.getByRole('link', { name: 'Plantillas de Mensajes' }).first();
    await cueBox(nar, tplLink);
    await tplLink.click({ timeout: 5000 }).catch(() => page.goto(`${cfg.baseUrl}/app/settings/message-templates`));
    await page.waitForURL(/message-templates/, { timeout: 15000 });
    await page.getByRole('button', { name: 'Agregar Nueva Plantilla' }).first().waitFor({ timeout: 8000 });
    await sleep(page, 900);
    await page.getByRole('button', { name: 'Agregar Nueva Plantilla' }).first().click();
    const tplModal = page.getByRole('dialog');
    await tplModal.getByText('Nueva Plantilla').first().waitFor({ timeout: 6000 });
    await sleep(page, 600);
    await tplModal.getByRole('textbox', { name: 'Nombre' }).fill(TPL_C);
    await sleep(page, 400);
    // Tipo: combobox reka-ui (dropdown capturable) → opción duplicada → aviso.
    // Nombre completo: "Recordatorio de Confirmación de Camisetas" también
    // contiene el prefijo y con match parcial elegiría la opción equivocada.
    await tplModal.getByRole('combobox').filter({ hasText: 'Selecciona un tipo' }).click();
    await page.getByRole('option', { name: 'Confirmación de Camisetas (Servidores)' }).click();
    await sleep(page, 600);
    await assertShown(page, 'Hay otras plantillas de este tipo', 'aviso tipo duplicado');
    await cueBox(nar, page.getByText('usa la predeterminada').first());
    await nar.say(clips.tpl_dup);
    await tplModal.getByRole('textbox', { name: 'Mensaje' }).fill(
      'Hola {participant.firstName}, por favor confirma tu talla de playera antes del viernes. Pedido: {participant.shirtOrderSummary}. — Coordinación Emaús',
    );
    await sleep(page, 500);
    await tplModal.getByRole('button', { name: 'Guardar' }).click();
    await sleep(page, 1200);
    await assertShown(page, TPL_C, 'plantilla C creada (fila en tabla)');

    // ── Secuencia: crear con 2 pasos (futuro + retroactivo) ──
    const seqLink = page.getByRole('link', { name: 'Secuencias Automáticas' }).first();
    await seqLink.click({ timeout: 5000 }).catch(() => page.goto(`${cfg.baseUrl}/app/settings/message-sequences`));
    await page.waitForURL(/message-sequences/, { timeout: 15000 });
    await page.getByRole('button', { name: 'Nueva secuencia' }).first().waitFor({ timeout: 8000 });
    await sleep(page, 800);
    await page.getByRole('button', { name: 'Nueva secuencia' }).first().click();
    const dlg = page.getByRole('dialog');
    await dlg.getByText('Nueva secuencia').first().waitFor({ timeout: 6000 });
    await sleep(page, 600);
    await dlg.getByRole('textbox').first().fill(SEQ_FLOW);
    await dlg.locator('select').filter({ has: page.locator('option', { hasText: 'Servidores' }) }).first()
      .selectOption({ label: 'Servidores' });
    await dlg.locator('select').filter({ has: page.locator('option', { hasText: 'Servidor Demo' }) }).first()
      .selectOption({ label: 'Servidor Demo' });
    await sleep(page, 500);
    // Paso 1: plantilla C a 3 días (futuro: 18 oct). La pausa tras cada
    // "Agregar paso" deja ver el paso vacío aparecer antes de llenarlo.
    await dlg.getByRole('button', { name: 'Agregar paso' }).click();
    await sleep(page, 1200);
    const stepSel = (n) => dlg.locator('select').filter({ has: page.locator('option', { hasText: TPL_C }) }).nth(n);
    const daysInput = (n) => dlg
      .locator('label.text-xs.text-gray-500', { hasText: /^Días$/ })
      .locator('xpath=following-sibling::input')
      .nth(n);
    const hourInput = (n) => dlg
      .locator('label.text-xs.text-gray-500', { hasText: /^Hora$/ })
      .locator('xpath=following-sibling::input')
      .nth(n);
    await stepSel(0).selectOption({ label: TPL_C });
    await daysInput(0).fill('3');
    await sleep(page, 900); // debounce 400ms + fetch + render
    await assertShown(page, '18 oct', 'paso 1 → 18 oct (futuro)');
    await sleep(page, 1100); // el paso 1 completo queda en cámara antes de agregar el 2
    // Paso 2: plantilla B a 25 días (26 sep, pasado) → ámbar.
    await dlg.getByRole('button', { name: 'Agregar paso' }).click();
    await sleep(page, 1200);
    const tplBSel = dlg.locator('select').filter({ has: page.locator('option', { hasText: TPL_B }) }).nth(1);
    await tplBSel.selectOption({ label: TPL_B });
    await daysInput(1).fill('25');
    await sleep(page, 1800);
    await assertShown(page, 'la fecha ya pasó', 'paso 2 en ámbar (retroactivo)');
    await cueBox(nar, page.getByText('la fecha ya pasó').first());
    await nar.say(clips.seq_create);
    await dlg.getByRole('button', { name: 'Guardar' }).click();
    await sleep(page, 1200);
    await assertShown(page, SEQ_FLOW, 'secuencia creada (fila)');

    // ── Modificación: reabrir, hora 9→10, fechas se recalculan ──
    await editBtnOf(SEQ_FLOW).click();
    await dlg.getByText('Editar secuencia').first().waitFor({ timeout: 6000 });
    await sleep(page, 800);
    await hourInput(0).fill('10');
    await sleep(page, 1200);
    await assertShown(page, '18 oct, 10:00', 'hora recalculada (18 oct 10:00)');
    await cueBox(nar, page.getByText('18 oct, 10:00').first());
    await nar.say(clips.seq_edit);
    await dlg.getByRole('button', { name: 'Guardar' }).click();
    await sleep(page, 1000);

    // ── Ejecutar ahora: el paso vencido PREGUNTA (M5) → Enviar ahora ──
    await page.getByRole('button', { name: 'Ejecutar ahora' }).first().click();
    const pastDlg = page.getByRole('dialog', { name: 'Pasos con fecha pasada' });
    await pastDlg.waitFor({ timeout: 8000 }).then(
      () => log('   ✓ diálogo "Pasos con fecha pasada"'),
      () => log('   ⚠ el diálogo de pasos vencidos NO apareció — revisar esta toma'),
    );
    await sleep(page, 900);
    await assertShown(page, 'tocaba el 26 sep', 'diálogo: paso 2 (26 sep) listado');
    await cueBox(nar, pastDlg.getByText('tocaba el 26 sep').first());
    await nar.say(clips.run);
    const sendNow = pastDlg.getByRole('button', { name: /Enviar ahora/ });
    await cueBox(nar, sendNow);
    await sleep(page, 700);
    await sendNow.click();
    await sleep(page, 2000); // re-run confirmado + processDue + toasts

    // ── Detalle por paso: dónde quedó cada uno ──
    await nar.clearCue();
    await rowOf(SEQ_FLOW).getByRole('button', { name: 'Detalle por paso' }).click();
    await sleep(page, 1200); // schedule-preview de las fechas
    await assertShown(page, 'Paso 2', 'detalle por paso desplegado');
    await assertShown(page, '1 en cola', 'paso 2 en cola');
    await cueBox(nar, rowOf(SEQ_FLOW).getByText('Paso 2').first());
    await nar.say(clips.steps);

    // ── Encolar ya del paso futuro (desde sus programados) → bandeja ──
    // El badge "N programados" de la tarjeta abre Programados filtrado por
    // ESTA secuencia: "Encolar ya" no puede tocar el paso de otra.
    await nar.clearCue();
    await rowOf(SEQ_FLOW).getByRole('button', { name: /programados/ }).first().click();
    await sleep(page, 1200);
    const schedPanel = page.locator('#seq-panel-scheduled');
    await assertShown(page, '18 oct', 'paso 1 programado (18 oct)', 8000, schedPanel);
    const enqueueBtn = schedPanel.locator('button:visible', { hasText: 'Encolar ya' }).first();
    await cueBox(nar, enqueueBtn);
    await nar.say(clips.enqueue);
    await enqueueBtn.click();
    await sleep(page, 1800);
    await page.getByRole('tab', { name: 'Bandeja WhatsApp' }).click();
    await sleep(page, 900);
    // Bandeja: la fila del paso 1 (plantilla C, Servidor Demo). La tab
    // Secuencias sigue montada (oculta) y su tarjeta también matchea
    // SEQ_FLOW, y la bandeja trae además el paso 2 (plantilla B) del mismo
    // servidor: acotar al panel + plantilla C + botón del participante.
    const queuePanel = page.locator('#seq-panel-pending');
    await assertShown(page, TPL_C, 'bandeja: ítem con plantilla C', 8000, queuePanel);
    const flowRow = queuePanel.locator('div.p-3').filter({
      hasText: TPL_C,
      has: page.getByRole('button', { name: 'Servidor Demo' }),
    }).first();
    await cueBox(nar, flowRow);
    await sleep(page, 1500);

    // ── Envío: detalle resuelto → Abrir WhatsApp → marcado enviado ──
    await flowRow.getByRole('button', { name: 'Servidor Demo' }).click();
    await sleep(page, 900);
    await assertShown(page, 'Hola Servidor', 'detalle: mensaje con variables resueltas');
    await cueBox(nar, page.getByText('Hola Servidor').first());
    await nar.say(clips.send);
    await page.getByRole('dialog').getByRole('button', { name: 'Abrir WhatsApp' }).click();
    await sleep(page, 1500); // dispatch + window.open(wa.me) en otra pestaña
    // La pestaña de WhatsApp no se graba (y no hace falta): cerrarla.
    for (const p of ctx.pages()) if (p !== page) await p.close().catch(() => {});
    await sleep(page, 600);
    const stillQueued = await flowRow.count();
    log(stillQueued === 0 ? '   ✓ envío: ítem salió de la bandeja' : `   ⚠ el ítem C sigue visible (${stillQueued}) — revisar`);

    // ── M4: preview con hueco + Problemas omitido ──
    // (tabs sin exact: el badge contador se concatena al nombre accesible)
    await page.getByRole('tab', { name: 'Secuencias' }).click();
    await sleep(page, 600);
    await editBtnOf(SEQ_M4).click();
    await page.getByText('Editar secuencia').first().waitFor({ timeout: 6000 });
    await sleep(page, 900);
    await dlg.getByRole('button', { name: 'Ver vista previa de este paso' }).first().click();
    await sleep(page, 900);
    await assertShown(page, 'hueco de envío manual', 'preview: warning del hueco');
    await cueBox(nar, page.getByText('hueco de envío manual').first());
    await nar.say(clips.m4);
    await sleep(page, 1500);
    // Cerrar preview y editor (Escape apila en reka-ui) y cerrar sobre la
    // lista. No se abre Problemas: depende de que el demo conserve filas
    // M4 omitidas, y un descarte masivo (2026-10-02) lo dejó vacío — un tab
    // vacío contradice la narración. La protección se ve en la vista previa.
    await page.keyboard.press('Escape').catch(() => {});
    await sleep(page, 500);
    if (await page.getByRole('dialog').count()) await page.keyboard.press('Escape').catch(() => {});
    await sleep(page, 700);

    await nar.clearCue();
    await nar.say(clips.outro);
    await sleep(page, 1000);
    await nar.clear();
    await sleep(page, 400);
  } catch (err) {
    console.error('❌ Error durante la grabación:', err);
    await page.screenshot({ path: path.join(OUTPUT_DIR, 'error-sequence-fixes.png') }).catch(() => {});
  }

  const wallMs = nar.elapsedMs;
  await ctx.close();
  const videoPath = await video.path();
  await browser.close();
  log('🎬 Video crudo:', videoPath);

  const webmDur = await audioDuration(cfg.ffprobe, videoPath);
  const syncScale = computeSyncScale(webmDur, wallMs);
  log(`⏱  sync: webm ${webmDur.toFixed(1)}s / reloj ${(wallMs / 1000).toFixed(1)}s → scale ${syncScale.toFixed(4)}`);

  const out = path.join(OUTPUT_DIR, 'sequence-fixes-demo.mp4');
  log('🔊 Muxeando audio…');
  await muxVideo(cfg, { video: videoPath, timeline: nar.timeline, out, syncOffsetMs: SYNC_OFFSET_MS, syncScale });

  // Chapters at the REAL mp4 position (clock offset × syncScale − lead trim);
  // the raw clock timeline put them ~8 s early and merged close beats.
  const chapters = buildYoutubeChapters(
    alignChapterTimeline(nar.timeline, { syncScale, syncOffsetMs: SYNC_OFFSET_MS }),
    { labels: CHAPTER_LABELS },
  );
  writeVideoMeta(out, { title: YT_TITLE, description: YT_DESCRIPTION, tags: YT_TAGS, chapters });
  log('✅ Listo:', out);
  log('— Timeline —');
  for (const t of nar.timeline) log(`  ${(t.offsetMs / 1000).toFixed(1)}s  ${t.id}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
