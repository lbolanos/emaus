// Genera una imagen de comprobante de transferencia (sintética) para el demo.
// Efímero: escribe output/comprobante-ejemplo.png.
import pw from '@playwright/test';
const { chromium } = pw;
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(here, 'output', 'comprobante-ejemplo.png');

const html = `<!doctype html><html><body style="margin:0">
<div style="width:640px;height:860px;background:#f4f5f7;font-family:Helvetica,Arial,sans-serif;padding:36px 40px;box-sizing:border-box">
  <div style="background:#fff;border-radius:14px;border:1px solid #e2e4e9;padding:30px 34px;height:100%;box-sizing:border-box">
    <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:2px solid #7c3aed;padding-bottom:14px">
      <div style="font-weight:800;font-size:22px;color:#312e81">Comprobante SPEI</div>
      <div style="color:#6b7280;font-size:13px">5 nov 2026 · 17:42</div>
    </div>
    <div style="margin-top:26px;font-size:15px;color:#374151;line-height:2.1">
      <div><b>Banco emisor:</b> Banorte</div>
      <div><b>Banco receptor:</b> BBVA</div>
      <div><b>Cuenta receptor:</b> •••• 4187</div>
      <div><b>Beneficiario:</b> Asoc. Emaús Del Valle</div>
      <div><b>Concepto:</b> Retiro Buen Despacho — Caminante</div>
      <div><b>Referencia:</b> SPEI-884213</div>
    </div>
    <div style="margin-top:34px;background:#eef7ee;border:1px solid #bfe3bf;border-radius:12px;padding:18px 22px;display:flex;justify-content:space-between;align-items:center">
      <div style="color:#1f6f3c;font-weight:700;font-size:15px">Importe</div>
      <div style="color:#166534;font-weight:800;font-size:34px">$2,500.00 MXN</div>
    </div>
    <div style="margin-top:30px;text-align:center;color:#9ca3af;font-size:12px">
      Folio rastreo: BX-2026-11-05-884213 · Transacción concluida
    </div>
  </div>
</div>
</body></html>`;

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 640, height: 860 } });
await page.setContent(html);
await page.screenshot({ path: out });
await browser.close();
console.log('🖼️ ', out);
