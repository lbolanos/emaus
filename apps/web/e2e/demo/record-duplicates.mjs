// Video-demo narrado: fusionar fichas duplicadas de una comunidad (M0–M4).
//
// Guion completo sobre la comunidad real "Buen despacho" (dev local) con TODO
// el API enmascarado por maskRoute y el ciclo de duplicados interceptado con
// ESTADO: los GETs sirven los pares reales (ids reales → el preview de merge
// corre contra la red y muestra cifras creíbles) y las escrituras (POST merge,
// POST dismiss, DELETE undo) solo mutan el estado del interceptor. La dev DB
// no se toca: la toma es repetible y el fixture (par Garay = falso positivo,
// par Vallejos = duplicado real) sigue vivo para futuras tomas.
//
//   cd apps/web && node e2e/demo/record-duplicates.mjs
//
// El preview (GET /duplicates/preview) NO se intercepta: es de solo lectura y
// su respuesta pasa por maskRoute. El diálogo no renderiza keepLabel/mergeLabel
// (solo moves/blockers), así que los nombres reales de esas claves no llegan a
// pantalla. El gate de PII (_pii-gate-duplicates.mjs) se corre ANTES de mostrar
// el video.

import pw from '@playwright/test';
const { chromium } = pw;
import path from 'node:path';
import {
  loadEnv, ensureOutputDir, genTts, OVERLAY_INIT, Narrator, muxVideo,
  computeSyncScale, audioDuration, buildYoutubeChapters, writeVideoMeta, OUTPUT_DIR,
  alignChapterTimeline, maskRoute, maskNode,
} from './demo-lib.mjs';

const cfg = loadEnv();
const W = 1280, H = 800;
const SYNC_OFFSET_MS = 0;
const OVERLAY = OVERLAY_INIT.replace('✝ Emaús · Tareas Pre-Retiro', '✝ Emaús · Comunidades');

const COMMUNITY_NAME = 'Buen despacho';
const COMMUNITY_ID = 'f1060047-5305-4f75-89c4-a649e449975e';

const LINES = [
  { id: 'sidebar', text: '¿Dónde se arregla? En el menú lateral, abre Comunidad y entra a Comunidades.' },
  { id: 'pick', text: 'Elige tu comunidad y entra a su panel.' },
  { id: 'members', text: 'En el panel, abre Miembros.' },
  { id: 'open', text: 'El botón Duplicados trae el número de pares pendientes: hoy hay dos. Ábrelo.' },
  { id: 'what', text: 'El sistema compara correo, teléfono y nombre, ignorando acentos. Son sugerencias: revisa cada pareja antes de actuar.' },
  { id: 'pair', text: 'Aquí la misma persona tiene dos fichas. Se conserva la de más registros, y puedes cambiarla.' },
  { id: 'preview_do', text: 'Toca Ver qué se movería. Es obligatorio mirar qué se transfiere antes de fusionar.' },
  { id: 'preview_ok', text: 'Estos registros pasarán a la ficha que se conserva. Sin bloqueos, se puede fusionar.' },
  { id: 'merge_do', text: 'Al fusionar, inscripciones, asistencias y mensajes pasan a una sola ficha. La otra queda archivada, no se borra.' },
  { id: 'merged', text: 'Fusionadas. El contador bajó a uno: queda un par por revisar.' },
  { id: 'false', text: 'Este par comparte teléfono, pero son dos personas distintas.' },
  { id: 'dismiss_do', text: 'Toca No son la misma persona y confirma. El doble paso evita descartar por error.' },
  { id: 'dismissed', text: 'El par salió de la lista y el botón quedó sin número: no queda nada pendiente.' },
  { id: 'section', text: 'Los descartes quedan en Pares descartados, por si hubo un error.' },
  { id: 'undo', text: 'Deshacer revive el par al instante.' },
  { id: 'outro', text: 'Fusiona los repetidos, descarta los falsos y revisa hasta dejar el botón sin número. Un minuto, una vez al mes.' },
];

const YT_TITLE = 'Comunidad: fusionar fichas duplicadas';
const YT_DESCRIPTION =
  'Cómo resolver las fichas duplicadas de una comunidad en Emaús: el botón ' +
  'Duplicados con el conteo de pares pendientes, la revisión de cada pareja ' +
  '(correo, teléfono o nombre, ignorando acentos), el preview obligatorio de lo ' +
  'que se moverá, la fusión (todo pasa a la ficha conservada y la otra queda ' +
  'archivada), el descarte de falsos positivos con confirmación en dos pasos y ' +
  'su deshacer. Los nombres y datos visibles son ficticios.';
const YT_TAGS = ['Emaús', 'comunidad', 'duplicados', 'fusionar', 'padrón', 'tutorial'];
const CHAPTER_LABELS = {
  sidebar: 'Dónde está en el menú', what: 'Qué son los pares sugeridos',
  pair: 'Revisar un par: cuál ficha se conserva', preview_do: 'El preview obligatorio',
  merge_do: 'Fusionar un duplicado real', false: 'Descartar un falso positivo',
  section: 'Pares descartados y deshacer', outro: 'Resumen',
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
      log(`   login reintento ${attempt}…`);
      await new Promise((r) => setTimeout(r, 2000));
    }
  }

  const ctx = await browser.newContext({
    storageState: authState, viewport: { width: W, height: H }, locale: 'es-MX',
    recordVideo: { dir: OUTPUT_DIR, size: { width: W, height: H } },
  });
  await ctx.addInitScript(() => localStorage.setItem('preferred-locale', 'es'));
  await ctx.addInitScript(OVERLAY);

  // ── Fixture: los pares REALES de la dev, ya enmascarados ──
  // ctx.request no pasa por page.route: esta respuesta llega cruda al script.
  // Solo se loguean ids/counts — nombres y correos reales nunca van al log.
  const dupResp = await ctx.request.get(`${cfg.baseUrl}/api/communities/${COMMUNITY_ID}/duplicates`);
  if (!dupResp.ok()) throw new Error(`GET /duplicates → ${dupResp.status()}`);
  const rawPairs = await dupResp.json();
  if (!Array.isArray(rawPairs) || rawPairs.length < 2) {
    throw new Error(`La comunidad necesita ≥2 pares para el guion (hay ${Array.isArray(rawPairs) ? rawPairs.length : '?'})`);
  }
  const state = {
    pairs: JSON.parse(JSON.stringify(rawPairs)),
    mergedKeys: new Set(),
    dismissals: [], // { key, id, participantA, participantB, createdAt }
  };
  maskNode(state.pairs);
  const keyOf = (p) => p.participants.map((x) => x.id).sort().join('|');
  // Par a FUSIONAR: el que tiene una ficha con cuenta (Vallejos — duplicado
  // real). Par a DESCARTAR: el otro (Garay — hermanos, falso positivo).
  const mergePair = state.pairs.find((p) => p.participants.some((x) => x.hasUser)) || state.pairs[0];
  const dismissPair = state.pairs.find((p) => p !== mergePair);
  if (!dismissPair) throw new Error('Falta el segundo par (falso positivo) para el guion');
  const keepP = mergePair.participants[0]; // el de más refs: primero del array
  const mergeP = mergePair.participants[1];
  log(`🎯 par a fusionar: keep ${keepP.id.slice(0, 8)} (${keepP.references} refs) + merge ${mergeP.id.slice(0, 8)} (${mergeP.references} refs)`);
  log(`🎯 par a descartar: ${dismissPair.participants.map((x) => x.id.slice(0, 8) + ` (${x.references}r)`).join(' + ')}`);

  const page = await ctx.newPage();
  page.setDefaultTimeout(6000);
  page.setDefaultNavigationTimeout(30000);

  // Red de seguridad primero (menor prioridad); los específicos abajo ganan.
  await page.route('**/api/**', maskRoute);

  // ── Ciclo de duplicados con estado (LIFO: estos corren antes que maskRoute) ──
  const live = () => state.pairs.filter(
    (p) => !state.mergedKeys.has(keyOf(p)) && !state.dismissals.some((d) => d.key === keyOf(p)),
  );
  const json = (route, body, status = 200) =>
    route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
  const pairByParticipants = (aId, bId) => state.pairs.find(
    (p) => p.participants.some((x) => x.id === aId) && p.participants.some((x) => x.id === bId),
  );

  await page.route(`**/api/communities/${COMMUNITY_ID}/duplicates`, async (route) => {
    if (route.request().method() !== 'GET') return route.continue();
    return json(route, live());
  });
  await page.route(`**/api/communities/${COMMUNITY_ID}/duplicates/count`, async (route) => {
    if (route.request().method() !== 'GET') return route.continue();
    return json(route, { count: live().length });
  });
  await page.route(`**/api/communities/${COMMUNITY_ID}/duplicates/dismissals`, async (route) => {
    if (route.request().method() !== 'GET') return route.continue();
    return json(route, state.dismissals.map(({ key, ...d }) => d));
  });
  await page.route(`**/api/communities/${COMMUNITY_ID}/duplicates/merge`, async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    const { keepId, mergeId } = route.request().postDataJSON();
    const p = pairByParticipants(keepId, mergeId);
    if (p) state.mergedKeys.add(keyOf(p));
    return json(route, { merged: true, keepId, mergeId, moves: [], blockers: [], attendanceMoved: 0, attendanceMerged: 0 });
  });
  await page.route(`**/api/communities/${COMMUNITY_ID}/duplicates/dismiss`, async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    const { participantAId, participantBId } = route.request().postDataJSON();
    const p = pairByParticipants(participantAId, participantBId);
    if (!p) return json(route, { message: 'par no encontrado' }, 404);
    const a = p.participants.find((x) => x.id === participantAId);
    const b = p.participants.find((x) => x.id === participantBId);
    const slim = (x) => ({ id: x.id, firstName: x.firstName, lastName: x.lastName });
    const dismissal = {
      id: `dismissal-demo-${state.dismissals.length + 1}`,
      participantA: slim(a), participantB: slim(b),
      createdAt: new Date().toISOString(),
    };
    state.dismissals.push({ key: keyOf(p), ...dismissal });
    return json(route, dismissal);
  });
  await page.route(`**/api/communities/${COMMUNITY_ID}/duplicates/dismissals/*`, async (route) => {
    if (route.request().method() !== 'DELETE') return route.continue();
    const id = route.request().url().split('/').pop();
    state.dismissals = state.dismissals.filter((d) => d.id !== id);
    return route.fulfill({ status: 204, body: '' });
  });

  const video = page.video();
  const nar = new Narrator(page, cfg);
  nar.start();

  const dlg = page.getByRole('dialog');
  const dupButton = () => page.getByRole('button', { name: /Duplicados/ }).first();
  // Card del par dentro del diálogo, localizado por el nombre completo ENMASCARADO
  // del participante 0 (mismo fake determinista que verá la UI: fakeFor(id)); el
  // botón de la ficha pinta "{{firstName}} {{lastName}}". Nombre completo = único
  // entre pares (un nombre de pila solo podría repetirse).
  const fullName = (p) => `${p.firstName} ${p.lastName}`.trim();
  const pairCard = (pair) => dlg.locator('div.border.rounded-lg.p-3').filter({
    hasText: fullName(pair.participants[0]),
  }).first();
  const dismissFull = fullName(dismissPair.participants[0]);
  const keepFull = fullName(mergePair.participants[0]);

  try {
    // ── Sidebar: dónde vive (sección Comunidad → Comunidades) ──
    await page.goto(`${cfg.baseUrl}/app`, { waitUntil: 'networkidle' });
    await sleep(page, 1500);
    // Acordeón: expandir solo si está colapsado (clic en expandida la cierra).
    // Regex anclado para no confundir "Comunidad" con "Mis comunidades"; si el
    // accessible name trae otro texto (chevron), cae al match laxo.
    try {
      let section = page.locator('button', { hasText: /^\s*Comunidad\s*$/i }).first();
      if (!(await section.count())) section = page.locator('button', { hasText: /Comunidad/i }).first();
      if ((await section.getAttribute('aria-expanded')) !== 'true') await section.click();
    } catch {}
    await sleep(page, 700);
    const communitiesLink = page.getByRole('link', { name: /^Comunidades$/ }).first();
    await cueBox(nar, communitiesLink);
    await nar.say(clips.sidebar);
    await communitiesLink.click({ timeout: 5000 }).catch(async () => {
      await page.goto(`${cfg.baseUrl}/app/communities`, { waitUntil: 'networkidle' });
    });
    await page.waitForURL(/\/app\/communities$/, { timeout: 15000 });
    await sleep(page, 1500);

    // ── Elegir la comunidad ──
    const communityLink = page.getByRole('link', { name: new RegExp(COMMUNITY_NAME, 'i') }).first();
    await assertShown(page, COMMUNITY_NAME, `comunidad "${COMMUNITY_NAME}" en la lista`);
    await cueBox(nar, communityLink);
    await nar.say(clips.pick);
    await communityLink.click({ timeout: 5000 }).catch(async () => {
      await page.goto(`${cfg.baseUrl}/app/communities/${COMMUNITY_ID}`, { waitUntil: 'networkidle' });
    });
    await page.waitForURL(new RegExp(`/app/communities/${COMMUNITY_ID}`), { timeout: 15000 });
    await sleep(page, 1500);

    // ── Miembros ──
    const membersLink = page.getByRole('link', { name: /Miembros/i }).first();
    await cueBox(nar, membersLink);
    await nar.say(clips.members);
    await membersLink.click({ timeout: 5000 }).catch(() => page.goto(`${cfg.baseUrl}/app/communities/${COMMUNITY_ID}/members`, { waitUntil: 'networkidle' }));
    await page.waitForURL(/\/members/, { timeout: 15000 });
    await dupButton().waitFor({ timeout: 10000 });
    await sleep(page, 1200);

    // ── Apertura 1: badge + fusión del duplicado real ──
    await cueBox(nar, dupButton());
    await nar.say(clips.open);
    await dupButton().click();
    await dlg.waitFor({ timeout: 8000 });
    await sleep(page, 1500);
    await assertShown(page, 'Fichas duplicadas', 'diálogo abierto');
    await nar.clearCue();
    await nar.say(clips.what);

    const card1 = pairCard(mergePair);
    await assertShown(page, keepFull, 'par a fusionar visible', 8000, dlg);
    await cueBox(nar, card1);
    await nar.say(clips.pair);

    const previewBtn = card1.getByRole('button', { name: 'Ver qué se movería' });
    await cueBox(nar, previewBtn);
    await nar.say(clips.preview_do);
    await previewBtn.click();
    await assertShown(page, 'Se moverán', 'preview: "Se moverán N registros"');
    await nar.clearCue();
    await nar.say(clips.preview_ok);

    const mergeBtn = card1.getByRole('button', { name: 'Fusionar', exact: true });
    await cueBox(nar, mergeBtn);
    await nar.say(clips.merge_do);
    await mergeBtn.click();
    await sleep(page, 2000); // toast + recarga de la lista
    await assertShown(page, 'Fichas fusionadas', 'toast de fusión');
    await dlg.getByRole('button', { name: 'Cerrar' }).first().click();
    await sleep(page, 1000);
    await cueBox(nar, dupButton());
    await nar.say(clips.merged);
    await nar.clearCue();

    // ── Apertura 2: descarte del falso positivo ──
    await dupButton().click();
    await dlg.waitFor({ timeout: 8000 });
    await sleep(page, 1500);
    await assertShown(page, dismissFull, 'par falso positivo visible', 8000, dlg);
    const card2 = pairCard(dismissPair);
    await cueBox(nar, card2);
    await nar.say(clips.false);

    const notSame = card2.getByRole('button', { name: 'No son la misma persona' });
    await cueBox(nar, notSame);
    await nar.say(clips.dismiss_do);
    await notSame.click();
    await sleep(page, 800); // el botón arma la confirmación (doble paso)
    await card2.getByRole('button', { name: /¿Seguro\?/ }).click();
    await sleep(page, 2000); // recarga: lista vacía + sección descartados
    await assertShown(page, 'No se encontraron fichas duplicadas', 'lista vacía tras descartar', 8000, dlg);
    await dlg.getByRole('button', { name: 'Cerrar' }).first().click();
    await sleep(page, 1000);
    await cueBox(nar, dupButton());
    await nar.say(clips.dismissed);
    await nar.clearCue();

    // ── Apertura 3: descartados + deshacer ──
    await dupButton().click();
    await dlg.waitFor({ timeout: 8000 });
    await sleep(page, 1500);
    const sectionBtn = dlg.getByRole('button', { name: /Pares descartados/ });
    await cueBox(nar, sectionBtn);
    await nar.say(clips.section);
    await sectionBtn.click();
    await sleep(page, 900);
    await assertShown(page, 'Deshacer', 'sección expandida con Deshacer', 8000, dlg);
    const undoBtn = dlg.getByRole('button', { name: 'Deshacer' }).first();
    await cueBox(nar, undoBtn);
    await nar.say(clips.undo);
    await undoBtn.click();
    await sleep(page, 2000); // el par revive en la lista
    await assertShown(page, dismissFull, 'par revivido tras Deshacer', 8000, dlg);
    await dlg.getByRole('button', { name: 'Cerrar' }).first().click();
    await sleep(page, 900);

    await nar.clearCue();
    await nar.say(clips.outro);
    await sleep(page, 1000);
    await nar.clear();
    await sleep(page, 400);
  } catch (err) {
    console.error('❌ Error durante la grabación:', err);
    await page.screenshot({ path: path.join(OUTPUT_DIR, 'error-duplicates.png') }).catch(() => {});
  }

  const wallMs = nar.elapsedMs;
  await ctx.close();
  const videoPath = await video.path();
  await browser.close();
  log('🎬 Video crudo:', videoPath);

  const webmDur = await audioDuration(cfg.ffprobe, videoPath);
  const syncScale = computeSyncScale(webmDur, wallMs);
  log(`⏱  sync: webm ${webmDur.toFixed(1)}s / reloj ${(wallMs / 1000).toFixed(1)}s → scale ${syncScale.toFixed(4)}`);

  const out = path.join(OUTPUT_DIR, 'community-duplicates-demo.mp4');
  log('🔊 Muxeando audio…');
  await muxVideo(cfg, { video: videoPath, timeline: nar.timeline, out, syncOffsetMs: SYNC_OFFSET_MS, syncScale });

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
