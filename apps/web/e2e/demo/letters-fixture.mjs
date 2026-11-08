// Fixture del video de cartas: activa buzones del retiro Santa Clara y siembra
// cartas de ejemplo por el webhook (remitentes ficticios, sin PII real).
//
//   cd apps/web && DEMO_BASE_URL=http://localhost:5176 node e2e/demo/letters-fixture.mjs
//
// Requiere el dev del worktree arriba y LETTER_WEBHOOK_SECRET en apps/api/.env.
// Los assets (fotos/PDF/Word) viven en e2e/demo/output/ (gitignoreado).
import pw from '@playwright/test';
const { chromium } = pw;
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { DEMO_DIR } from './demo-lib.mjs';

const F = path.join(DEMO_DIR, 'output');
const JPG = readFileSync(path.join(F, 'comprobante.b64'), 'utf8').trim(); // azul
const JPG2 = readFileSync(path.join(F, 'comprobante2.b64'), 'utf8').trim(); // naranja
const PDF = readFileSync(path.join(F, 'carta.pdf')).toString('base64');
const DOCX = readFileSync(path.join(F, 'carta-de-la-tia.docx')).toString('base64');

const BASE = process.env.DEMO_BASE_URL || 'http://localhost:5176';
const RETREAT = process.env.RETREAT_ID || 'ac694780-1a2a-41ea-ba25-1646d22a1dd5'; // Santa Clara (dummy)
const WEBHOOK_SECRET = process.env.LETTER_WEBHOOK_SECRET || 'dev-local-webhook-secret';

const browser = await chromium.launch();
const page = await (await browser.newContext({ locale: 'es-MX' })).newPage();
await page.goto(`${BASE}/login`);
await page.locator('input[type="email"]').fill(process.env.DEMO_EMAIL || 'leonardo.bolanos@gmail.com');
await page.locator('input[type="password"]').fill(process.env.DEMO_PASSWORD || '123456');
await page.getByRole('button', { name: 'Iniciar Sesión' }).click();
await page.waitForURL(/\/app\//, { timeout: 20000 });
const csrf = await page.evaluate(async () => {
	const r = await fetch('/api/csrf-token', { credentials: 'include' });
	const b = await r.json();
	return b.csrfToken ?? r.headers.get('x-csrf-token');
});
const call = (pathTo, init) =>
	page.evaluate(
		async ([p, i, token]) => {
			const r = await fetch(`/api${p}`, {
				credentials: 'include',
				...i,
				headers: { ...(i?.headers ?? {}), 'X-CSRF-Token': token },
			});
			if (!r.ok) throw new Error(`${r.status} ${(await r.text()).slice(0, 200)}`);
			return r.json();
		},
		[pathTo, init, csrf],
	);

await call(`/letters/retreats/${RETREAT}/letters/mailbox/activate`, { method: 'POST' });
const { mailboxes } = await call(`/letters/retreats/${RETREAT}/letters/mailbox`);
const walkers = (mailboxes ?? []).filter((m) => m.participantType === 'walker' && m.mailboxCode);
console.log(`buzones activos: ${walkers.length}`);
const w1 = walkers[0];
const w2 = walkers[1] ?? walkers[0];

const seeds = [
	{
		from: 'maria.gonzalez@ejemplo.com', fromName: 'María González', walker: w1,
		subject: 'Para ti, mi hijo',
		text: 'Hola mi niño: solo escribirte para decirte que estaremos pensando en ti estos días. Descansa, come bien y disfruta todo. La abuela también manda saludos.',
		attachments: [{ fileName: 'foto-de-la-familia.jpg', mimeType: 'image/jpeg', contentBase64: JPG }],
	},
	{
		from: 'lupe.lopez@ejemplo.com', fromName: 'Lupe López', walker: w1,
		subject: 'Dos cartas para ti',
		text: 'Jorge: tu tía Lupe y yo te mandamos unas cartas para que las leas cuando quieras. Nos vemos cuando regreses.',
		attachments: [
			{ fileName: 'carta-para-jorge.pdf', mimeType: 'application/pdf', contentBase64: PDF },
			{ fileName: 'carta-de-la-tía.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', contentBase64: DOCX },
		],
	},
	{
		from: 'familia.ramirez@ejemplo.com', fromName: 'Familia Ramírez', walker: w1,
		subject: 'Carta y comprobante',
		text: 'Aquí te mandamos la carta de la familia y el comprobante de tu pago del retiro. Te queremos.',
		attachments: [
			{ fileName: 'carta-de-la-familia.jpg', mimeType: 'image/jpeg', contentBase64: JPG },
			{ fileName: 'comprobante-del-banco.jpg', mimeType: 'image/jpeg', contentBase64: JPG2 },
		],
	},
	{
		from: 'carlos.herrera@ejemplo.com', fromName: 'Carlos Herrera', walker: w2 ?? w1,
		subject: 'Pensando en ti',
		text: 'Amigo: sabremos de ti cuando vuelvas. Todo va a salir muy bien.',
		attachments: [],
	},
	{
		from: 'ana.ruiz@ejemplo.com', fromName: 'Ana Ruiz', walker: w2 ?? w1,
		subject: 'Saludos y bendiciones',
		text: 'Que Dios te acompañe estos tres días. Te esperamos de vuelta con muchas ganas.',
		attachments: [{ fileName: 'saludos.jpg', mimeType: 'image/jpeg', contentBase64: JPG2 }],
	},
];

let ok = 0;
for (const s of seeds) {
	const to = `carta.${s.walker.mailboxCode}@emaus.cc`;
	const r = await page.request.post(`${BASE}/api/letters/webhook`, {
		headers: { 'X-Emaus-Letter-Secret': WEBHOOK_SECRET, 'Content-Type': 'application/json' },
		data: {
			messageId: `<demo-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@mail.ejemplo.com>`,
			from: s.from, fromName: s.fromName, to, subject: s.subject, text: s.text,
			attachments: s.attachments,
		},
	});
	const b = await r.json().catch(() => ({}));
	console.log(`${r.ok() && b.status === 'accepted' ? 'seed ok ' : 'seed FAIL'} · ${s.fromName} → ${s.walker.participantName}`);
	if (r.ok() && b.status === 'accepted') ok += 1;
}
const list = await call(`/letters/retreats/${RETREAT}/letters`);
console.log(`cartas en la bandeja: ${list.letters.length} · sembradas: ${ok}/${seeds.length}`);
await browser.close();
process.exit(ok === seeds.length ? 0 : 1);
