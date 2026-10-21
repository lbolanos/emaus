import { test, expect, type Page, type APIRequestContext, type BrowserContext } from '@playwright/test';

/**
 * offline-mode D13 E2E (specs/offline-mode, CA 17): correcting a walker's record
 * without signal. Only the changed fields of the offline list travel, with the
 * values they had; the server applies them when the signal comes back, leaves
 * health untouched, and refuses (409) a field somebody else changed meanwhile.
 *
 * THIS SPEC WRITES TO THE DATABASE (parish and cell phone of one walker) and puts
 * them back at the end. It only runs with E2E_OFFLINE_WRITES=1 against a disposable
 * copy, on `vite preview` of a production build:
 *
 *   E2E_OFFLINE_WRITES=1 E2E_BASE_URL=http://localhost:4179 \
 *     npx playwright test tests/e2e/offline-edit.spec.ts --project=chromium
 */

test.use({ locale: 'es-MX', serviceWorkers: 'allow' });

const RETREAT_ID = process.env.E2E_RETREAT_ID || 'e9b3c568-050a-4d66-a99d-305f287a59df';
const USER = {
	email: process.env.E2E_LOCAL_EMAIL || 'leonardo.bolanos@gmail.com',
	password: process.env.E2E_LOCAL_PASSWORD || '123456',
};
const HEALTH = ['medicationDetails', 'dietaryRestrictionsDetails', 'disabilitySupport', 'emergencyContact1Name', 'emergencyContact1CellPhone'];
// 5500 + 6 digits: a 10-digit Mexican number that is nobody's (not assignable).
const OFFLINE_PHONE = '5500112233';
const SOMEONE_ELSES_PHONE = '5500445566';
const OFFLINE_PARISH = 'Parroquia corregida sin señal';

async function login(page: Page): Promise<string | null> {
	await page.addInitScript((rid) => {
		localStorage.setItem('preferred-locale', 'es');
		localStorage.setItem('selectedRetreatId', rid);
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
	await page.waitForFunction(() => navigator.serviceWorker?.controller != null, null, { timeout: 60000 });
	return null;
}

/** API calls with the browser's session, outside the page (never offline). */
function serverApi(context: BrowserContext) {
	const req: APIRequestContext = context.request;
	const csrf = async () => (await (await req.get('/api/csrf-token')).json()).csrfToken as string;
	return {
		get: async (path: string) => (await req.get(`/api${path}`)).json(),
		put: async (path: string, data: unknown) => {
			const response = await req.put(`/api${path}`, { data, headers: { 'x-csrf-token': await csrf() } });
			if (!response.ok()) throw new Error(`PUT ${path} → ${response.status()}`);
		},
	};
}

const chip = (page: Page) => page.getByTestId('connectivity-chip');

async function openRecord(page: Page, lastName: string) {
	const search = page.locator('input[placeholder="Buscar..."]').first();
	await expect(search).toBeVisible({ timeout: 30000 });
	await search.fill(lastName);
	await page.getByRole('button', { name: 'Editar Participante' }).first().click();
	await expect(page.locator('#parish')).toBeVisible({ timeout: 10000 });
}

test('a record corrected without signal reaches the server field by field, and never overwrites someone else', async ({
	page,
	context,
	request,
}) => {
	test.setTimeout(300_000);
	test.skip(process.env.E2E_OFFLINE_WRITES !== '1', 'writes to the database: run only against a disposable copy with E2E_OFFLINE_WRITES=1');
	const sw = await request.get('/sw.js');
	test.skip(!(await sw.text()).includes('workbox'), 'needs a production build served by vite preview');
	const loginSkip = await login(page);
	test.skip(loginSkip !== null, loginSkip ?? '');

	const api = serverApi(context);
	const retreat = await api.get(`/retreats/${RETREAT_ID}`);
	// Inside the retreat (its saved data is not purged); a flowing clock.
	await context.clock.setSystemTime(new Date(Date.parse(retreat.startDate) + 32.5 * 3600 * 1000));
	const people = (await api.get(`/participants?retreatId=${RETREAT_ID}`)) as any[];
	const walker =
		people.find((p) => p.type === 'walker' && !p.isCancelled && p.medicationDetails && p.cellPhone) ??
		people.find((p) => p.type === 'walker' && !p.isCancelled && p.cellPhone);
	test.skip(!walker, 'needs an active walker with a cell phone');
	const before = await api.get(`/participants/${walker.id}?retreatId=${RETREAT_ID}`);
	page.on('dialog', (dialog) => void dialog.accept());

	try {
		await test.step('with signal: the walker list is on the phone', async () => {
			await page.goto('/app/walkers', { waitUntil: 'networkidle' });
			await expect(page.locator('input[placeholder="Buscar..."]').first()).toBeVisible({ timeout: 30000 });
		});

		await test.step('no signal: parish and cell phone are saved on the phone', async () => {
			await context.setOffline(true);
			await page.reload();
			await openRecord(page, walker.lastName);
			await expect(page.getByTestId('offline-edit-notice')).toBeVisible();
			await page.locator('#parish').fill(OFFLINE_PARISH);
			await page.locator('#cellPhone').fill(OFFLINE_PHONE);
			await page.getByRole('button', { name: 'Guardar' }).last().click();
			await expect(page.locator('#parish')).toBeHidden({ timeout: 10000 });
			await expect(chip(page)).toHaveAttribute('data-pending', '1', { timeout: 15000 });
		});

		await test.step('a reload without signal still shows the correction', async () => {
			await page.reload();
			await openRecord(page, walker.lastName);
			await expect(page.locator('#parish')).toHaveValue(OFFLINE_PARISH);
			await expect(page.locator('#cellPhone')).toHaveValue(OFFLINE_PHONE);
			await page.getByRole('button', { name: 'Cancelar' }).last().click();
		});

		await test.step('signal back: the server has those two fields, health untouched', async () => {
			await context.setOffline(false);
			await expect(chip(page)).toHaveAttribute('data-pending', '0', { timeout: 90000 });
			await expect(chip(page)).toHaveAttribute('data-conflicts', '0');
			const after = await api.get(`/participants/${walker.id}?retreatId=${RETREAT_ID}`);
			expect(after.parish).toBe(OFFLINE_PARISH);
			expect(after.cellPhone).toBe(OFFLINE_PHONE);
			for (const field of HEALTH) expect(after[field] ?? null, field).toEqual(before[field] ?? null);
			expect(after.email).toBe(before.email);
			expect(after.firstName).toBe(before.firstName);
		});

		await test.step('someone else changed the phone meanwhile: refused with the reason, theirs stays', async () => {
			await api.put(`/participants/${walker.id}`, { cellPhone: SOMEONE_ELSES_PHONE, contextRetreatId: RETREAT_ID });
			await context.setOffline(true);
			await page.reload();
			await openRecord(page, walker.lastName);
			await page.locator('#cellPhone').fill('5500778899');
			await page.getByRole('button', { name: 'Guardar' }).last().click();
			await expect(chip(page)).toHaveAttribute('data-pending', '1', { timeout: 15000 });

			await context.setOffline(false);
			await expect(chip(page)).toHaveAttribute('data-conflicts', '1', { timeout: 90000 });
			await chip(page).click();
			const row = page.getByTestId('pending-op');
			await expect(row).toContainText('celular');
			await row.getByRole('button', { name: 'Descartar' }).click();
			await expect(chip(page)).toHaveAttribute('data-conflicts', '0');

			const after = await api.get(`/participants/${walker.id}?retreatId=${RETREAT_ID}`);
			expect(after.cellPhone, 'the other person’s change was not overwritten').toBe(SOMEONE_ELSES_PHONE);
		});
	} finally {
		await context.setOffline(false).catch(() => {});
		await api.put(`/participants/${walker.id}`, {
			parish: before.parish ?? null,
			cellPhone: before.cellPhone,
			contextRetreatId: RETREAT_ID,
		});
		const restored = await api.get(`/participants/${walker.id}?retreatId=${RETREAT_ID}`);
		expect(restored.parish ?? null, 'parish restored').toEqual(before.parish ?? null);
		expect(restored.cellPhone, 'cell phone restored').toBe(before.cellPhone);
	}
});
