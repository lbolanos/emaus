import { test, expect, type Page, type APIRequestContext, type BrowserContext } from '@playwright/test';

/**
 * offline-mode E2E (specs/offline-mode, "Imprimir sin conexión"): at the retreat
 * house the team prints the badges, the table sheets and the minuto a minuto
 * without signal, from what "Preparar" saved and nothing else.
 *
 * Runs against `vite preview` of a production build (the service worker serves
 * the app and the badge logos offline); it skips itself on the dev server:
 *
 *   E2E_BASE_URL=http://localhost:4179 npx playwright test tests/e2e/offline-print.spec.ts --project=chromium
 *
 * Writes nothing: logs in, prepares the phone, goes offline and prints. The
 * print dialog is stubbed; the table sheets open in a popup that is read.
 */

test.use({ locale: 'es-MX', serviceWorkers: 'allow' });

const RETREAT_ID = process.env.E2E_RETREAT_ID || 'e9b3c568-050a-4d66-a99d-305f287a59df';
const USER = {
	email: process.env.E2E_LOCAL_EMAIL || 'leonardo.bolanos@gmail.com',
	password: process.env.E2E_LOCAL_PASSWORD || '123456',
};
const BADGE_LOGOS = ['/man_logo.png', '/woman_logo.png', '/crossRoseButtT.png'];
const TABLE_SHEETS = [
	'Imprimir Mesas',
	'Imprimir Mesas (Simple)',
	'Imprimir Contactos (Teléfono/Email)',
	'Imprimir Contactos (Hoja para Cada Participante)',
	'Verificación de Datos (Caminantes)',
];

async function skipReason(request: APIRequestContext): Promise<string | null> {
	const sw = await request.get('/sw.js');
	if (!sw.ok() || !(await sw.text()).includes('workbox')) {
		return 'needs a production build served by vite preview: this server has no service worker';
	}
	return null;
}

async function login(page: Page): Promise<string | null> {
	await page.addInitScript((rid) => {
		localStorage.setItem('preferred-locale', 'es');
		localStorage.setItem('selectedRetreatId', rid);
		(window as any).__printCalls = 0;
		window.print = () => {
			(window as any).__printCalls += 1;
		};
	}, RETREAT_ID);
	await page.goto('/login');
	await page.locator('input[type="email"]').fill(USER.email);
	await page.locator('input[type="password"]').fill(USER.password);
	const loginResponse = page.waitForResponse(
		(r) => r.url().includes('/api/auth/login') && r.request().method() === 'POST',
		{ timeout: 30000 },
	);
	await page.getByRole('button', { name: 'Iniciar Sesión' }).click();
	const response = await loginResponse;
	if (!response.ok()) return `login rejected with ${response.status()} for ${USER.email}`;
	await page.waitForURL(/\/app/, { timeout: 30000 });
	return null;
}

const printCalls = (page: Page) => page.evaluate(() => (window as any).__printCalls as number);
const brokenImages = (page: Page) =>
	page.evaluate(() => [...document.images].filter((i) => !(i.complete && i.naturalWidth > 0)).map((i) => i.src));

/** Opens the ⋮ menu of the tables board and its "Imprimir" submenu; returns the item. */
async function tablesMenuItem(page: Page, name: string | RegExp) {
	const item =
		typeof name === 'string'
			? page.getByRole('menuitem', { name, exact: true })
			: page.getByRole('menuitem', { name });
	for (let attempt = 1; attempt <= 3; attempt++) {
		await page.keyboard.press('Escape');
		await page.locator('main button[aria-haspopup="menu"]:visible').last().click();
		const submenu = page.getByRole('menuitem', { name: /^\s*Imprimir\s*$/ });
		await submenu.focus();
		await submenu.press('ArrowRight');
		if (await item.first().isVisible({ timeout: 2000 }).catch(() => false)) return item.first();
	}
	throw new Error(`menu item not found: ${name}`);
}

async function readPopup(context: BrowserContext, open: () => Promise<void>): Promise<string> {
	const [popup] = await Promise.all([context.waitForEvent('page', { timeout: 10000 }), open()]);
	await popup.waitForLoadState('load');
	const text = await popup.evaluate(() => document.body.innerText);
	await popup.close();
	return text;
}

test('without signal, after only "Preparar", badges, tables and minuto a minuto print complete', async ({
	page,
	context,
	request,
}) => {
	test.setTimeout(240_000);
	const skip = await skipReason(request);
	test.skip(skip !== null, skip ?? '');
	const loginSkip = await login(page);
	test.skip(loginSkip !== null, loginSkip ?? '');

	// Wednesday before the retreat (not live yet: nothing downloads by itself),
	// then Saturday morning without signal. setSystemTime, not setFixedTime: with
	// a frozen clock reka's menu items fire a second, synthetic click.
	const retreat = await (await context.request.get(`/api/retreats/${RETREAT_ID}`)).json();
	const localMidnight = Date.parse(retreat.startDate) + 6 * 3600 * 1000;
	await context.clock.setSystemTime(new Date(localMidnight - 28 * 3600 * 1000));

	await test.step('with signal: prepare the phone and nothing else', async () => {
		await page.goto(`/app/retreats/${RETREAT_ID}/dashboard`, { waitUntil: 'networkidle' });
		await page.waitForFunction(() => navigator.serviceWorker?.controller != null, null, { timeout: 60000 });
		await page.getByTestId('offline-prepare-button').click();
		await expect(page.getByTestId('offline-prepare-status')).toContainText('Descargado', { timeout: 60000 });
		for (const logo of BADGE_LOGOS) {
			const saved = await page.evaluate((u) => caches.match(u, { ignoreSearch: true }).then(Boolean), logo);
			expect(saved, `${logo} is in the service worker precache`).toBe(true);
		}
	});

	await context.setOffline(true);
	await context.clock.setSystemTime(new Date(localMidnight + 32.5 * 3600 * 1000));

	await test.step('badges: printed with their logos; the DOCX export says it needs connection', async () => {
		await page.goto('/app/walker-badges');
		await expect(page.locator('.badge-item').first()).toBeVisible({ timeout: 30000 });
		await page.locator('main button[aria-haspopup="menu"]:visible').last().click();
		const docx = page.getByRole('menuitem', { name: /Exportar DOCX/ });
		await expect(docx).toHaveAttribute('data-disabled', '');
		await expect(docx).toContainText('Necesita conexión');
		const before = await printCalls(page);
		await page.getByRole('menuitem', { name: /^\s*Imprimir Gafetes\s*$/ }).click();
		await expect.poll(() => printCalls(page)).toBe(before + 1);
		expect(await brokenImages(page), 'no broken logo on the printed badges').toEqual([]);
	});

	await test.step('minuto a minuto: printed from the saved copy', async () => {
		await page.goto(`/app/retreats/${RETREAT_ID}/minuto-a-minuto`);
		await expect(page.locator('[id^="schedule-item-"]').first()).toBeVisible({ timeout: 30000 });
		const before = await printCalls(page);
		await page.locator('main button[aria-haspopup="menu"]:visible').last().click();
		await page.getByRole('menuitem', { name: /Imprimir/ }).first().click();
		await expect.poll(() => printCalls(page)).toBe(before + 1);
	});

	await test.step('tables: every sheet prints; health says where it is instead of "—"', async () => {
		await page.goto('/app/tables');
		await expect(page.getByText(/Mesa\s+\d/).first()).toBeVisible({ timeout: 30000 });

		for (const sheet of TABLE_SHEETS) {
			const item = await tablesMenuItem(page, sheet);
			const text = await readPopup(context, () => item.click());
			expect(text, `${sheet} has the tables`).toMatch(/Mesa\s+\d/);
			if (sheet === 'Imprimir Mesas') {
				expect(text).toContain('Impreso sin conexión');
				expect(text).toContain('Solo con conexión');
				expect(text, 'no medication detail can come from the phone').not.toContain('💊');
			}
		}

		const cards = await tablesMenuItem(page, 'Tarjetas de los Caminantes');
		await cards.click();
		const dialog = page.locator('div.fixed.inset-0').filter({ hasText: 'Tarjetas de los Caminantes' }).last();
		const cardsText = await readPopup(context, () => dialog.getByRole('button', { name: /^\s*Imprimir\s*$/ }).click());
		expect(cardsText.trim().length, 'the walker cards have content').toBeGreaterThan(0);

		await page.goto('/app/tables');
		await expect(page.getByText(/Mesa\s+\d/).first()).toBeVisible({ timeout: 30000 });
		const word = await tablesMenuItem(page, /Descargar Mesas \(Word\)/);
		await expect(word).toHaveAttribute('data-disabled', '');
		await expect(word).toContainText('Necesita conexión');
	});
});
