import { test, expect, type Page } from '@playwright/test';
import { loginAs, withCsrf, E2E_USERS, type AuthSession } from './helpers/auth';

/**
 * E2E del sidebar: regresión del acordeón (M2) y favoritos de retiro (M3).
 *
 *  - Acordeón: en un navegador limpio (localStorage vacío) todas las secciones
 *    se siembran colapsadas; abrir una sección debe cerrar la que estaba
 *    abierta. Es la regresión del bug reportado: secciones sin clave en el
 *    record viejo de localStorage quedaban abiertas y no se cerraban nunca.
 *  - Favoritos: la estrella persiste en el perfil (PUT /social/profile); tras
 *    recargar, los chips vienen del GET del perfil; un chip cambia el retiro
 *    seleccionado.
 *
 * Setup y aserciones por API (loginAs) + UI en español. Los retiros son los
 * reales de la base del worktree (solo lectura); el perfil del usuario es el
 * único estado mutado y se restaura en afterAll.
 */
test.use({ locale: 'es-MX' });

// Both tests share the logged-in user's PROFILE as state (the accordion test's
// afterAll restores it; the favorites test mutates it). With the repo's
// fullyParallel they land on different workers, and one worker's restore can
// race the other worker's favorites flow. Serial keeps them on one worker.
test.describe.configure({ mode: 'serial' });

/**
 * Logs in with whatever credentials this database has (seeded e2e users first,
 * then E2E_LOCAL_*). Returns the creds too — the UI login needs them. A 429
 * THROWS instead of skipping: a green skip would hide a burned rate-limit
 * window (same policy as sequences-inbox.spec.ts).
 */
async function login(
	baseURL: string,
): Promise<{ session: AuthSession; creds: { email: string; password: string } } | null> {
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
			'login rate-limited (429): /auth/login allows 10 attempts per 15 minutes and the ' +
				'window is exhausted. Wait for it to expire and re-run — this is the test ' +
				'environment, not the code under test.',
		);
	}
	return null;
}

interface RetreatSummary {
	id: string;
	parish: string;
}

let auth: Awaited<ReturnType<typeof login>> = null;
// Two real retreats with distinct parish names, discovered from the API —
// never hardcode ids (the worktree database is a snapshot and ids drift).
let retreatA: RetreatSummary | null = null;
let retreatB: RetreatSummary | null = null;
// Profile favorites as they were before the suite; restored in afterAll.
let originalFavorites: string[] = [];

const escapeRegExp = (text: string): string =>
	text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** UI login (es locale already set by test.use). Waits for /app. */
async function loginViaUi(page: Page): Promise<void> {
	await page.goto('/login');
	await page.locator('input[type="email"]').fill(auth!.creds.email);
	await page.locator('input[type="password"]').fill(auth!.creds.password);
	await page.getByRole('button', { name: 'Iniciar Sesión' }).click();
	await page.waitForURL(/\/app/, { timeout: 20000 });
}

/** PUTs the favorites array through the same endpoint the UI uses. */
async function putFavorites(ids: string[]): Promise<void> {
	const res = await auth!.session.ctx.put('/api/social/profile', {
		headers: withCsrf(auth!.session.csrfToken),
		data: { favoriteRetreatIds: ids },
	});
	// A silent 404 here would leave the suite asserting against stale state.
	expect(res.ok(), `PUT /social/profile: ${res.status()}`).toBeTruthy();
}

test.beforeAll(async ({ baseURL }) => {
	auth = await login(baseURL!);
	test.skip(!auth, 'no usable credentials (seed the e2e users or set E2E_LOCAL_*)');

	const retreatsRes = await auth.session.ctx.get('/api/retreats');
	expect(retreatsRes.ok(), `GET /retreats: ${retreatsRes.status()}`).toBeTruthy();
	const body = await retreatsRes.json();
	const list: RetreatSummary[] = (Array.isArray(body) ? body : (body.data ?? []))
		.filter((r: { id?: string; parish?: string }) => r?.id && r?.parish)
		.map((r: { id: string; parish: string }) => ({ id: r.id, parish: r.parish }));
	// Two retreats with distinguishable parish names: the chips are located by
	// parish text, so equal names would make the two chips interchangeable.
	retreatA = list[0] ?? null;
	retreatB = list.find((r) => r.parish !== retreatA?.parish) ?? null;
	test.skip(
		!retreatA || !retreatB,
		`this database needs two retreats with distinct parish names for the favorites flow ` +
			`(found ${list.length} retreats)`,
	);

	const profileRes = await auth.session.ctx.get('/api/social/profile');
	expect(profileRes.ok(), `GET /social/profile: ${profileRes.status()}`).toBeTruthy();
	const profile = await profileRes.json();
	originalFavorites = profile.favoriteRetreatIds ?? [];
});

test.afterAll(async () => {
	if (auth) {
		// Restore the profile exactly as it was — verified by the PUT status
		// (a failing restore must fail loudly, not pass silently).
		await putFavorites(originalFavorites).catch(() => {});
		await auth.session.dispose();
	}
});

test.describe('sidebar accordion (regression: opening one section closes the previous)', () => {
	test('fresh browser starts all sections collapsed and keeps at most one open', async ({
		page,
	}) => {
		await page.addInitScript(() => {
			localStorage.setItem('preferred-locale', 'es');
		});
		await loginViaUi(page);

		// Desktop viewport: only the desktop Sidebar instance is mounted (the
		// mobile drawer is v-if'd away), so no strict-mode duplicates.
		const headers = page.locator('button[aria-controls^="section-"]');
		await expect(headers.first()).toBeVisible();
		const count = await headers.count();
		test.skip(count < 2, 'sidebar rendered fewer than two section headers');

		// Fresh browser → localStorage empty → initSidebarAccordion seeds every
		// section collapsed. This is the state the old bug escaped from.
		const first = headers.first();
		const second = headers.nth(1);
		await expect(first).toHaveAttribute('aria-expanded', 'false');
		await expect(second).toHaveAttribute('aria-expanded', 'false');

		// Open the first section: it must expand.
		await first.click();
		await expect(first).toHaveAttribute('aria-expanded', 'true');

		// Open the second: the accordion must close the first. The old code
		// left both open (sections without a key never collapsed).
		await second.click();
		await expect(second).toHaveAttribute('aria-expanded', 'true');
		await expect(first).toHaveAttribute('aria-expanded', 'false');

		// The first section's content actually collapsed (not just the marker).
		const firstContentId = await first.getAttribute('aria-controls');
		await expect(page.locator(`#${firstContentId}`)).toBeHidden();
	});
});

test.describe('favorite retreats (star + quick-jump chips)', () => {
	test('star persists across reload and chips jump to their retreat', async ({ page }) => {
		// Seed two favorites through the same endpoint the UI writes to.
		await putFavorites([retreatA!.id, retreatB!.id]);

		await page.addInitScript((retreatId) => {
			localStorage.setItem('preferred-locale', 'es');
			localStorage.setItem('selectedRetreatId', retreatId);
		}, retreatA!.id);
		await loginViaUi(page);

		const chips = page.getByTestId('favorite-retreat-chip');
		const chipA = chips.filter({ hasText: escapeRegExp(retreatA!.parish) });
		const chipB = chips.filter({ hasText: escapeRegExp(retreatB!.parish) });
		const star = page.getByTestId('favorite-retreat-star');

		// Both favorites render as chips; the selected retreat's chip is marked.
		await expect(chips).toHaveCount(2);
		await expect(chipA).toHaveAttribute('aria-current', 'true');
		await expect(star).toHaveAttribute('aria-pressed', 'true');

		// A chip click switches the selected retreat (and marks that chip).
		await chipB.click();
		await expect(chipB).toHaveAttribute('aria-current', 'true');
		await expect(chipA).not.toHaveAttribute('aria-current', 'true');
		expect(await page.evaluate(() => localStorage.getItem('selectedRetreatId'))).toBe(
			retreatB!.id,
		);

		// After a reload the favorites come back from the profile (backend
		// persistence, not localStorage) and the selection survives.
		await page.reload();
		await expect(chips).toHaveCount(2);
		await expect(chipB).toHaveAttribute('aria-current', 'true');
		await expect(star).toHaveAttribute('aria-pressed', 'true');

		// Unfavoriting the selected retreat removes its chip; favoriting it
		// again brings it back (optimistic toggle, PUT in the background).
		await star.click();
		await expect(chips).toHaveCount(1);
		await expect(chipA).toBeVisible();
		await expect(star).toHaveAttribute('aria-pressed', 'false');

		await star.click();
		await expect(chips).toHaveCount(2);
		await expect(star).toHaveAttribute('aria-pressed', 'true');
	});
});
