// Compositor de miniaturas de YouTube (1280×720) para el canal Emaús Retiros.
// Híbrido: fondo IA (nano banana, escena SIN texto) + texto exacto por CSS con
// Playwright. Efímero — el skill youtube-publishing documenta recrearlo si falta.
//
//   BG=output/thumb-prep-bg.png OUT=output/thumb-prep.png \
//   TITLE="Preparaciones" TITLE_SIZE=104 CHIPS="Reuniones de servidores·Charlas y objetivos·Enlace público" \
//   node e2e/demo/_compose-thumb.mjs
//
// Marca fija: brand "✝ Emaús Retiros" arriba-derecha + regla morada + chips morados abajo-izq.
// Fondos embebidos como data-URI base64 (para que carguen en setContent). Scrim para legibilidad.

import pw from '@playwright/test';
const { chromium } = pw;
import { readFileSync } from 'node:fs';
import path from 'node:path';

const BG = process.env.BG || 'output/thumb-prep-bg.png';
const OUT = process.env.OUT || 'output/thumb-prep.png';
const TITLE = process.env.TITLE || 'Preparaciones';
const TITLE_SIZE = parseInt(process.env.TITLE_SIZE || '104', 10);
const CHIPS = (process.env.CHIPS || '').split('·').map((s) => s.trim()).filter(Boolean);

const bgData = readFileSync(path.resolve(BG)).toString('base64');
const chipsHtml = CHIPS.map((c) => `<span class="chip">${c}</span>`).join('');

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: 1280px; height: 720px; }
  .thumb {
    position: relative; width: 1280px; height: 720px; overflow: hidden;
    font-family: Georgia, 'Times New Roman', serif;
  }
  .thumb img.bg {
    position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover;
  }
  /* Scrim: oscurece la izquierda para el título; degrada a transparente a la derecha. */
  .scrim {
    position: absolute; inset: 0;
    background: linear-gradient(100deg, rgba(30,10,50,0.86) 0%, rgba(40,15,64,0.66) 42%, rgba(40,15,64,0.12) 72%, rgba(40,15,64,0) 100%);
  }
  .brand {
    position: absolute; top: 40px; right: 48px; text-align: right; color: #fff;
    font-size: 34px; font-weight: 700; letter-spacing: 0.5px;
    text-shadow: 0 2px 8px rgba(0,0,0,0.5);
  }
  .brand .rule {
    margin-top: 10px; height: 5px; width: 190px; margin-left: auto;
    background: #a855f7; border-radius: 3px;
  }
  .title {
    position: absolute; left: 64px; top: 200px; max-width: 720px; color: #fff;
    font-size: ${TITLE_SIZE}px; font-weight: 700; line-height: 1.04;
    text-shadow: 0 3px 16px rgba(0,0,0,0.55);
  }
  .title .bar {
    width: 120px; height: 8px; background: #a855f7; border-radius: 4px; margin-bottom: 26px;
  }
  .chips {
    position: absolute; left: 66px; bottom: 54px; display: flex; gap: 14px; flex-wrap: wrap;
    max-width: 900px;
  }
  .chip {
    background: rgba(124,58,237,0.92); color: #fff; font-size: 24px; font-weight: 600;
    padding: 10px 20px; border-radius: 999px; box-shadow: 0 2px 10px rgba(0,0,0,0.35);
    font-family: -apple-system, system-ui, sans-serif;
  }
</style></head><body>
  <div class="thumb">
    <img class="bg" src="data:image/png;base64,${bgData}" />
    <div class="scrim"></div>
    <div class="brand">✝ Emaús Retiros<div class="rule"></div></div>
    <div class="title"><div class="bar"></div>${TITLE}</div>
    <div class="chips">${chipsHtml}</div>
  </div>
</body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
await page.setContent(html, { waitUntil: 'networkidle' });
await page.locator('.thumb').screenshot({ path: path.resolve(OUT) });
await browser.close();
console.log('✅', OUT);
