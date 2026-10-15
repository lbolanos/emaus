// Video-demo narrado: enlaces personales de guardia del Santísimo (M1-M5).
//
// Guion sobre el retiro real Buen Despacho con PII enmascarada por maskRoute
// (nombres/teléfonos fake deterministas): sidebar → vista admin → menú ⋮ →
// "Enviar enlaces de guardia por WhatsApp" → plantilla sembrada con la variable
// → "Abrir WhatsApp" de la primera fila (el popup wa.me se intercepta y el
// mensaje se muestra en una preview en cámara) → vista pública del enlace del
// destinatario: elegir → guardar → cambiar → quitar.
//
//   cd apps/web && DEMO_BASE_URL=http://localhost:5174 node e2e/demo/record-santisimo-links.mjs
//
// Requiere el dev del worktree (API :3002 con SKIP_RATE_LIMIT=true, web :5174).
// La toma hace 3 mutaciones públicas (signup ×2 + delete) y las deja limpias:
// el guion termina quitando la guardia y el cleanup verifica por el dato.
// santisimoEnabled del retiro se restaura a su valor previo al cerrar.
//
// PII: maskRoute sobre **/api/** fakes nombres/teléfonos; el POST de
// participant-communications se stubea (cero mutación del historial); el token
// del invite se recorta en la preview (no queda legible en el frame). El nombre
// del saludo del invite se fuerza al de la fila: la respuesta pública no trae
// `id` y maskNode derivaría otro fake (seed distinto) — incoherente en cámara.

import pw from '@playwright/test';
const { chromium } = pw;
import path from 'node:path';
import {
  loadEnv, ensureOutputDir, genTts, OVERLAY_INIT, Narrator, muxVideo,
  computeSyncScale, audioDuration, buildYoutubeChapters, writeVideoMeta,
  alignChapterTimeline, renderEndCard, appendEndCard, maskRoute, maskNode, OUTPUT_DIR,
} from './demo-lib.mjs';

const cfg = loadEnv();
const W = 1280, H = 800;
const SYNC_OFFSET_MS = 0;
const OVERLAY = OVERLAY_INIT.replace('✝ Emaús · Tareas Pre-Retiro', '✝ Emaús · Guardias Santísimo');

// Buen Despacho (2026-10-16 → 10-18): retiro futuro con 44 slots y teléfono
// en las fichas. Si vence, volverlo a grabar exige otro retiro futuro.
const RETREAT_ID = process.env.RETREAT_ID || 'e9b3c568-050a-4d66-a99d-305f287a59df';
const TEMPLATE_NAME = 'Guardias Santísimo — elección de horario';

const LINES = [
  { id: 'intro',   text: 'Las guardias de la capilla ya no se asignan a mano: cada servidor elige la suya desde su celular.' },
  { id: 'admin',   text: 'Este es el horario de la capilla del retiro, con el cupo de cada horario.' },
  { id: 'menu',    text: 'Abre más acciones y elige: Enviar enlaces de guardia por WhatsApp.' },
  { id: 'queue',   text: 'Selecciona la plantilla de guardias del Santísimo.' },
  { id: 'queue2',  text: 'La variable del enlace se cambia por el enlace de cada servidor.' },
  { id: 'send',    text: 'Toca Abrir WhatsApp, y el mensaje sale con el enlace de esa persona.' },
  { id: 'preview', text: 'Así lo recibe. Es un enlace personal: no sirve para nadie más.' },
  { id: 'invite',  text: 'Al tocar su enlace, el servidor ve los horarios libres; los de la comida están marcados.' },
  { id: 'save',    text: 'Elige su horario y guarda.' },
  { id: 'change',  text: 'Si sus planes cambian, reabre el enlace: cambia el horario o lo quita.' },
  { id: 'outro',   text: 'Tú envías los enlaces; ellos eligen su guardia. Sin llamadas ni registros.' },
];

const YT_TITLE = 'Enlaces de guardias del Santísimo por WhatsApp';
const YT_DESCRIPTION =
  'Cómo enviar a cada servidor su enlace personal para que elija su guardia de la ' +
  'capilla del Santísimo desde el celular, sin cuenta: desde la vista de Guardias de ' +
  'la Capilla, la cola de WhatsApp con la plantilla que inyecta el enlace de cada ' +
  'persona, el mensaje que recibe, y la vista pública donde elige, cambia o quita su ' +
  'horario. Los nombres y teléfonos del demo son ficticios.';
const YT_TAGS = ['Emaús', 'retiro', 'Santísimo', 'guardias', 'WhatsApp', 'tutorial'];
const CHAPTER_LABELS = {
  intro: 'Dónde está en el menú', admin: 'El horario de la capilla',
  menu: 'Enviar enlaces por WhatsApp', queue: 'La plantilla de guardias',
  queue2: 'El enlace de cada servidor', send: 'Abrir WhatsApp',
  preview: 'El mensaje que recibe', invite: 'La vista del servidor',
  save: 'Elegir y guardar', change: 'Cambiar o quitar', outro: 'Resumen',
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
function assertShown(page, text, label, timeout = 8000, root = page) {
  return root
    .getByText(text)
    .first()
    .waitFor({ timeout })
    .then(() => log(`   ✓ ${label}`))
    .catch(() => log(`   ⚠ ${label} — NO apareció, revisar esta toma`));
}

/** Preview del mensaje de WhatsApp: la intercepta ctx.route('**wa.me/**'). */
const waPreviewHtml = (phone, text) => `<!doctype html><html><head><meta charset="utf-8"><style>
*{margin:0;padding:0;box-sizing:border-box}
html,body{height:100%;font-family:Helvetica,Arial,sans-serif;background:#e5ddd5}
.bar{background:#075e54;color:#fff;padding:18px 26px;font-size:20px;font-weight:600}
.bar small{display:block;font-weight:400;font-size:14px;opacity:.85;margin-top:2px}
.chat{padding:34px 40px}
.bubble{background:#dcf8c6;border-radius:12px;padding:18px 22px;max-width:760px;
  font-size:19px;line-height:1.55;white-space:pre-wrap;word-break:break-word;
  box-shadow:0 1px 2px rgba(0,0,0,.12)}
.note{margin-top:26px;color:#5b544a;font-size:14px}
</style></head><body>
<div class="bar">WhatsApp<small>Para: +${phone}</small></div>
<div class="chat"><div class="bubble">${text}</div>
<div class="note">Vista previa del mensaje generado por Emaús — se envía desde tu WhatsApp.</div></div>
</body></html>`;

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

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
  await ctx.addInitScript((rid) => {
    localStorage.setItem('preferred-locale', 'es');
    localStorage.setItem('selectedRetreatId', rid);
  }, RETREAT_ID);
  await ctx.addInitScript(OVERLAY);

  // ── Setup por API (fuera de cámara): santisimoEnabled + CSRF para el cleanup ──
  const csrf = (await (await ctx.request.get(`${cfg.baseUrl}/api/csrf-token`)).json()).csrfToken;
  const HDR = { 'X-CSRF-Token': csrf, 'Content-Type': 'application/json' };
  const retreatResp = await ctx.request.get(`${cfg.baseUrl}/api/retreats/${RETREAT_ID}`);
  if (!retreatResp.ok()) throw new Error(`GET retreat → ${retreatResp.status()}`);
  const retreat = await retreatResp.json();
  const prevSantisimoEnabled = Boolean(retreat.santisimoEnabled);
  if (!prevSantisimoEnabled) {
    const put = await ctx.request.put(`${cfg.baseUrl}/api/retreats/${RETREAT_ID}`, {
      headers: HDR, data: { santisimoEnabled: true },
    });
    log(`   PUT santisimoEnabled=true → ${put.status()}`);
  }

  // Preview de WhatsApp para TODO el contexto: el popup del window.open y el
  // page.goto posterior reciben el mismo HTML (el mensaje es el real generado).
  // OJO con el dominio: buildWhatsAppSendLink usa wa.me O api.whatsapp.com/send
  // (toma 1: el goto real se fue a internet y timeó) — cubrir ambos.
  await ctx.route(/https?:\/\/(wa\.me|api\.whatsapp\.com)\//, async (route) => {
    try {
      const u = new URL(route.request().url());
      const phone = u.searchParams.get('phone') || u.pathname.replace(/^\//, '');
      const text = u.searchParams.get('text') || '';
      // El token del invite no queda legible en el frame (capability de dev).
      const safe = esc(text).replace(/(santisimo\/servidor\/[A-Za-z0-9_-]{10})[A-Za-z0-9_-]*/g, '$1…');
      await route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: waPreviewHtml(phone, safe) });
    } catch {
      await route.continue().catch(() => {});
    }
  });

  // El nombre del saludo del invite se fuerza al de la fila (ver header).
  let inviteName = null;
  const inviteFullName = (first) => (inviteName && inviteName.includes(' ')) ? inviteName : first;

  const page = await ctx.newPage();
  page.setDefaultTimeout(6000);
  page.setDefaultNavigationTimeout(30000);

  // Orden de evaluación: la última registrada gana. maskRoute primero (base),
  // luego los overrides específicos.
  await page.route('**/api/**', maskRoute);
  await page.route('**/api/participant-communications**', (route) =>
    route.fulfill({ status: 201, contentType: 'application/json', body: '{"id":"demo-stub"}' }));
  await page.route('**/api/santisimo/public/invite/**', async (route) => {
    // Toma 3: el DELETE responde 204 SIN body → resp.json() lanzaba y el
    // route.continue() del catch re-enviaba la mutación upstream: el 2º DELETE
    // ya no encontraba signup → 404 "No signup to cancel" en cámara. Regla:
    // tras route.fetch() de una mutación, JAMÁS continue() — o se ejecuta dos veces.
    const resp = await route.fetch();
    if (route.request().method() !== 'GET' || resp.status() === 204) {
      return route.fulfill({ response: resp }).catch(() => {});
    }
    try {
      const d = await resp.json();
      maskNode(d);
      if (inviteName && d.participant) {
        d.participant.firstName = inviteName.split(/\s+/)[0];
        d.participant.fullName = inviteFullName(d.participant.firstName);
      }
      return route.fulfill({ response: resp, body: JSON.stringify(d) });
    } catch {
      return route.fulfill({ response: resp }).catch(() => {});
    }
  });

  const video = page.video();
  const nar = new Narrator(page, cfg);
  nar.start();

  let inviteToken = null; // para el cleanup por el dato

  try {
    // ── Sidebar: dónde vive (PERSONAS colapsada → expandir → link) ──
    await page.goto(`${cfg.baseUrl}/app`, { waitUntil: 'networkidle' });
    await sleep(page, 1200);
    const personas = page.locator('nav button', { hasText: /^\s*PERSONAS\s*$/i }).first();
    if ((await personas.getAttribute('aria-expanded').catch(() => null)) !== 'true') {
      await personas.evaluate((el) => el.click());
      await sleep(page, 700);
    }
    const item = page.getByRole('link', { name: 'Guardias de la Capilla' }).first();
    await cueBox(nar, item);
    await nar.say(clips.intro);
    // DOM click: inmune a la intercepción de pointer del acordeón (lección del tour).
    await item.evaluate((el) => el.click());
    await page.waitForURL(/santisimo/, { timeout: 15000 });
    await page.getByTestId('santisimo-actions-button').waitFor({ timeout: 15000 });
    await sleep(page, 1500);

    // ── Vista admin: el horario de la capilla ──
    await nar.say(clips.admin);
    await sleep(page, 400);

    // ── Menú ⋮ → Enviar enlaces de guardia por WhatsApp ──
    const actions = page.getByTestId('santisimo-actions-button');
    await cueBox(nar, actions);
    await nar.say(clips.menu);
    await actions.click();
    await sleep(page, 700);
    const menuItem = page.getByTestId('santisimo-guardia-links-button');
    await menuItem.waitFor({ timeout: 6000 });
    await cueBox(nar, menuItem);
    await sleep(page, 500);
    await menuItem.click();

    // ── Cola: plantilla sembrada + variable del enlace ──
    const tplSelect = page.locator('select').filter({
      has: page.locator('option', { hasText: 'Guardias Santísimo' }),
    }).first();
    await tplSelect.waitFor({ timeout: 15000 }); // la cola abre tras 3 fetches
    await sleep(page, 900);
    await cueBox(nar, tplSelect);
    await nar.say(clips.queue);
    await tplSelect.selectOption({ label: TEMPLATE_NAME });
    await sleep(page, 700);
    const area = page.locator('textarea.font-mono');
    await area.scrollIntoViewIfNeeded().catch(() => {});
    await cueBox(nar, area);
    await nar.say(clips.queue2);
    await sleep(page, 400);

    // ── Primera fila: Abrir WhatsApp → popup wa.me interceptado ──
    const row = page.locator('div.divide-y > div.flex').first();
    await row.waitFor({ timeout: 8000 });
    inviteName = (await row.locator('div.font-medium').innerText().catch(() => '')).trim() || null;
    log(`   fila 1 (fake): ${inviteName}`);
    const sendBtn = row.getByRole('button', { name: 'Abrir WhatsApp' });
    await sendBtn.scrollIntoViewIfNeeded().catch(() => {});
    await cueBox(nar, sendBtn);
    await nar.say(clips.send);
    const popupPromise = page.waitForEvent('popup', { timeout: 8000 });
    await sendBtn.click();
    const popup = await popupPromise;
    const waUrl = popup.url();
    await popup.close().catch(() => {});
    const waU = new URL(waUrl);
    const msgText = waU.searchParams.get('text') || '';
    const tok = msgText.match(/santisimo\/servidor\/([A-Za-z0-9_-]+)/);
    if (!tok) throw new Error(`el mensaje del popup no trae enlace personal: ${waUrl}`);
    inviteToken = tok[1];
    // Verificación por el dato ANTES de seguir grabando: la toma 2 murió 40 s
    // después con "Enlace no válido"; si el token del popup no resuelve, hay
    // que saberlo acá (el probe de hoy reproduce este camino en verde).
    const tokCheck = await ctx.request.get(`${cfg.baseUrl}/api/santisimo/public/invite/${inviteToken}`);
    log(`   ✓ popup wa.me con enlace personal del destinatario de la fila 1 (GET por el dato → ${tokCheck.status()})`);
    if (tokCheck.status() !== 200) {
      throw new Error(`el token del popup no resuelve: GET invite → ${tokCheck.status()}`);
    }

    // El mensaje en cámara: la page principal navega a la misma URL interceptada.
    await page.goto(waUrl);
    await sleep(page, 900);
    await cueBox(nar, page.locator('.bubble').first());
    await nar.say(clips.preview);
    await nar.clearCue();

    // ── Vista pública del enlace del destinatario ──
    // Fuera de cámara: si una toma previa dejó guardia, quitarla (el guion
    // arranca "sin guardia actual").
    const invCheckResp = await ctx.request.get(`${cfg.baseUrl}/api/santisimo/public/invite/${inviteToken}`);
    log(`   limpieza: GET invite fuera de cámara → ${invCheckResp.status()}`);
    const invCheck = await invCheckResp.json();
    if (invCheck.current) {
      await ctx.request.delete(`${cfg.baseUrl}/api/santisimo/public/invite/${inviteToken}/signup`);
      log('   limpieza: guardia previa del destinatario quitada');
    }
    await page.goto(`${cfg.baseUrl}/santisimo/servidor/${inviteToken}`, { waitUntil: 'networkidle' });
    // La toma 2 mostró "Enlace no válido" pese a un token verificado por el
    // dato (no reproducido por el probe): reintento único antes de rendirse.
    if (await page.getByText('Enlace no válido').count().catch(() => 0)) {
      log('   ⚠ "Enlace no válido" tras el goto — reintentando una vez');
      await page.waitForTimeout(1500);
      await page.goto(`${cfg.baseUrl}/santisimo/servidor/${inviteToken}`, { waitUntil: 'networkidle' });
    }
    await page.getByText('Hola,').first().waitFor({ timeout: 10000 });
    await sleep(page, 900);
    await assertShown(page, 'Este enlace es personal', 'nota de enlace personal');
    await nar.say(clips.invite);
    await page.getByText('Coincide con la hora de comida').first()
      .scrollIntoViewIfNeeded().catch(() => {});
    await sleep(page, 900);

    // ── Elegir → guardar ──
    const radio1 = page.locator('input[type="radio"][name="santisimo-guardia-slot"]:enabled').first();
    await radio1.scrollIntoViewIfNeeded();
    await cueBox(nar, radio1);
    await nar.say(clips.save);
    await radio1.check();
    await sleep(page, 500);
    await page.getByRole('button', { name: 'Guardar mi horario' }).click();
    await page.getByText('¡Listo! Tu horario quedó guardado').first().waitFor({ timeout: 10000 });
    log('   ✓ guardia guardada');
    await sleep(page, 900);

    // ── Cambiar → quitar (cierra la mutación de la toma) ──
    await nar.say(clips.change);
    const radio2 = page.locator('input[type="radio"][name="santisimo-guardia-slot"]:enabled').nth(1);
    await radio2.scrollIntoViewIfNeeded();
    await cueBox(nar, radio2);
    await radio2.check();
    const radio2SlotId = await radio2.inputValue();
    await sleep(page, 500);
    await page.getByRole('button', { name: 'Guardar mi horario' }).click();
    // Toma 3: esperar «¡Listo!» aquí pasa en ~24ms con el banner VIEJO del
    // primer guardado (falso positivo) — verificar por el dato en su lugar.
    let changedOk = false;
    for (let i = 0; i < 20 && !changedOk; i++) {
      const inv = await (await ctx.request.get(
        `${cfg.baseUrl}/api/santisimo/public/invite/${inviteToken}`)).json();
      changedOk = inv.current?.slotId === radio2SlotId;
      if (!changedOk) await sleep(page, 500);
    }
    if (!changedOk) throw new Error('el cambio no se reflejó en el API (current != radio2)');
    log('   ✓ guardia cambiada (current del API = radio2)');
    await sleep(page, 800);
    const removeBtn = page.getByRole('button', { name: 'Quitar mi guardia' });
    await cueBox(nar, removeBtn);
    await removeBtn.click();
    await page.getByText('Quitaste tu guardia').first().waitFor({ timeout: 10000 });
    // verificación por el dato: la guardia ya no existe para el token
    const afterRemove = await (await ctx.request.get(
      `${cfg.baseUrl}/api/santisimo/public/invite/${inviteToken}`)).json();
    if (afterRemove.current) throw new Error('el quitar no llegó al API (current sigue vivo)');
    log('   ✓ guardia quitada (current=null en el API)');
    await sleep(page, 900);

    await nar.clearCue();
    await nar.say(clips.outro);
    await sleep(page, 800);
    await nar.clear();
    await sleep(page, 400);
  } catch (err) {
    console.error('❌ Error durante la grabación:', err);
    await page.screenshot({ path: path.join(OUTPUT_DIR, 'error-santisimo-links.png') }).catch(() => {});
  }

  // ── Cleanup verificado por el dato ──
  try {
    if (inviteToken) {
      const inv = await (await ctx.request.get(
        `${cfg.baseUrl}/api/santisimo/public/invite/${inviteToken}`)).json();
      if (inv.current) {
        const del = await ctx.request.delete(
          `${cfg.baseUrl}/api/santisimo/public/invite/${inviteToken}/signup`);
        log(`   cleanup signup residual → ${del.status()}`);
      } else {
        log('   cleanup: sin guardia residual ✓');
      }
    }
    if (prevSantisimoEnabled !== undefined) {
      const restore = await ctx.request.put(`${cfg.baseUrl}/api/retreats/${RETREAT_ID}`, {
        headers: HDR, data: { santisimoEnabled: prevSantisimoEnabled },
      });
      log(`   restore santisimoEnabled=${prevSantisimoEnabled} → ${restore.status()}`);
    }
  } catch (e) {
    console.error('⚠ cleanup incompleto:', e.message);
  }

  const wallMs = nar.elapsedMs;
  await ctx.close();
  const videoPath = await video.path();
  log('🎬 Video crudo:', videoPath);

  // End card primero: renderEndCard abre un contexto propio y necesita el
  // browser vivo (browser.close va después).
  const card = path.join(OUTPUT_DIR, 'santisimo-guardia-links-card.png');
  await renderEndCard(browser, {
    title: 'Guardias del Santísimo',
    subtitle: 'Cada servidor elige su horario desde su celular',
    out: card,
  });
  await browser.close();

  const webmDuration = await audioDuration(cfg.ffprobe, videoPath);
  const syncScale = computeSyncScale(webmDuration, wallMs);
  log(`⏱  sync: webm ${webmDuration.toFixed(1)}s / reloj ${(wallMs / 1000).toFixed(1)}s → scale ${syncScale.toFixed(4)}`);

  const muxed = path.join(OUTPUT_DIR, 'santisimo-guardia-links-demo.mp4');
  log('🔊 Muxeando audio…');
  await muxVideo(cfg, { video: videoPath, timeline: nar.timeline, out: muxed, syncOffsetMs: SYNC_OFFSET_MS, syncScale });

  const out = path.join(OUTPUT_DIR, 'santisimo-guardia-links-demo-final.mp4');
  await appendEndCard(cfg, { video: muxed, card, out, seconds: 12 });

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
