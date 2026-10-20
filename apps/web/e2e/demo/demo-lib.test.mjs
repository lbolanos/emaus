// Tests de los helpers PUROS de demo-lib.mjs (sin red, sin ffmpeg, sin browser).
// Cubren la lógica propensa a regresiones: escala de sincronía audio↔video,
// armado de capítulos de YouTube y ensamblado de la metadata.
//
// Correr:  node --test apps/web/e2e/demo/demo-lib.test.mjs
//          (o `pnpm --filter web test:demo`)
//
// No usa Vitest a propósito: estos scripts son standalone (fuera de src/), Vitest
// solo escanea src/**. Node test runner nativo, cero dependencias.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { computeSyncScale, buildYoutubeChapters, writeVideoMeta } from './demo-lib.mjs';

test('computeSyncScale: 1 cuando falta algún dato', () => {
  assert.equal(computeSyncScale(0, 100000), 1);
  assert.equal(computeSyncScale(117, 0), 1);
  assert.equal(computeSyncScale(undefined, undefined), 1);
});

test('computeSyncScale: ratio webm/reloj en el caso típico', () => {
  // 117.36s de webm vs 114.45s de reloj ≈ 1.0254 (el drift real observado).
  const s = computeSyncScale(117.36, 114450);
  assert.ok(Math.abs(s - 1.0254) < 0.001, `esperaba ~1.0254, obtuve ${s}`);
});

test('computeSyncScale: clamp defensivo a [0.9, 1.1]', () => {
  assert.equal(computeSyncScale(200, 100000), 1.1); // 2.0 → 1.1
  assert.equal(computeSyncScale(50, 100000), 0.9); //  0.5 → 0.9
});

test('buildYoutubeChapters: [] si no llegan a 3 con separación mínima', () => {
  const tl = [
    { id: 'a', offsetMs: 0, text: 'A' },
    { id: 'b', offsetMs: 3000, text: 'B' },
    { id: 'c', offsetMs: 6000, text: 'C' }, // todos < 10s → solo 'a' → <3
  ];
  assert.deepEqual(buildYoutubeChapters(tl), []);
});

test('buildYoutubeChapters: primero en 0:00, respeta minGap, labels y formato mm:ss', () => {
  const tl = [
    { id: 'a', offsetMs: 0, text: 'Alpha' },
    { id: 'b', offsetMs: 5000, text: 'Beta' }, // 5s tras a → se salta
    { id: 'c', offsetMs: 12000, text: 'Gamma' }, // 12s tras a → entra (0:12)
    { id: 'd', offsetMs: 65000, text: 'Delta' }, // 53s tras c → entra (1:05)
  ];
  const ch = buildYoutubeChapters(tl, { labels: { a: 'Intro' } });
  assert.equal(ch.length, 3);
  assert.deepEqual(ch[0], { t: '0:00', label: 'Intro' }); // label del mapa
  assert.deepEqual(ch[1], { t: '0:12', label: 'Gamma' }); // fallback al texto
  assert.deepEqual(ch[2], { t: '1:05', label: 'Delta' });
});

test('buildYoutubeChapters: el gap al 2º capítulo se mide desde 0:00, no desde la 1ª voz', () => {
  // Timeline ya alineado al mp4: la 1ª voz cae a 0.7 s (leadKeepMs) y el
  // siguiente beat a 10.35 s → 10.35 s desde 0:00 (válido), aunque solo
  // 9.65 s desde la voz. Antes se descartaba ("Crear plantilla", toma 2026-10-02).
  const tl = [
    { id: 'a', offsetMs: 700, text: 'A' },
    { id: 'b', offsetMs: 10350, text: 'B' },
    { id: 'c', offsetMs: 40000, text: 'C' },
  ];
  assert.deepEqual(buildYoutubeChapters(tl).map((c) => c.t), ['0:00', '0:10', '0:40']);
});

test('buildYoutubeChapters: minGapSec configurable', () => {
  const tl = [
    { id: 'a', offsetMs: 0, text: 'A' },
    { id: 'b', offsetMs: 5000, text: 'B' },
    { id: 'c', offsetMs: 10000, text: 'C' },
  ];
  // Con gap de 5s los tres entran.
  const ch = buildYoutubeChapters(tl, { minGapSec: 5 });
  assert.equal(ch.length, 3);
  assert.equal(ch[0].t, '0:00');
  assert.equal(ch[2].t, '0:10');
});

test('writeVideoMeta: arma descripción con capítulos y escribe <base>.meta.json', () => {
  const mp4 = path.join(tmpdir(), `demo-meta-${process.pid}.mp4`);
  const metaPath = writeVideoMeta(mp4, {
    title: 'Título',
    description: '  Cuerpo de la descripción.  ',
    tags: ['a', 'b'],
    chapters: [
      { t: '0:00', label: 'Intro' },
      { t: '0:30', label: 'Medio' },
    ],
  });
  try {
    assert.equal(metaPath, mp4.replace(/\.mp4$/, '.meta.json'));
    const meta = JSON.parse(readFileSync(metaPath, 'utf8'));
    assert.equal(meta.title, 'Título');
    assert.deepEqual(meta.tags, ['a', 'b']);
    assert.equal(meta.chapters.length, 2);
    assert.ok(meta.description.startsWith('Cuerpo de la descripción.'), 'body trim');
    assert.ok(meta.description.includes('Contenido:\n0:00 Intro\n0:30 Medio'), 'capítulos');
  } finally {
    rmSync(metaPath, { force: true });
  }
});

test('writeVideoMeta: sin capítulos no agrega la sección "Contenido"', () => {
  const mp4 = path.join(tmpdir(), `demo-meta-nochap-${process.pid}.mp4`);
  const metaPath = writeVideoMeta(mp4, { title: 'T', description: 'Solo cuerpo.' });
  try {
    const meta = JSON.parse(readFileSync(metaPath, 'utf8'));
    assert.equal(meta.description, 'Solo cuerpo.');
    assert.ok(!meta.description.includes('Contenido'));
    assert.deepEqual(meta.chapters, []);
  } finally {
    rmSync(metaPath, { force: true });
  }
});

// ── maskNode / alignChapterTimeline (canónicos desde el refactor 2026-08-22) ──

test('maskNode: ningún dato real sobrevive en un payload de participante', async () => {
  const { maskNode } = await import('./demo-lib.mjs');
  const p = {
    id: 'p1', firstName: 'Rosa', lastName: 'Martínez', nickname: 'Rosita',
    email: 'rosa.martinez@gmail.com', cellPhone: '+52 461 123 4567',
    inviterCellPhone: '4611112222', inviterEmail: 'invita@gmail.com',
    emergencyContact1Name: 'Pedro Martínez', emergencyContact1CellPhone: '4613334444',
    invitedBy: 'Gerardo Aguilar',
    photo: 'https://s3.aws.com/faces/rosa.jpg', avatarUrl: '/uploads/rosa.png', picture: 'data:image/png;base64,xxx',
    nested: [{ displayName: 'Carlos Juárez', whatsapp: '4615556666' }],
  };
  maskNode(p);
  const flat = JSON.stringify(p);
  for (const real of ['Rosa', 'Martínez', 'rosa.martinez', '1234567', '4611112222', 'invita@', 'Pedro', 'Gerardo', 'Aguilar', 'Carlos Juárez', '4615556666', 's3.aws', 'uploads', 'base64']) {
    assert.ok(!flat.includes(real), `sobrevivió: ${real}`);
  }
  assert.equal(p.photo, ''); assert.equal(p.avatarUrl, ''); assert.equal(p.picture, '');
  assert.match(p.cellPhone, /^55\d{8}$/);
  assert.match(p.email, /@correo\.com$/);
  // Identidad consistente: el email fake deriva del MISMO nombre fake de la persona.
  assert.equal(p.email, `${p.firstName}.${p.lastName}@correo.com`.toLowerCase());
});

test('maskNode: determinista (mismo input → mismo fake)', async () => {
  const { maskNode } = await import('./demo-lib.mjs');
  const a = { id: 'x9', firstName: 'Rosa', lastName: 'Martínez' };
  const b = { id: 'x9', firstName: 'Rosa', lastName: 'Martínez' };
  maskNode(a); maskNode(b);
  assert.equal(a.firstName, b.firstName);
  assert.equal(a.lastName, b.lastName);
});

test('maskNode: etiqueta "Palanquero N (Nombre)" se enmascara en cualquier clave', async () => {
  const { maskNode } = await import('./demo-lib.mjs');
  const n = { label: 'Palanquero 2 (Juan Camacho)' };
  maskNode(n);
  assert.ok(!n.label.includes('Camacho'));
  assert.match(n.label, /^Palanquero 2 \(.+\)$/);
});

test('alignChapterTimeline: replica el leadTrim de muxVideo (filtra por file y redondea)', async () => {
  const { alignChapterTimeline } = await import('./demo-lib.mjs');
  const timeline = [
    { id: 'a', offsetMs: 2000, file: 'a.wav' },
    { id: 'b', offsetMs: 15000, file: 'b.wav' },
    { id: 'sinAudio', offsetMs: 100 }, // sin file: no cuenta para el trim
  ];
  const out = alignChapterTimeline(timeline, { syncScale: 1, syncOffsetMs: 0 });
  // leadTrim = 2000 - 700 = 1300 → offsets reposicionados al mp4 real.
  assert.equal(out[0].offsetMs, 700);
  assert.equal(out[1].offsetMs, 13700);
  assert.equal(out[2].offsetMs, 0); // clamp a 0, nunca negativo
});

test('maskNode enmascara los nombres sueltos del historial (recipientName/contactName/actorName)', async () => {
  const { maskNode } = await import('./demo-lib.mjs');
  // El historial del Seguimiento de caminantes trae el nombre real en una sola
  // clave, sin firstName al lado. Se coló en un frame de la grabación antes de
  // añadir estas claves.
  const n = {
    id: 'c1',
    recipientName: 'Pepe Toño Aguilar',
    contactName: 'Jose Aguilar',
    actorName: 'Leonardo Bolaños',
  };
  maskNode(n);
  assert.notEqual(n.recipientName, 'Pepe Toño Aguilar');
  assert.notEqual(n.contactName, 'Jose Aguilar');
  assert.notEqual(n.actorName, 'Leonardo Bolaños');
  for (const v of [n.recipientName, n.contactName, n.actorName]) {
    assert.match(v, /^\S+ \S+$/); // sigue pareciendo un nombre
  }
});

test('maskNode: signup del santísimo (name plano + slotId) se enmascara; un nombre de plantilla NO', async () => {
  const { maskNode } = await import('./demo-lib.mjs');
  // Toma 4 del demo de guardias (2026-10-14): los nombres reales de angelitos
  // (Eduardo Garay…) se colaron porque signup.name no tiene firstName al lado.
  const d = {
    slots: [
      { id: 's1', signups: [{ id: 'g1', slotId: 's1', name: 'Eduardo Garay', phone: '5512345678' }] },
      { id: 's2', signups: [{ id: 'g2', slotId: 's2', name: 'Eduardo Garay' }] },
    ],
    templates: [{ id: 't1', name: 'Guardias Santísimo — elección de horario' }],
    roles: [{ id: 'r1', name: 'superadmin' }],
  };
  maskNode(d);
  const flat = JSON.stringify(d);
  for (const real of ['Eduardo', 'Garay', '5512345678']) {
    assert.ok(!flat.includes(real), `sobrevivió: ${real}`);
  }
  // mismo nombre real → mismo fake (la misma persona en dos slots se ve igual)
  assert.equal(d.slots[0].signups[0].name, d.slots[1].signups[0].name);
  assert.match(d.slots[0].signups[0].name, /^\S+ \S+$/);
  // los names NO-persona quedan intactos
  assert.equal(d.templates[0].name, 'Guardias Santísimo — elección de horario');
  assert.equal(d.roles[0].name, 'superadmin');
});

test('maskNode: el teléfono falso NO puede ser el número de alguien', async () => {
  const { maskNode } = await import('./demo-lib.mjs');
  // Números con forma real de entrada (celular CDMX, con lada 52, y de Guadalajara).
  const entradas = ['5549442834', '+52 55 7979 7705', '3321677397'];
  const salidas = [];
  for (const cellPhone of entradas) {
    const n = { id: cellPhone, cellPhone };
    maskNode(n);
    salidas.push(n.cellPhone);
  }
  for (const out of salidas) {
    // 10 dígitos: hay vistas que sólo pintan el botón de WhatsApp con 10.
    assert.equal(out.replace(/\D/g, '').length, 10, `10 dígitos: ${out}`);
    // Bloque de abonado que empieza con 00 → no asignable en México.
    assert.match(out, /^5500\d{6}$/, `no asignable: ${out}`);
  }
  // No devuelve el número de entrada, y distingue personas.
  assert.equal(salidas.filter((s, i) => s === entradas[i]).length, 0);
  assert.equal(new Set(salidas).size, salidas.length);
});

test('anchorTimelineToCaptions: each clip starts at its own subtitle change despite uneven drift', async () => {
  const { anchorTimelineToCaptions } = await import('./demo-lib.mjs');
  // Wall offsets (s) and subtitle changes detected in the offline-mode take of
  // 2026-10-20: on time until going offline, then ~10% long. 77.72 is a dialog
  // dimming the page before its subtitle; 163.28 the dialog closing.
  const wall = [2.5, 10.2, 56.2, 63.5, 71.3, 76.3, 145.5, 153.1, 160.0];
  const changes = [0.04, 0.72, 2.68, 10.36, 56.84, 64.96, 73.72, 77.72, 79.16, 156.28, 163.28, 164.04, 170.96];
  const timeline = wall.map((s, i) => ({ id: `b${i}`, offsetMs: s * 1000, file: `b${i}.wav` }));
  const anchored = anchorTimelineToCaptions(timeline, changes, { fallbackScale: 1.07 });
  assert.deepEqual(anchored.map((t) => t.offsetMs / 1000), [2.68, 10.36, 56.84, 64.96, 73.72, 79.16, 156.28, 164.04, 170.96]);
  assert.ok(anchored.every((t) => t.anchored && t.file));
});

test('anchorTimelineToCaptions: a beat with no detected change keeps the previous drift', async () => {
  const { anchorTimelineToCaptions } = await import('./demo-lib.mjs');
  const timeline = [{ id: 'a', offsetMs: 2000 }, { id: 'b', offsetMs: 10000 }, { id: 'c', offsetMs: 20000 }];
  const anchored = anchorTimelineToCaptions(timeline, [2.1, 21.0], { fallbackScale: 1.05 });
  assert.equal(anchored[0].offsetMs, 2100);
  assert.equal(anchored[1].anchored, false);
  assert.equal(anchored[1].offsetMs, Math.round((2.1 + 8 * 1.05) * 1000));
  assert.equal(anchored[2].offsetMs, 21000);
});
