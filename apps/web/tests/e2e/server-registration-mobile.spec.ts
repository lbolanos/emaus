import { test, expect, devices, type APIRequestContext, type Page } from '@playwright/test';

/**
 * E2E coverage for the public server registration on a phone.
 *
 * A server reported (2026-09-03) from his iPhone that the wizard "won't let me
 * pick a country and throws me back to the start". Three separate causes, all
 * reproduced here on an emulated iPhone 12 before the fix:
 *
 *  - Opening the address step downloaded 9 MB: `import('country-state-city')`
 *    pulls city.json (7.7 MB, ~150 000 cities) even though only the country list
 *    is needed. On mobile data the select sits disabled on "Cargando…", and the
 *    memory spike is enough for Safari to kill and reload the tab.
 *  - The country dropdown had no search box, so of the 250 countries only the 19
 *    that happened to fit on screen could be tapped.
 *  - When the tab reloads mid-registration the draft came back but the wizard
 *    restarted at step 1, which reads as having lost everything.
 *
 * The flow always runs with `?test=true` (dry-run): the API validates the payload
 * and writes nothing, so the spec never creates participants in the dev database.
 */

const iPhone = devices['iPhone 12'];

test.use({
	viewport: iPhone.viewport,
	userAgent: iPhone.userAgent,
	deviceScaleFactor: iPhone.deviceScaleFactor,
	isMobile: iPhone.isMobile,
	hasTouch: iPhone.hasTouch,
	// The assertions below read the Spanish UI, so pin the locale: Playwright
	// defaults to en-US and the app follows navigator.language when nothing is stored.
	locale: 'es-MX',
});

// Firefox supports neither isMobile nor hasTouch, and this spec is about phones.
test.skip(
	({ browserName }) => browserName === 'firefox',
	'Firefox no emula touch ni viewport móvil',
);

/** Weight the address step may download. It used to be 9 MB. */
const ADDRESS_STEP_BUDGET_MB = 2;

async function resolveRetreatId(request: APIRequestContext): Promise<string | null> {
	if (process.env.E2E_RETREAT_ID) return process.env.E2E_RETREAT_ID;
	const response = await request.get('/api/retreats/public');
	if (!response.ok()) return null;
	const retreats = await response.json();
	return Array.isArray(retreats) && retreats.length ? retreats[0].id : null;
}

/** Opens the dialog and skips the "already served before?" email lookup. */
async function openNewServerRegistration(page: Page, retreatId: string) {
	await page.addInitScript(() => localStorage.setItem('preferred-locale', 'es'));
	await page.goto(`/register/server/${retreatId}?test=true`);
	await page.getByRole('button', { name: /Regístrate Ahora/i }).click();
	await page.getByRole('button', { name: /Registrarme como nuevo/i }).click();
	await expect(page.locator('#firstName')).toBeVisible();
}

const clickNext = (page: Page) => page.getByRole('button', { name: /^Siguiente$/ }).click();

async function fillPersonalInfo(page: Page, email = 'qa.movil@example.com') {
	await page.locator('#firstName').fill('QA');
	await page.locator('#lastName').fill('Servidor Móvil');
	await page.locator('#nickname').fill('QA');
	await page.locator('#birthDate').fill('1985-04-10');
	await page.getByRole('combobox').first().click();
	await page.getByRole('option').first().click();
	await page.locator('#cellPhone').fill('4771234567');
	await page.locator('#email').fill(email);
	await page.locator('#occupation').fill('QA');
	await page.getByRole('button', { name: /Acepto el aviso de privacidad/i }).click();
}

/** Picks an option from a SearchableSelect by typing into its search box. */
async function pickFromSearchableSelect(page: Page, triggerId: string, query: string, label: string) {
	await page.locator(`#${triggerId}`).click();
	const list = page.locator(`#${triggerId}-listbox`);
	await expect(list).toBeVisible();
	await page.locator(`#${triggerId}`).locator('..').getByPlaceholder('Buscar...').fill(query);
	await list.getByRole('option', { name: label, exact: true }).click();
	await expect(list).toBeHidden();
}

test.describe('Registro de servidor en el teléfono', () => {
	test('el paso de dirección ya no descarga el catálogo de ciudades', async ({ page, request }) => {
		const retreatId = await resolveRetreatId(request);
		test.skip(!retreatId, 'No hay un retiro público en esta base de datos');

		await openNewServerRegistration(page, retreatId!);
		await fillPersonalInfo(page);

		// Only same-origin traffic: reCAPTCHA and Google Maps are not ours to budget.
		const origin = new URL(page.url()).origin;
		let bytes = 0;
		const heavy: Array<{ url: string; mb: number }> = [];
		const onResponse = async (response: import('@playwright/test').Response) => {
			if (!response.url().startsWith(origin)) return;
			try {
				const size = (await response.body()).length;
				bytes += size;
				if (size > 1_000_000) heavy.push({ url: response.url(), mb: size / 1024 / 1024 });
			} catch {
				// Body already gone (redirects, aborted requests) — nothing to count.
			}
		};
		page.on('response', onResponse);

		await clickNext(page);
		await expect(page.locator('#street')).toBeVisible();
		await expect(page.locator('#country')).toBeEnabled();
		await expect(page.locator('#state')).toBeEnabled();
		// Let any late chunk land before closing the books.
		await page.waitForTimeout(1500);
		page.off('response', onResponse);

		const downloadedMb = bytes / 1024 / 1024;
		expect(
			downloadedMb,
			`El paso de dirección descargó ${downloadedMb.toFixed(2)} MB. ` +
				`Importar 'country-state-city' entero (en vez de lib/country y lib/state) ` +
				`vuelve a arrastrar los 7.7 MB de city.json.`,
		).toBeLessThan(ADDRESS_STEP_BUDGET_MB);
		expect(heavy, `Descargas de más de 1 MB: ${JSON.stringify(heavy)}`).toHaveLength(0);
	});

	test('se puede elegir un país que no cabe en la pantalla', async ({ page, request }) => {
		const retreatId = await resolveRetreatId(request);
		test.skip(!retreatId, 'No hay un retiro público en esta base de datos');

		await openNewServerRegistration(page, retreatId!);
		await fillPersonalInfo(page);
		await clickNext(page);
		await expect(page.locator('#street')).toBeVisible();

		// Country names come from the browser in the user's language.
		await expect(page.locator('#country')).toContainText('México');

		// Argentina sits far from México in the list: on a phone it was unreachable
		// before, because the dropdown had no search and no scroll buttons.
		await pickFromSearchableSelect(page, 'country', 'argentina', 'Argentina');
		await expect(page.locator('#country')).toContainText('Argentina');
		// Changing country clears the state, which must reload for the new country.
		await expect(page.locator('#state')).not.toContainText('Ciudad de México');
		await pickFromSearchableSelect(page, 'state', 'mendoza', 'Mendoza');
		await expect(page.locator('#state')).toContainText('Mendoza');

		// Search ignores accents: "mexico" has to find "México".
		await pickFromSearchableSelect(page, 'country', 'mexico', 'México');
		await expect(page.locator('#country')).toContainText('México');
	});

	test('Escape en el selector cierra la lista, no el registro entero', async ({ page, request }) => {
		const retreatId = await resolveRetreatId(request);
		test.skip(!retreatId, 'No hay un retiro público en esta base de datos');

		await openNewServerRegistration(page, retreatId!);
		await fillPersonalInfo(page);
		await clickNext(page);
		await expect(page.locator('#street')).toBeVisible();

		await page.locator('#country').click();
		await expect(page.locator('#country-listbox')).toBeVisible();
		await page.keyboard.press('Escape');

		await expect(page.locator('#country-listbox')).toBeHidden();
		await expect(page.getByRole('dialog')).toBeVisible();
		await expect(page.locator('#street')).toBeVisible();
	});

	test('si el navegador recarga la página, el registro sigue donde iba', async ({
		page,
		request,
	}) => {
		const retreatId = await resolveRetreatId(request);
		test.skip(!retreatId, 'No hay un retiro público en esta base de datos');

		await openNewServerRegistration(page, retreatId!);
		await fillPersonalInfo(page);
		await clickNext(page);
		await expect(page.locator('#street')).toBeVisible();
		await page.locator('#street').fill('Av. Juárez');

		// Safari on iOS reloads the tab by itself when memory runs short.
		await page.reload();
		await page.getByRole('button', { name: /Regístrate Ahora/i }).click();
		await page.getByRole('button', { name: /Registrarme como nuevo/i }).click();

		await expect(page.locator('#street')).toBeVisible();
		await expect(page.locator('#street')).toHaveValue('Av. Juárez');
		await expect(page.getByRole('dialog')).toContainText('2 / 6');
	});

	test('registro completo de servidor desde el teléfono', async ({ page, request }) => {
		const retreatId = await resolveRetreatId(request);
		test.skip(!retreatId, 'No hay un retiro público en esta base de datos');

		await openNewServerRegistration(page, retreatId!);
		await fillPersonalInfo(page, 'qa.movil.completo@example.com');
		await clickNext(page);

		await expect(page.locator('#street')).toBeVisible();
		await page.locator('#city').fill('Celaya');
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
		await clickNext(page);

		await expect(page.getByText('Por favor, revise su información')).toBeVisible();
		const postRequest = page.waitForRequest(
			(r) => r.url().includes('/participants/new') && r.method() === 'POST',
		);
		await page.getByRole('button', { name: /^Enviar$/ }).click();
		const body = (await postRequest).postDataJSON();

		// Guard: the spec must never write to the database.
		expect(body.dryRun).toBe(true);
		expect(body.country).toBe('MX');
		expect(body.city).toBe('Celaya');
		expect(body.street).toBe('Av. Juárez');
	});
});
