import { test, expect, type APIRequestContext, type Page } from '@playwright/test';

/**
 * E2E coverage for the couples-retreat public registration (retreat_type='couples').
 *
 * A couples retreat registers BOTH spouses in a single submission, so the flow
 * differs from the individual wizard in ways worth pinning down end to end:
 *
 *  - The registration route dispatches to the couple wizard only for couples
 *    retreats; every other retreat keeps the untouched individual wizard.
 *  - Personal and health data are captured per spouse; address, emergency
 *    contacts and inviter are captured once and copied to both.
 *  - Spouses may share one email address (the individual flow forbids a repeat).
 *  - The payload posts to /participants/couple/new with husband + wife together.
 *
 * Everything runs with `?test=true` (dry-run): the API validates and writes
 * nothing, so the spec never creates participants in the dev database.
 *
 * Needs a public couples retreat; override with E2E_COUPLES_RETREAT_ID. The spec
 * skips with a readable reason when the retreat is missing or not of type
 * 'couples', so it stays green on a database without one.
 */

// The asserted copy is the Spanish UI: Playwright defaults to en-US and the app
// follows navigator.language when nothing is stored.
test.use({ locale: 'es-MX' });

const COUPLES_RETREAT_ID =
	process.env.E2E_COUPLES_RETREAT_ID ?? 'e9b3c568-050a-4d66-a99d-305f287a59df';
const INDIVIDUAL_RETREAT_ID =
	process.env.E2E_RETREAT_ID ?? '96f06c40-327a-4513-ae48-fb4c60bbab17';

const SHARED_EMAIL = 'qa.pareja@example.com';

type PublicRetreat = { id: string; isPublic: boolean; retreat_type?: string | null };

async function fetchPublicRetreat(
	request: APIRequestContext,
	id: string,
): Promise<PublicRetreat | null> {
	const response = await request.get(`/api/retreats/public/${id}`);
	if (!response.ok()) return null;
	return response.json();
}

async function openCoupleRegistration(page: Page) {
	await page.addInitScript(() => localStorage.setItem('preferred-locale', 'es'));
	// A stale draft from a previous run would pre-fill the wizard and mask a
	// regression in the "fresh form" assertions.
	await page.addInitScript(() => {
		for (const key of Object.keys(localStorage)) {
			if (key.startsWith('registration-draft:couple:')) localStorage.removeItem(key);
		}
	});
	await page.goto(`/register/walker/${COUPLES_RETREAT_ID}?test=true`);
	await expect(page.getByText('Registro de pareja')).toBeVisible();
}

const clickNext = (page: Page) => page.getByTestId('couple-next').click();

/** Fills one Step1PersonalInfo instance (used for each spouse). */
async function fillPersonal(
	page: Page,
	data: { firstName: string; lastName: string; birthDate: string; cellPhone: string },
) {
	await expect(page.locator('#firstName')).toBeVisible();
	await page.locator('#firstName').fill(data.firstName);
	await page.locator('#lastName').fill(data.lastName);
	await page.locator('#nickname').fill(data.firstName);
	await page.locator('#birthDate').fill(data.birthDate);
	await page.locator('#cellPhone').fill(data.cellPhone);
	await page.locator('#email').fill(SHARED_EMAIL);
	await page.locator('#occupation').fill('QA');
	await page.getByRole('button', { name: /Acepto el aviso de privacidad/i }).click();
}

/** Answers "No" to every health toggle of the step currently on screen. */
async function answerHealthNo(page: Page) {
	const noButtons = page.getByRole('button', { name: 'No', exact: true });
	await expect(noButtons.first()).toBeVisible();
	// count() does not auto-wait: the assertion above guarantees the step mounted.
	const total = await noButtons.count();
	for (let i = 0; i < total; i++) await noButtons.nth(i).click();
}

async function fillAddress(page: Page) {
	await expect(page.locator('#street')).toBeVisible();
	await page.locator('#street').fill('Av. Universidad');
	await page.locator('#houseNumber').fill('100');
	await page.locator('#postalCode').fill('03100');
	await page.locator('#neighborhood').fill('Del Valle');
}

async function fillEmergency(page: Page) {
	await expect(page.locator('#emergencyContact1Name')).toBeVisible();
	await page.locator('#emergencyContact1Name').fill('Contacto Uno');
	await page.locator('#emergencyContact1Relation').fill('Hermano');
	await page.locator('#emergencyContact1CellPhone').fill('5587654321');
	await page.locator('#emergencyContact1Email').fill('contacto1@example.com');
	await page.locator('#emergencyContact2Name').fill('Contacto Dos');
	await page.locator('#emergencyContact2Relation').fill('Amiga');
	await page.locator('#emergencyContact2CellPhone').fill('5511223344');
	await page.locator('#emergencyContact2Email').fill('contacto2@example.com');
}

/** Drives the wizard from step 1 to the summary. */
async function fillWizardToSummary(page: Page) {
	await fillPersonal(page, {
		firstName: 'Ernesto',
		lastName: 'QA Pareja',
		birthDate: '1978-03-15',
		cellPhone: '5511122233',
	});
	await clickNext(page);

	// getByRole('heading'): el rótulo del paso también aparece en la barra de
	// progreso, así que un getByText plano matchea dos nodos.
	await expect(page.getByRole('heading', { name: 'Datos de ella' })).toBeVisible();
	await fillPersonal(page, {
		firstName: 'Lucía',
		lastName: 'QA Pareja',
		birthDate: '1980-07-22',
		cellPhone: '5544455566',
	});
	await clickNext(page);

	await fillAddress(page);
	await clickNext(page);

	await answerHealthNo(page); // él
	await clickNext(page);
	await answerHealthNo(page); // ella
	await clickNext(page);

	await fillEmergency(page);
	await clickNext(page);

	// Tallas: un select por cónyuge.
	await expect(page.getByRole('heading', { name: 'Tallas de playera' })).toBeVisible();
	const selects = page.getByRole('combobox');
	await selects.nth(0).click();
	await page.getByRole('option').first().click();
	await selects.nth(1).click();
	await page.getByRole('option').first().click();
	await clickNext(page);

	await expect(page.getByTestId('couple-submit')).toBeVisible();
}

test.describe('Registro de pareja (retiro de matrimonios)', () => {
	test.beforeEach(async ({ request }) => {
		const retreat = await fetchPublicRetreat(request, COUPLES_RETREAT_ID);
		test.skip(
			!retreat?.isPublic || retreat?.retreat_type !== 'couples',
			`Retreat ${COUPLES_RETREAT_ID} is not a public couples retreat`,
		);
	});

	test('la ruta pública monta el asistente de pareja', async ({ page }) => {
		await openCoupleRegistration(page);
		// Marca del wizard de pareja: primer paso rotulado como datos de él.
		await expect(page.getByRole('heading', { name: 'Datos de él' })).toBeVisible();
		await expect(page.getByText('1 / 8')).toBeVisible();
	});

	test('un retiro que no es de parejas conserva el asistente individual', async ({
		page,
		request,
	}) => {
		const retreat = await fetchPublicRetreat(request, INDIVIDUAL_RETREAT_ID);
		test.skip(
			!retreat?.isPublic || retreat?.retreat_type === 'couples',
			`Retreat ${INDIVIDUAL_RETREAT_ID} is not a public non-couples retreat`,
		);

		await page.addInitScript(() => localStorage.setItem('preferred-locale', 'es'));
		await page.goto(`/register/walker/${INDIVIDUAL_RETREAT_ID}?test=true`);
		// El wizard individual abre por diálogo, no como página de pareja.
		await expect(page.getByRole('button', { name: /Regístrate Ahora/i })).toBeVisible();
		await expect(page.getByText('Registro de pareja')).toHaveCount(0);
	});

	test('captura datos por cónyuge y comparte dirección y contactos', async ({ page }) => {
		await openCoupleRegistration(page);

		await fillPersonal(page, {
			firstName: 'Ernesto',
			lastName: 'QA Pareja',
			birthDate: '1978-03-15',
			cellPhone: '5511122233',
		});
		await clickNext(page);

		// El segundo paso es de ella y pre-llena lo que un matrimonio suele compartir.
		await expect(page.getByRole('heading', { name: 'Datos de ella' })).toBeVisible();
		await expect(page.locator('#email')).toHaveValue(SHARED_EMAIL);
		await expect(page.locator('#lastName')).toHaveValue('QA Pareja');
		// …pero el nombre queda vacío: es de la persona, no de la pareja.
		await expect(page.locator('#firstName')).toHaveValue('');

		await fillPersonal(page, {
			firstName: 'Lucía',
			lastName: 'QA Pareja',
			birthDate: '1980-07-22',
			cellPhone: '5544455566',
		});
		await clickNext(page);

		// La dirección se pide UNA sola vez para los dos.
		await expect(page.getByText('La dirección se registra una sola vez')).toBeVisible();
	});

	test('el asistente no avanza con el primer paso vacío', async ({ page }) => {
		await openCoupleRegistration(page);
		await clickNext(page);
		// Sigue en el paso 1: sin datos no hay avance.
		await expect(page.getByText('1 / 8')).toBeVisible();
		await expect(page.getByRole('heading', { name: 'Datos de él' })).toBeVisible();
	});

	test('envía un solo payload con ambos cónyuges y correo compartido', async ({ page }) => {
		await openCoupleRegistration(page);
		await fillWizardToSummary(page);

		const postRequest = page.waitForRequest(
			(r) => r.url().includes('/participants/couple/new') && r.method() === 'POST',
		);
		await page.getByTestId('couple-submit').click();
		const body = (await postRequest).postDataJSON();

		// Guard: el spec nunca escribe en la base.
		expect(body.dryRun).toBe(true);

		expect(body.retreatId).toBe(COUPLES_RETREAT_ID);
		expect(body.type).toBe('walker');
		expect(body.acceptedPrivacyNotice).toBe(true);

		// Un submit lleva a los dos cónyuges.
		expect(body.husband.firstName).toBe('Ernesto');
		expect(body.wife.firstName).toBe('Lucía');

		// Correo compartido: lo que el flujo individual rechazaría por duplicado.
		expect(body.husband.email).toBe(SHARED_EMAIL);
		expect(body.wife.email).toBe(SHARED_EMAIL);

		// Los datos compartidos viajan copiados en ambos.
		expect(body.husband.street).toBe('Av. Universidad');
		expect(body.wife.street).toBe('Av. Universidad');
		expect(body.husband.emergencyContact1Name).toBe('Contacto Uno');
		expect(body.wife.emergencyContact1Name).toBe('Contacto Uno');
	});

	test('el dry-run del API acepta la pareja con correo compartido', async ({ page }) => {
		await openCoupleRegistration(page);
		await fillWizardToSummary(page);

		const postResponse = page.waitForResponse(
			(r) => r.url().includes('/participants/couple/new') && r.request().method() === 'POST',
		);
		await page.getByTestId('couple-submit').click();
		const response = await postResponse;

		expect(response.status()).toBe(200);
		expect(await response.json()).toMatchObject({ valid: true });
	});
});
