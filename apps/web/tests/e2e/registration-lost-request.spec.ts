import { test, expect, type Page, type Route } from '@playwright/test';

/**
 * E2E coverage for a confirmation request that never gets an answer.
 *
 * On 2026-09-08 someone confirmed their registration from an iPhone, saw
 * "An unexpected error occurred" and went to finish it on a computer. The server
 * had no trace of it — no 4xx, no 5xx, not a line in the access log — because
 * the request never arrived: the tab had been open for 70 minutes and iOS
 * Safari kills the connection of a suspended tab.
 *
 * Two things here can only be proven in a real browser, which is why this is an
 * e2e and not a unit test:
 *
 *  - the retry actually leaves the browser, twice, with a real pause between,
 *  - the failure report leaves as a beacon (unit tests mock the service away).
 *
 * Nothing is ever written: every confirmation request is intercepted — aborted
 * or answered by Playwright — so the API never receives one. The report to
 * `/telemetry/public/client-error` is the only request that does reach the
 * server, and it only writes a line to the API log.
 *
 * Needs a public retreat that still accepts registrations. Defaults to the one
 * seeded in the dev database; override with E2E_RETREAT_ID.
 */

// The copy asserted below is the Spanish UI: Playwright starts in en-US and the
// app follows navigator.language when nothing is stored.
test.use({ locale: 'es-MX' });

const RETREAT_ID = process.env.E2E_RETREAT_ID ?? 'e9b3c568-050a-4d66-a99d-305f287a59df';
const REGISTRATION_URL = `/register/server/${RETREAT_ID}?test=true`;

const CONFIRM_PATH = '/participants/confirm-registration';
const REPORT_PATH = '/telemetry/public/client-error';

/** The delay the view waits before the second attempt, minus jitter margin. */
const RETRY_DELAY_FLOOR_MS = 700;

test.beforeAll(async ({ request }) => {
	const response = await request.get(`/api/retreats/public/${RETREAT_ID}`);
	test.skip(
		!response.ok(),
		`El retiro ${RETREAT_ID} no existe en esta base (E2E_RETREAT_ID para apuntar a otro).`,
	);
	const retreat = await response.json();
	test.skip(
		retreat?.isRegistrationClosed === true,
		`El retiro ${RETREAT_ID} ya no acepta registros, así que la pantalla de identidad no se abre.`,
	);
});

/**
 * Opens the identity screen without depending on who is in the database.
 *
 * The lookup is answered by Playwright on purpose: this spec is about what
 * happens to the confirmation request, and tying it to a real participant would
 * make it red on any other database — and put someone's name in the trace.
 */
async function openIdentityScreen(page: Page) {
	await page.addInitScript(() => localStorage.setItem('preferred-locale', 'es'));
	await page.route('**/participants/check-email/**', (route) =>
		route.fulfill({
			status: 200,
			contentType: 'application/json',
			body: JSON.stringify({
				exists: true,
				firstName: 'Prueba',
				lastName: 'E2E',
				registeredInRetreat: false,
			}),
		}),
	);
	await page.goto(REGISTRATION_URL);
	await page.getByRole('button', { name: /Regístrate Ahora/i }).click();
	await page.getByPlaceholder(/@/).fill('prueba.e2e@example.com');
	await page.getByRole('button', { name: /^Buscar$/ }).click();
	// The negative assertions below are only meaningful once this screen is up.
	await expect(page.getByRole('button', { name: /Sí, soy yo/i })).toBeVisible();
}

/** Counts the confirmation attempts that leave the browser, and their timing. */
function trackAttempts(page: Page, baseURL: string | undefined) {
	const at: number[] = [];
	page.on('request', (r) => {
		// Filtered by origin: in dev, Vite serves source files under their own
		// path, so a bare substring can match the app's own modules.
		if (baseURL && !r.url().startsWith(baseURL)) return;
		if (r.url().includes(CONFIRM_PATH)) at.push(Date.now());
	});
	return at;
}

/**
 * Captures what the page hands to `sendBeacon`. Playwright cannot read the body
 * of a beacon (it travels as a Blob), so the function is wrapped in the page.
 */
async function captureBeacons(page: Page) {
	// El reporte se corta en la red a propósito: una corrida de este spec no debe
	// dejar líneas [CLIENT ERROR] en el entorno al que apunte, porque son
	// indistinguibles de un fallo real y ensuciarían la próxima investigación.
	// Lo que se afirma —que el navegador lo manda y con qué cuerpo— se captura
	// igual, envolviendo sendBeacon antes de que salga.
	await page.route(`**${REPORT_PATH}`, (route) => route.abort());
	await page.evaluate(() => {
		(window as any).__beacons = [];
		const original = navigator.sendBeacon.bind(navigator);
		navigator.sendBeacon = (url: string | URL, data?: BodyInit | null) => {
			if (data && typeof (data as Blob).text === 'function') {
				(data as Blob).text().then((body) => (window as any).__beacons.push({ url: String(url), body }));
			}
			return original(url, data as BodyInit);
		};
	});
}

const readBeacons = (page: Page) =>
	page.evaluate(() => ((window as any).__beacons ?? []) as Array<{ url: string; body: string }>);

/** Answers the second attempt with `response`, after losing the first one. */
const loseFirstThen = (response: { status: number; body: unknown }) => {
	let seen = 0;
	return (route: Route) => {
		seen += 1;
		return seen === 1
			? route.abort('connectionfailed')
			: route.fulfill({
					status: response.status,
					contentType: 'application/json',
					body: JSON.stringify(response.body),
				});
	};
};

/**
 * The copy inside a toast. reka-ui also announces the same text in an
 * aria-hidden span for screen readers, so a bare getByText matches twice and
 * Playwright fails with a strict mode violation that says nothing about the app.
 */
const toast = (page: Page, copy: RegExp) => page.locator('li').filter({ hasText: copy });

test.describe('Confirmar identidad cuando la petición se pierde', () => {
	test('reintenta una vez, lo explica en español y lo reporta', async ({ page, baseURL }) => {
		const attempts = trackAttempts(page, baseURL);
		await openIdentityScreen(page);
		await captureBeacons(page);
		await page.route(`**${CONFIRM_PATH}`, (route) => route.abort('connectionfailed'));

		await page.getByRole('button', { name: /Sí, soy yo/i }).click();

		await expect(toast(page, /Se perdió la conexión/i)).toBeVisible({ timeout: 15000 });
		expect(attempts).toHaveLength(2);
		expect(attempts[1] - attempts[0]).toBeGreaterThanOrEqual(RETRY_DELAY_FLOOR_MS);
		// The English fallback is what sent someone to a computer.
		await expect(page.getByText('An unexpected error occurred')).toHaveCount(0);
		// And the screen stays put, so the person can try again.
		await expect(page.getByRole('button', { name: /Sí, soy yo/i })).toBeVisible();

		await expect.poll(async () => (await readBeacons(page)).length, { timeout: 10000 }).toBe(1);
		const [report] = await readBeacons(page);
		expect(report.url).toContain(REPORT_PATH);
		expect(JSON.parse(report.body)).toMatchObject({
			context: 'confirm-registration',
			retried: true,
		});
		// The report carries no personal data: it is a diagnostic channel.
		expect(report.body).not.toContain('@');
	});

	test('el segundo intento entra y da por registrada a la persona', async ({ page, baseURL }) => {
		const attempts = trackAttempts(page, baseURL);
		await openIdentityScreen(page);
		await page.route(
			`**${CONFIRM_PATH}`,
			loseFirstThen({ status: 200, body: { success: true, firstName: 'Prueba', lastName: 'E2E' } }),
		);

		await page.getByRole('button', { name: /Sí, soy yo/i }).click();

		await expect(page.getByText(/Registro exitoso/i)).toBeVisible({ timeout: 15000 });
		expect(attempts).toHaveLength(2);
	});

	// If the first attempt did land and only the answer was lost, the second one
	// hits the double-registration guard. That is not announced as success: with
	// a shared email the row may belong to someone else, and telling the wrong
	// person they are registered sends them to a retreat with no bed.
	test('un 409 en el reintento se cuenta como "ya estabas registrado", no como éxito', async ({ page }) => {
		await openIdentityScreen(page);
		await page.route(
			`**${CONFIRM_PATH}`,
			loseFirstThen({
				status: 409,
				body: { message: 'Este correo ya está registrado en este retiro como servidor.' },
			}),
		);

		await page.getByRole('button', { name: /Sí, soy yo/i }).click();

		await expect(toast(page, /Ya estabas registrado/i)).toBeVisible({ timeout: 15000 });
		await expect(toast(page, /ya está registrado en este retiro/i)).toBeVisible();
		await expect(toast(page, /Registro exitoso/i)).toHaveCount(0);
	});

	test('un rechazo del API con motivo no se reintenta ni se reporta', async ({ page, baseURL }) => {
		const attempts = trackAttempts(page, baseURL);
		await openIdentityScreen(page);
		await captureBeacons(page);
		await page.route(`**${CONFIRM_PATH}`, (route) =>
			route.fulfill({
				status: 400,
				contentType: 'application/json',
				body: JSON.stringify({ message: 'Este retiro ya terminó y no acepta nuevos registros.' }),
			}),
		);

		await page.getByRole('button', { name: /Sí, soy yo/i }).click();

		await expect(toast(page, /ya terminó y no acepta/i)).toBeVisible({ timeout: 15000 });
		expect(attempts).toHaveLength(1);
		// Its reason is already in the server log; the [CLIENT ERROR] channel is
		// worth what it holds, and it should hold only what nobody else saw.
		expect(await readBeacons(page)).toHaveLength(0);
	});
});
