import { test, expect, type Page } from '@playwright/test';
import { loginAs, withCsrf, E2E_USERS, type AuthSession } from './helpers/auth';

/**
 * E2E del sidebar: sección Favoritos (M3) + regresión del acordeón (M2).
 *
 * - Favoritos: se siembra el perfil por PUT (my-communities + retreat-dashboard),
 *   la sección fija arriba renderiza las copias en pin order, clic en una copia
 *   navega, el menú que se despliega al dejar el mouse ~1s sobre una fila REAL
 *   quita/repone el pin y el cambio sobrevive un reload (PUT real, no solo
 *   estado local). El toggle anuncia con un toast con deshacer (y sin recargar
 *   la página), y las sugerencias del popover traen su conteo de vistas.
 *   afterAll restaura el perfil capturado en beforeAll.
 * - Acordeón: abrir una sección colapsa la que estaba abierta (regresión del
 *   cherry-pick fec75d89 — antes una sección sin clave en el record guardado
 *   quedaba abierta para siempre) y pliega Favoritos, que a su vez pliega todo
 *   lo demás al expandirse (acordeón completo).
 *
 * Credenciales: los fixtures @test.local no existen en la DB del worktree, así
 * que depende de E2E_LOCAL_* (dev DB copiada del main). El skip se decide por
 * la respuesta de /auth/login, no por un timeout.
 */

test.describe.configure({ mode: 'serial' });
test.use({ locale: 'es-MX' });

const SEED = ['my-communities', 'retreat-dashboard'];

let auth: { session: AuthSession; creds: { email: string; password: string } } | null = null;
let originalFavorites: string[] | null = null;
let retreatId = '';

async function login(baseURL: string) {
	const local =
		process.env.E2E_LOCAL_EMAIL && process.env.E2E_LOCAL_PASSWORD
			? { email: process.env.E2E_LOCAL_EMAIL, password: process.env.E2E_LOCAL_PASSWORD }
			: null;
	let rateLimited = false;
	for (const creds of [E2E_USERS.superadmin, local]) {
		if (!creds) continue;
		try {
			const session = await loginAs(baseURL, creds);
			return { session, creds };
		} catch (err) {
			if (String(err).includes(': 429')) rateLimited = true;
		}
	}
	if (rateLimited) {
		throw new Error(
			'login rate-limited (429): wait for the 15-minute window and re-run — this is ' +
				'the test environment, not the code under test.',
		);
	}
	return null;
}

/** PUT that must land — a silent 404/400 here would fake a passing restore/seed. */
async function putFavorites(favs: string[]): Promise<void> {
	const res = await auth!.session.ctx.put('/api/social/profile', {
		headers: withCsrf(auth!.session.csrfToken),
		data: { favoriteMenuItems: favs },
	});
	expect(res.ok(), `PUT /social/profile: ${res.status()}`).toBeTruthy();
}

/** Login through the UI (the sidebar needs a browser session) and land on /app. */
async function openApp(page: Page): Promise<void> {
	await page.addInitScript((rid) => {
		localStorage.setItem('preferred-locale', 'es');
		if (rid) localStorage.setItem('selectedRetreatId', rid);
	}, retreatId);
	await page.goto('/login');
	await page.locator('input[type="email"]').fill(auth!.creds.email);
	await page.locator('input[type="password"]').fill(auth!.creds.password);
	await page.getByRole('button', { name: 'Iniciar Sesión' }).click();
	await page.waitForURL(/\/app/, { timeout: 20000 });
}

/**
 * The favorite menu of a REAL row: hovering its anchor ~1s unfolds the
 * toggle menu (favorites copies carry index -1). Returns the open menu.
 */
async function openRowMenu(page: Page, label: string) {
	const anchor = page
		.locator(`a[data-menu-item-index]:not([data-menu-item-index="-1"])`, {
			hasText: label,
		})
		.first();
	await anchor.hover();
	const menu = page.locator('[data-testid="favorite-item-menu"]');
	// The menu unfolds after a full second of dwell, not on entry.
	await expect(menu).toBeVisible({ timeout: 4000 });
	return menu;
}

test.beforeAll(async ({ baseURL }) => {
	auth = await login(baseURL!);
	test.skip(!auth, 'no usable credentials (seed the e2e users or set E2E_LOCAL_*)');

	const profileRes = await auth.session.ctx.get('/api/social/profile');
	expect(profileRes.ok(), `GET /social/profile: ${profileRes.status()}`).toBeTruthy();
	const profile = await profileRes.json();
	originalFavorites = Array.isArray(profile.favoriteMenuItems)
		? profile.favoriteMenuItems
		: null;

	// retreat-dashboard only renders with a selected retreat; any retreat works.
	const retreatsRes = await auth.session.ctx.get('/api/retreats');
	const retreats = await retreatsRes.json();
	const first = Array.isArray(retreats) ? retreats[0] : (retreats.data ?? [])[0];
	retreatId = first?.id ?? '';

	await putFavorites(SEED);
});

test.afterAll(async () => {
	if (!auth) return;
	// null (never seeded) is not expressible through the PUT schema; [] is the
	// exact state the API leaves after its first GET, so the restore converges
	// to the same behavior either way. putFavorites asserts res.ok() — a broken
	// restore fails the run instead of passing silently.
	await putFavorites(originalFavorites ?? []);
	await auth.session.dispose();
});

test.describe.serial('Sidebar — favoritos del menú', () => {
	test('la sección Favoritos renderiza el seed arriba, en pin order', async ({ page }) => {
		await openApp(page);

		const section = page.locator('[data-testid="sidebar-favorites"]');
		await expect(section).toBeVisible();
		await expect(section.getByText('Favoritos', { exact: true })).toBeVisible();

		const copies = section.locator('a[data-menu-item-index="-1"]');
		await expect(copies).toHaveCount(SEED.length);
		// Pin order, not menu order: in the menu the dashboard sits above
		// my-communities, but the seed pins my-communities first.
		await expect(copies.nth(0)).toHaveText(/Mis Comunidades/);
		await expect(copies.nth(1)).toHaveText(/Dashboard del Retiro/);
	});

	test('el header colapsa la sección y el colapso sobrevive un reload', async ({ page }) => {
		await openApp(page);

		const header = page.locator('button[aria-controls="section-favorites"]');
		await expect(header).toBeVisible();
		// Fresh context: the section starts expanded (default in uiStore).
		await expect(header).toHaveAttribute('aria-expanded', 'true');

		const copies = page.locator('[data-testid="sidebar-favorites"] a[data-menu-item-index="-1"]');
		await expect(copies).toHaveCount(SEED.length);

		await header.click();
		await expect(header).toHaveAttribute('aria-expanded', 'false');
		// Collapsed = the container clamps to max-h-0 + overflow-hidden. The
		// copies stay in the DOM with their own bounding box (Playwright would
		// report them "visible"), so assert on viewport intersection instead.
		await expect(copies.first()).not.toBeInViewport();

		// The collapse lives in localStorage (uiStore) — it survives reload.
		await page.reload();
		const headerAfterReload = page.locator('button[aria-controls="section-favorites"]');
		await expect(headerAfterReload).toHaveAttribute('aria-expanded', 'false');
		await expect(
			page
				.locator('[data-testid="sidebar-favorites"] a[data-menu-item-index="-1"]')
				.first(),
		).not.toBeInViewport();
	});

	test('favoritos entra al acordeón: una sección abierta a la vez, Favoritos incluido', async ({ page }) => {
		await openApp(page);

		const favoritesHeader = page.locator('button[aria-controls="section-favorites"]');
		const communityToggle = page.locator('button[aria-controls="section-community"]');
		// Fresh context: favorites starts expanded (default in uiStore).
		await expect(favoritesHeader).toHaveAttribute('aria-expanded', 'true');

		// Opening a menu section folds favorites.
		await communityToggle.click();
		await expect(communityToggle).toHaveAttribute('aria-expanded', 'true');
		await expect(favoritesHeader).toHaveAttribute('aria-expanded', 'false');

		// Re-expanding favorites folds the open section.
		await favoritesHeader.click();
		await expect(favoritesHeader).toHaveAttribute('aria-expanded', 'true');
		await expect(communityToggle).toHaveAttribute('aria-expanded', 'false');

		// The mutual exclusion survives a reload.
		await page.reload();
		await expect(favoritesHeader).toHaveAttribute('aria-expanded', 'true');
		await expect(communityToggle).toHaveAttribute('aria-expanded', 'false');
	});

	test('clic en una copia navega a esa vista', async ({ page }) => {
		await openApp(page);

		await page
			.locator('[data-testid="sidebar-favorites"] a[data-menu-item-index="-1"]', {
				hasText: 'Mis Comunidades',
			})
			.click();
		await page.waitForURL(/communit/i, { timeout: 10000 });
	});

	test('el menú por hover quita y repone el pin, y el cambio sobrevive un reload', async ({ page }) => {
		await openApp(page);

		// The real row lives inside its collapsible section, and the accordion
		// seeds collapsed — open it first, like a user would.
		const communityToggle = page.locator('button[aria-controls="section-community"]');
		await communityToggle.click();
		await expect(communityToggle).toHaveAttribute('aria-expanded', 'true');

		// Unpin from the real row's hover menu.
		const menu = await openRowMenu(page, 'Mis Comunidades');
		await menu.getByRole('menuitem', { name: 'Quitar de favoritos' }).click();

		const favoritesCopies = page.locator(
			'[data-testid="sidebar-favorites"] a[data-menu-item-index="-1"]',
			{ hasText: 'Mis Comunidades' },
		);
		await expect(favoritesCopies).toHaveCount(0);

		// The PUT is real: the pin stays gone after a reload.
		await page.reload();
		await expect(page.locator('[data-testid="sidebar-favorites"]')).toBeVisible();
		await expect(
			page.locator('[data-testid="sidebar-favorites"] a[data-menu-item-index="-1"]', {
				hasText: 'Mis Comunidades',
			}),
		).toHaveCount(0);

		// Pin it back from the same menu and verify it survives too. The
		// accordion keeps the community section open across reloads (uiStore
		// persistence).
		await expect(
			page.locator('button[aria-controls="section-community"]'),
		).toHaveAttribute('aria-expanded', 'true');
		const menuAfterReload = await openRowMenu(page, 'Mis Comunidades');
		await menuAfterReload.getByRole('menuitem', { name: 'Añadir a favoritos' }).click();

		// Opening the community section folded favorites (full accordion);
		// re-expand it to see the pinned copy.
		await page.locator('button[aria-controls="section-favorites"]').click();
		await expect(
			page.locator('[data-testid="sidebar-favorites"] a[data-menu-item-index="-1"]', {
				hasText: 'Mis Comunidades',
			}),
		).toBeVisible();
		await page.reload();
		await expect(
			page.locator('[data-testid="sidebar-favorites"] a[data-menu-item-index="-1"]', {
				hasText: 'Mis Comunidades',
			}),
		).toBeVisible();
	});

	test('el toggle anuncia con un toast con deshacer, sin recargar la página', async ({ page }) => {
		await openApp(page);

		// The altText regression forced a full page reload on every toggle, so
		// the toast never survived. A reload also wipes window state: the flag
		// still being true after the toggle is the tripwire for that bug.
		await page.evaluate(() => {
			(window as unknown as { __favoritesNoReload?: boolean }).__favoritesNoReload = true;
		});

		const communityToggle = page.locator('button[aria-controls="section-community"]');
		await communityToggle.click();
		await expect(communityToggle).toHaveAttribute('aria-expanded', 'true');

		// Unpin from the real row's hover menu: the toast confirms…
		const menu = await openRowMenu(page, 'Mis Comunidades');
		await menu.getByRole('menuitem', { name: 'Quitar de favoritos' }).click();
		// exact: the toast viewport's live region announces the same string as
		// its accessible name, so a loose getByText matches two elements.
		await expect(page.getByText('Quitado de favoritos', { exact: true })).toBeVisible();

		const noReload = await page.evaluate(
			() =>
				(window as unknown as { __favoritesNoReload?: boolean }).__favoritesNoReload ===
				true,
		);
		expect(noReload).toBe(true);

		// …and undo reverts the pin, announcing the resulting state.
		await page.getByRole('button', { name: 'Deshacer' }).click();
		await expect(page.getByText('Fijado en favoritos', { exact: true })).toBeVisible();

		// Opening the community section folded favorites (full accordion);
		// re-expand it to see the restored copy.
		await page.locator('button[aria-controls="section-favorites"]').click();
		await expect(
			page.locator('[data-testid="sidebar-favorites"] a[data-menu-item-index="-1"]', {
				hasText: 'Mis Comunidades',
			}),
		).toBeVisible();
	});

	test('el popover de sugerencias fija una vista frecuente con un clic', async ({ page }) => {
		await openApp(page);

		const section = page.locator('[data-testid="sidebar-favorites"]');
		await expect(section).toBeVisible();

		// The plus button exists while there are suggestions: with this seed at
		// least 3 defaults are unpinned, so it is always reachable.
		const trigger = page.locator('[data-testid="favorite-suggestions-trigger"]');
		await expect(trigger).toBeVisible();

		await trigger.click();
		const popover = page.locator('[data-testid="favorite-suggestions"]');
		await expect(popover).toBeVisible();
		await expect(popover.getByText('Sugerencias')).toBeVisible();

		// View counts ride along with each suggestion. They are telemetry
		// driven, so assert the format on whatever the top suggestion is
		// (one view renders "vista", many render "vistas").
		await expect(
			popover.locator('button[aria-label^="Fijar"]', { hasText: /\d[\d,.]*\s+vistas?$/ }).first(),
		).toBeVisible();

		// Suggestions are telemetry-driven, so pin the first one by its own
		// label instead of assuming a specific view. The label comes from the
		// inner span: the button's own innerText carries the view count too.
		const firstSuggestion = popover.locator('button[aria-label^="Fijar"]').first();
		const label = (await firstSuggestion.locator('span.truncate').innerText()).trim();
		expect(label).not.toBe('');

		await firstSuggestion.click();

		// Pinned now: the label shows up as a favorites copy at the bottom…
		await expect(
			section.locator('a[data-menu-item-index="-1"]', { hasText: label }),
		).toBeVisible();
		// …and it graduated out of the popover's own list.
		await expect(popover.locator('button', { hasText: label })).toHaveCount(0);

		// The PUT is real: the new pin survives a reload.
		await page.reload();
		await expect(
			page.locator('[data-testid="sidebar-favorites"] a[data-menu-item-index="-1"]', {
				hasText: label,
			}),
		).toBeVisible();
	});
});

test.describe.serial('Sidebar — regresión del acordeón', () => {
	test('abrir una sección colapsa la anterior', async ({ page }) => {
		await openApp(page);

		const community = page.locator('button[aria-controls="section-community"]');
		const social = page.locator('button[aria-controls="section-social"]');

		await community.click();
		await expect(community).toHaveAttribute('aria-expanded', 'true');

		await social.click();
		await expect(social).toHaveAttribute('aria-expanded', 'true');
		// The full accordion: opening one closes the other.
		await expect(community).toHaveAttribute('aria-expanded', 'false');
	});
});
