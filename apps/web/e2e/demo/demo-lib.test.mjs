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
