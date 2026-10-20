import { test, expect, type Page } from '@playwright/test';
import { loginAs, withCsrf, E2E_USERS, type AuthSession } from './helpers/auth';

/**
 * E2E del sidebar: sección Favoritos (M3) + regresión del acordeón (M2).
 *
 * - Favoritos: se siembra el perfil por PUT (my-communities + retreat-dashboard),
 *   la sección fija arriba renderiza las copias en pin order, clic en una copia
 *   navega, la estrella de una fila REAL quita/repone el pin y el cambio
 *   sobrevive un reload (PUT real, no solo estado local). afterAll restaura el
 *   perfil capturado en beforeAll.
 * - Acordeón: abrir una sección colapsa la que estaba abierta (regresión del
 *   cherry-pick fec75d89 — antes una sección sin clave en el record guardado
 *   quedaba abierta para siempre).
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
 * The star of a REAL row: the anchor whose data-menu-item-index is >= 0
 * (favorites copies carry -1) and the sibling button next to it.
 */
function realRowStar(page: Page, label: string) {
	const anchor = page
		.locator(`a[data-menu-item-index]:not([data-menu-item-index="-1"])`, {
			hasText: label,
		})
		.first();
	return anchor.locator('xpath=following-sibling::button[@data-testid="favorite-star"]');
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

	test('clic en una copia navega a esa vista', async ({ page }) => {
		await openApp(page);

		await page
			.locator('[data-testid="sidebar-favorites"] a[data-menu-item-index="-1"]', {
				hasText: 'Mis Comunidades',
			})
			.click();
		await page.waitForURL(/communit/i, { timeout: 10000 });
	});

	test('la estrella quita y repone el pin, y el cambio sobrevive un reload', async ({ page }) => {
		await openApp(page);

		// The real row lives inside its collapsible section, and the accordion
		// seeds collapsed — open it first, like a user would.
		const communityToggle = page.locator('button[aria-controls="section-community"]');
		await communityToggle.click();
		await expect(communityToggle).toHaveAttribute('aria-expanded', 'true');

		// Unpin from the real row (the favorites copies have no star).
		const star = realRowStar(page, 'Mis Comunidades');
		await expect(star).toHaveAttribute('aria-pressed', 'true');
		await star.click();

		const favoritesCopies = page.locator(
			'[data-testid="sidebar-favorites"] a[data-menu-item-index="-1"]',
			{ hasText: 'Mis Comunidades' },
		);
		await expect(favoritesCopies).toHaveCount(0);
		await expect(star).toHaveAttribute('aria-pressed', 'false');

		// The PUT is real: the pin stays gone after a reload.
		await page.reload();
		await expect(page.locator('[data-testid="sidebar-favorites"]')).toBeVisible();
		await expect(
			page.locator('[data-testid="sidebar-favorites"] a[data-menu-item-index="-1"]', {
				hasText: 'Mis Comunidades',
			}),
		).toHaveCount(0);

		// Pin it back and verify it survives too. The accordion keeps the
		// community section open across reloads (uiStore persistence).
		await expect(
			page.locator('button[aria-controls="section-community"]'),
		).toHaveAttribute('aria-expanded', 'true');
		const starAfterReload = realRowStar(page, 'Mis Comunidades');
		await starAfterReload.click();
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
