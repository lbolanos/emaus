// Scratch: genera una foto "de familia" (canvas) → /tmp/emaus-demo-foto.jpg.b64
import pw from '@playwright/test';
const { chromium } = pw;
import { writeFileSync } from 'fs';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 640, height: 420 } });
const b64 = await page.evaluate(() => {
	const c = document.createElement('canvas');
	c.width = 640;
	c.height = 420;
	const ctx = c.getContext('2d');
	const sky = ctx.createLinearGradient(0, 0, 0, 300);
	sky.addColorStop(0, '#2b3a67');
	sky.addColorStop(0.6, '#c96f4a');
	sky.addColorStop(1, '#f2b46b');
	ctx.fillStyle = sky;
	ctx.fillRect(0, 0, 640, 300);
	ctx.fillStyle = '#f7f3e8';
	ctx.fillRect(0, 300, 640, 120);
	ctx.fillStyle = 'rgba(255,236,190,.95)';
	ctx.beginPath();
	ctx.arc(430, 215, 42, 0, Math.PI * 2);
	ctx.fill();
	ctx.fillStyle = '#1d2438';
	for (const [x, h, w] of [[210, 90, 26], [262, 62, 20], [300, 46, 16]]) {
		ctx.beginPath();
		ctx.arc(x, 300 - h, w / 2.6, 0, Math.PI * 2);
		ctx.fill();
		ctx.fillRect(x - w / 2, 300 - h + w / 3, w, h);
	}
	ctx.fillStyle = '#ffffff';
	ctx.font = 'italic 26px Georgia, serif';
	ctx.fillText('Te llevamos en la oración', 150, 385);
	return c.toDataURL('image/jpeg', 0.88).split(',')[1];
});
await browser.close();
writeFileSync('/tmp/emaus-demo-foto.jpg.b64', b64);
console.log('foto ok,', Math.round((b64.length * 3) / 4), 'bytes');
