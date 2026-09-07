import { test, expect, devices, type Page, type Request } from '@playwright/test';

/**
 * Which third-party scripts each public page pulls into a phone, and when.
 *
 * Google Maps with the places library (~1.5 MB decoded) and reCAPTCHA (~0.8 MB)
 * used to be fetched on boot by every page, so the terms page and the privacy
 * notice paid for a map and a captcha they do not have. On an iPhone that
 * competes with the app's own bundle for parse time and memory — the same shape
 * of problem as the 7.7 MB city catalogue that made the address step unusable
 * (see `server-registration-mobile.spec.ts`).
 *
 * Why this asserts requests and not megabytes: in dev, Vite serves unbundled
 * modules, so a page weighs several times what it weighs in production, and the
 * browser cache makes the figure depend on test order. A megabyte budget would
 * be either meaningless or flaky. *Which* third party is requested, and after
 * which interaction, is identical in dev and production — and it is the actual
 * rule. The measured numbers live in the commit that introduced this spec.
 *
 * Run it against the dev server of THIS tree. With several worktrees up, pass
 * the port explicitly, or Playwright reuses whatever answers on 5173:
 *
 *   E2E_BASE_URL=http://localhost:5175 npx playwright test \
 *     tests/e2e/mobile-page-weight.spec.ts --project="Mobile Safari"
 */

const iPhone = devices['iPhone 12'];

test.use({
	viewport: iPhone.viewport,
	userAgent: iPhone.userAgent,
	deviceScaleFactor: iPhone.deviceScaleFactor,
	isMobile: iPhone.isMobile,
	hasTouch: iPhone.hasTouch,
	locale: 'es-MX',
});

test.skip(
	({ browserName }) => browserName === 'firefox',
	'Firefox no emula touch ni viewport móvil',
);

// `test.use({ locale })` no basta: la app recuerda el idioma elegido, y los
// textos que se buscan abajo están en español.
test.beforeEach(async ({ page }) => {
	await page.addInitScript(() => localStorage.setItem('preferred-locale', 'es'));
});

/**
 * Heavy third parties, matched on the request URL.
 *
 * Only ever applied to cross-origin requests: the app's own
 * `src/services/recaptcha.ts` matches the reCAPTCHA pattern in dev, where Vite
 * serves modules by their source path.
 */
const THIRD_PARTIES = {
	'Google Maps': /maps\.googleapis\.com/,
	reCAPTCHA: /recaptcha/,
};

/** Starts recording which heavy third parties the page requests. */
function watchThirdParties(page: Page, origin: string) {
	const seen = new Set<string>();
	const onRequest = (request: Request) => {
		const url = request.url();
		if (url.startsWith(origin)) return;
		for (const [name, pattern] of Object.entries(THIRD_PARTIES)) {
			if (pattern.test(url)) seen.add(name);
		}
	};
	page.on('request', onRequest);
	return {
		get requested() {
			return [...seen].sort();
		},
		stop: () => page.off('request', onRequest),
	};
}

/** Pages a visitor can open with no session and no form to submit. */
const READ_ONLY_PAGES = ['/terms', '/privacy'];

/**
 * Waits until the view has actually rendered.
 *
 * Every assertion here is negative ("nothing from Google was requested"), and a
 * negative assertion against a page that never mounted passes for the wrong
 * reason. This is the guard against that false green.
 */
async function waitForContent(page: Page) {
	await expect
		.poll(async () => (await page.locator('#app').innerText()).trim().length, {
			message: 'la vista no llegó a renderizar',
			timeout: 20000,
		})
		.toBeGreaterThan(120);
}

test.describe('Coste de carga en el teléfono', () => {
	for (const path of READ_ONLY_PAGES) {
		test(`${path} no carga mapas ni captcha`, async ({ page, baseURL }) => {
			const watcher = watchThirdParties(page, baseURL!);

			await page.goto(`${baseURL}${path}`, { waitUntil: 'load' });
			await waitForContent(page);
			// Third-party scripts are appended after boot; give them room to appear.
			await page.waitForTimeout(3000);
			watcher.stop();

			// Neither belongs on a page that is text with no form and no map.
			expect(watcher.requested).toEqual([]);
		});
	}

	test('el captcha se pide al enfocar un campo, no al abrir la página', async ({
		page,
		baseURL,
	}) => {
		const watcher = watchThirdParties(page, baseURL!);

		await page.goto(`${baseURL}/request-password-reset`, { waitUntil: 'load' });
		await waitForContent(page);
		await expect(page.locator('input').first()).toBeVisible();
		await page.waitForTimeout(2000);
		expect(watcher.requested, 'nada de Google antes de tocar el formulario').toEqual([]);

		// Focusing a field means a submit is seconds away: fetching the script now
		// means nobody waits for Google when they press the button.
		await page.locator('input').first().focus();
		await expect
			.poll(() => watcher.requested, { message: 'el captcha debe llegar al enfocar el campo' })
			.toContain('reCAPTCHA');
		watcher.stop();
	});

	test('la landing del registro de servidor no carga captcha hasta abrir el formulario', async ({
		page,
		baseURL,
		request,
	}) => {
		let retreatId = process.env.E2E_RETREAT_ID;
		if (!retreatId) {
			const response = await request.get('/api/retreats/public');
			const retreats = response.ok() ? await response.json() : [];
			retreatId = Array.isArray(retreats) && retreats.length ? retreats[0].id : undefined;
		}
		test.skip(!retreatId, 'No hay retiro público en esta base de datos');

		const watcher = watchThirdParties(page, baseURL!);
		await page.goto(`${baseURL}/register/server/${retreatId}?test=true`, { waitUntil: 'load' });
		// The button proves the landing rendered: without it the empty-list
		// assertion below would pass on a blank page.
		await expect(page.getByRole('button', { name: /Regístrate Ahora/i })).toBeVisible();
		await page.waitForTimeout(2500);
		expect(watcher.requested, 'la portada del registro es solo lectura').toEqual([]);

		// Opening the dialog moves focus into the email field, which is the same
		// signal as above — so by the time the visitor types, Google is on its way.
		await page.getByRole('button', { name: /Regístrate Ahora/i }).click();
		await expect
			.poll(() => watcher.requested, { message: 'el captcha debe llegar al abrir el formulario' })
			.toContain('reCAPTCHA');
		watcher.stop();
	});

	test('la pantalla que lleva mapa sí lo carga', async ({ page, baseURL }) => {
		const watcher = watchThirdParties(page, baseURL!);

		await page.goto(`${baseURL}/registrar-comunidad`, { waitUntil: 'load' });
		await waitForContent(page);

		// The counterpart of the assertions above: moving Maps out of the boot
		// path must not leave the screens that need it without a map.
		await expect
			.poll(() => watcher.requested, { message: 'esta pantalla sí necesita Maps' })
			.toContain('Google Maps');
		await expect(page.locator('.gm-style').first()).toBeVisible({ timeout: 20000 });
		watcher.stop();
	});
});
