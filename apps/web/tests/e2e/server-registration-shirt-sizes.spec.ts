import { test, expect, type APIRequestContext, type Page } from '@playwright/test';

/**
 * E2E coverage for shirt sizes in the public server registration flow.
 *
 * A server reported (2026-08-20) that after picking sizes for the shirts and the
 * jacket, the last step told him nothing had been selected: the summary was reading
 * the legacy needsWhiteShirt/needsBlueShirt/needsJacket fields instead of the
 * per-retreat shirt types the step-5 selects actually fill.
 *
 * These tests drive the real dialog against the running dev stack and cover:
 *
 *  - Step 5 lists every shirt type the retreat marks as optional for servers.
 *  - The step-6 summary shows the chosen size under each type's own name, and
 *    "No necesita" only where the server left the select alone.
 *  - The legacy labels never show up again.
 *  - The submitted payload carries `shirtSizes`, so the choice reaches the API.
 *
 * The flow always runs with `?test=true` (dry-run): the API validates the payload
 * and writes nothing, so the spec never creates participants in the dev database.
 *
 * Requires a public retreat with at least two shirt types available to servers.
 * Defaults to the Celaya retreat seeded in the dev database; override with
 * E2E_RETREAT_ID.
 */

type ShirtType = {
	id: string;
	name: string;
	optionalForServers: boolean;
	sortOrder: number;
};

// The dialog copy asserted below is the Spanish UI, so pin the locale: Playwright
// defaults to en-US and the app follows navigator.language when nothing is stored.
test.use({ locale: 'es-MX' });

const RETREAT_ID = process.env.E2E_RETREAT_ID ?? '96f06c40-327a-4513-ae48-fb4c60bbab17';
const REGISTRATION_URL = `/register/server/${RETREAT_ID}?test=true`;

const LEGACY_SHIRT_LABELS = [
	'Talla de camisa blanca',
	'Talla de camisa azul',
	'Talla de chaqueta',
];

async function fetchServerShirtTypes(request: APIRequestContext): Promise<ShirtType[]> {
	const response = await request.get(`/api/retreats/public/${RETREAT_ID}`);
	if (!response.ok()) return [];
	const retreat = await response.json();
	const types: ShirtType[] = retreat?.shirtTypes ?? [];
	return types
		.filter((t) => t.optionalForServers)
		.sort((a, b) => a.sortOrder - b.sortOrder);
}

/** Opens the dialog and skips the "already served before?" email lookup. */
async function openNewServerRegistration(page: Page) {
	await page.addInitScript(() => localStorage.setItem('preferred-locale', 'es'));
	await page.goto(REGISTRATION_URL);
	await page.getByRole('button', { name: /Regístrate Ahora/i }).click();
	await page.getByRole('button', { name: /Registrarme como nuevo/i }).click();
	await expect(page.locator('#firstName')).toBeVisible();
}

const clickNext = (page: Page) => page.getByRole('button', { name: /^Siguiente$/ }).click();

/**
 * Fills steps 1-4 with the minimum a server needs and lands on step 5.
 *
 * Each step waits for a field of the next one before typing: the wizard swaps
 * steps behind a transition, and `count()` does not auto-wait — counting the
 * health toggles too early silently skips them and the wizard refuses to advance.
 */
async function fillStepsUntilServerInfo(page: Page) {
	await page.locator('#firstName').fill('QA');
	await page.locator('#lastName').fill('Tallas Servidor');
	await page.locator('#nickname').fill('QA');
	await page.locator('#birthDate').fill('1985-04-10');
	await page.getByRole('combobox').first().click();
	await page.getByRole('option').first().click();
	await page.locator('#cellPhone').fill('4771234567');
	await page.locator('#email').fill('qa.shirt.sizes@example.com');
	await page.locator('#occupation').fill('QA');
	await page.getByRole('button', { name: /Acepto el aviso de privacidad/i }).click();
	await clickNext(page);

	await expect(page.locator('#street')).toBeVisible();
	await page.locator('#street').fill('Av. Juárez');
	await page.locator('#houseNumber').fill('123');
	await page.locator('#postalCode').fill('38000');
	await page.locator('#neighborhood').fill('Centro');
	await clickNext(page);

	// Health step: answer "No" to snoring, medication, diet and disability.
	const noButtons = page.getByRole('button', { name: 'No', exact: true });
	await expect(noButtons.first()).toBeVisible();
	const total = await noButtons.count();
	for (let i = 0; i < total; i++) await noButtons.nth(i).click();
	await clickNext(page);

	// Emergency contact is optional for servers.
	await expect(page.locator('#emergencyContact1Name')).toBeVisible();
	await clickNext(page);

	await expect(page.getByText('Registrar como angelito')).toBeVisible();
}

/** Advances from step 5 to the summary and waits for it to render. */
async function goToSummary(page: Page) {
	await clickNext(page);
	await expect(page.getByText('Por favor, revise su información')).toBeVisible();
}

async function pickSize(page: Page, shirtTypeId: string, size: string) {
	await page.locator(`#shirt-${shirtTypeId}`).click();
	await page.getByRole('option', { name: size, exact: true }).click();
}

/** Reads the summary row for a label as `[label, value]`. */
async function summaryRow(page: Page, label: string): Promise<string> {
	const row = page.locator('div', { hasText: new RegExp(`^${label}`) });
	return (await row.last().innerText()).trim();
}

test.describe('Server registration — shirt sizes', () => {
	test('step 5 offers every shirt type the retreat opens to servers', async ({ page, request }) => {
		const shirtTypes = await fetchServerShirtTypes(request);
		test.skip(shirtTypes.length === 0, `Retreat ${RETREAT_ID} has no shirt types for servers`);

		await openNewServerRegistration(page);
		await fillStepsUntilServerInfo(page);

		for (const type of shirtTypes) {
			await expect(page.locator(`#shirt-${type.id}`)).toBeVisible();
		}
	});

	test('summary shows the chosen size under each shirt type name', async ({ page, request }) => {
		const shirtTypes = await fetchServerShirtTypes(request);
		test.skip(shirtTypes.length < 2, `Retreat ${RETREAT_ID} needs 2+ shirt types for servers`);

		const [picked, ...untouched] = shirtTypes;
		const lastPicked = shirtTypes[shirtTypes.length - 1];

		await openNewServerRegistration(page);
		await fillStepsUntilServerInfo(page);
		await pickSize(page, picked.id, 'M');
		await pickSize(page, lastPicked.id, 'X');
		await goToSummary(page);

		expect(await summaryRow(page, picked.name)).toContain('M');
		expect(await summaryRow(page, lastPicked.name)).toContain('X');

		// Types left alone say "No necesita" — and only those.
		for (const type of untouched.filter((t) => t.id !== lastPicked.id)) {
			expect(await summaryRow(page, type.name)).toContain('No necesita');
		}
	});

	test('summary never falls back to the legacy shirt fields', async ({ page, request }) => {
		const shirtTypes = await fetchServerShirtTypes(request);
		test.skip(shirtTypes.length === 0, `Retreat ${RETREAT_ID} has no shirt types for servers`);

		await openNewServerRegistration(page);
		await fillStepsUntilServerInfo(page);
		await pickSize(page, shirtTypes[0].id, 'M');
		await goToSummary(page);

		for (const label of LEGACY_SHIRT_LABELS) {
			await expect(page.getByText(label, { exact: false })).toHaveCount(0);
		}
	});

	test('submitted payload carries the chosen sizes', async ({ page, request }) => {
		const shirtTypes = await fetchServerShirtTypes(request);
		test.skip(shirtTypes.length < 2, `Retreat ${RETREAT_ID} needs 2+ shirt types for servers`);

		const first = shirtTypes[0];
		const last = shirtTypes[shirtTypes.length - 1];

		await openNewServerRegistration(page);
		await fillStepsUntilServerInfo(page);
		await pickSize(page, first.id, 'M');
		await pickSize(page, last.id, 'X');
		await goToSummary(page);

		const postRequest = page.waitForRequest(
			(r) => r.url().includes('/participants/new') && r.method() === 'POST',
		);
		await page.getByRole('button', { name: /^Enviar$/ }).click();
		const body = (await postRequest).postDataJSON();

		// Guard: the spec must never write to the database.
		expect(body.dryRun).toBe(true);
		expect(body.shirtSizes).toEqual([
			{ shirtTypeId: first.id, size: 'M' },
			{ shirtTypeId: last.id, size: 'X' },
		]);
	});
});
