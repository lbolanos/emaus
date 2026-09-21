import {
	test,
	expect,
	type BrowserContext,
	type Locator,
	type Page,
} from '@playwright/test';
import { loginAs, type AuthSession } from './helpers/auth';

/**
 * E2E de la jerarquía del flyer de reunión (2026-09-20): el título de la
 * reunión es el protagonista (h1), la comunidad pasa a subtítulo y la marca
 * EMAÚS remata arriba — en los estilos Poster y WhatsApp.
 *
 * Estrategia (como mam-schedule-timing): login por API como superadmin local,
 * reunión aislada creada vía API en la primera comunidad visible (título
 * único, borrada al terminar), navegador autenticado con storageState y cambio
 * de estilo con los botones de la toolbar (el camino real del usuario, sin
 * tocar localStorage).
 *
 * La marca EMAÚS se asserts condicional al guard anti-duplicación: si la
 * comunidad ya se llama "Emaús …" el header no debe aparecer (cubre ambos
 * casos con cualquier comunidad de la base). Se salta limpio si no hay
 * comunidades.
 */
test.use({ locale: 'es-MX' });

const USER = {
	email: process.env.E2E_SUPERADMIN_EMAIL || 'leonardo.bolanos@gmail.com',
	password: process.env.E2E_SUPERADMIN_PASSWORD || '123456',
};

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

test.describe.serial('Community flyer — jerarquía título/comunidad/marca (E2E)', () => {
	const stamp = Date.now();
	const meetingTitle = `Convivencia de prueba ZZE2E ${stamp}`;

	let s: AuthSession;
	let communityId = '';
	let communityName = '';
	let meetingId = '';
	let context: BrowserContext;
	let page: Page;
	let skipReason = '';

	test.beforeAll(async ({ browser, baseURL }) => {
		s = await loginAs(baseURL!, USER);

		const listRes = await s.ctx.get('/api/communities');
		if (!listRes.ok()) {
			skipReason = `GET /api/communities falló (${listRes.status()})`;
			return;
		}
		const body = await listRes.json();
		const list = Array.isArray(body) ? body : (body?.data ?? body?.communities ?? []);
		if (!Array.isArray(list) || list.length === 0) {
			skipReason = 'no hay comunidades en la DB para el E2E';
			return;
		}
		communityId = list[0].id;
		communityName = list[0].name ?? '';

		const createRes = await s.ctx.post(`/api/communities/${communityId}/meetings`, {
			data: {
				title: meetingTitle,
				startDate: new Date(Date.now() + 3 * 86_400_000).toISOString(),
				durationMinutes: 90,
			},
			headers: { 'X-CSRF-Token': s.csrfToken, 'content-type': 'application/json' },
		});
		if (createRes.status() !== 201) {
			skipReason = `crear reunión falló (${createRes.status()}: ${await createRes.text()})`;
			return;
		}
		meetingId = (await createRes.json()).id as string;

		const state = await s.ctx.storageState();
		context = await browser.newContext({ storageState: state, locale: 'es-MX' });
		page = await context.newPage();
	});

	test.afterAll(async () => {
		// URL real del servicio web (deleteCommunityMeeting): el communityId NO
		// va en el path — la ruta del API es /api/communities/meetings/:id.
		if (meetingId) {
			await s.ctx.delete(`/api/communities/meetings/${meetingId}?scope=this`, {
				headers: { 'X-CSRF-Token': s.csrfToken },
			});
		}
		await page?.close();
		await context?.close();
		await s?.dispose();
	});

	const openFlyer = async (baseURL: string) => {
		await page.goto(`${baseURL}/app/communities/${communityId}/meetings/${meetingId}/flyer`);
		// El flyer monta (deja el skeleton) cuando community + meetings cargan.
		await expect(page.locator('#printable-area')).toBeVisible();
	};

	const assertHierarchy = async (area: Locator) => {
		// Título protagonista y comunidad como subtítulo (el <p> que sigue
		// inmediatamente al <h1> en ambos estilos).
		const h1 = area.locator('h1');
		await expect(h1).toHaveText(meetingTitle);
		await expect(area.locator('h1 + p')).toHaveText(
			new RegExp(escapeRegExp(communityName), 'i'),
		);

		// Marca arriba, salvo cuando la comunidad ya lleva el nombre Emaús
		// (aserción negativa válida: el h1 de arriba ya garantizó que montó).
		const brand = area.locator('h2', { hasText: 'EMAÚS' });
		if (/^ema[úu]s\b/i.test(communityName.trim())) {
			await expect(brand).toHaveCount(0);
		} else {
			await expect(brand).toBeVisible();
		}
	};

	test('estilo Poster: título como h1, comunidad como subtítulo, marca EMAÚS arriba', async ({ baseURL }) => {
		test.skip(!!skipReason, skipReason);
		await openFlyer(baseURL!);

		await page.getByRole('button', { name: 'Poster' }).click();
		await assertHierarchy(page.locator('#printable-area'));
	});

	test('estilo WhatsApp: misma jerarquía con el dorado oscuro', async ({ baseURL }) => {
		test.skip(!!skipReason, skipReason);
		await openFlyer(baseURL!);

		await page.getByRole('button', { name: 'WhatsApp' }).click();
		await assertHierarchy(page.locator('#printable-area'));
	});
});
