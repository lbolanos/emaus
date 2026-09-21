import {
	test,
	expect,
	type BrowserContext,
	type Page,
} from '@playwright/test';
import { loginAs, type AuthSession } from './helpers/auth';

/**
 * E2E del fondo del flyer de reunión (2026-09-21): la comunidad puede elegir
 * un preset de la galería (asset público del repo) o subir su imagen, y
 * restaurar el fondo por defecto. El fondo es identidad de la COMUNIDAD: los
 * estilos Poster y WhatsApp lo heredan por igual.
 *
 * Estrategia (como community-flyer-hierarchy): login por API como superadmin
 * local, reunión aislada creada vía API en la primera comunidad visible
 * (título único — deliberadamente largo para ejercitar el escalón 34px del
 * título del estilo Default —, borrada al terminar), navegador autenticado con
 * storageState y cambios por el camino real del usuario (botones de la
 * toolbar + popover de la galería).
 *
 * La comunidad es real de la DB de dev: el afterAll restaura SIEMPRE el fondo
 * (DELETE), aunque un test falle a mitad.
 */
test.use({ locale: 'es-MX' });

const USER = {
	email: process.env.E2E_SUPERADMIN_EMAIL || 'leonardo.bolanos@gmail.com',
	password: process.env.E2E_SUPERADMIN_PASSWORD || '123456',
};

test.describe.serial('Community flyer — galería de fondos (E2E)', () => {
	const stamp = Date.now();
	// > 40 caracteres tras trim: cae en el escalón más chico del título Default.
	const meetingTitle = `Convivencia extraordinaria de otoño con los hermanos de la comunidad ZZE2E ${stamp}`;

	let s: AuthSession;
	let communityId = '';
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
		// La comunidad es real: devolver SIEMPRE su fondo a NULL, aunque un test
		// fallara antes del de restauración. Luego borrar la reunión (URL plana
		// del servicio web: el communityId NO va en el path) y cerrar.
		if (communityId) {
			await s.ctx.delete(`/api/communities/${communityId}/flyer-background`, {
				headers: { 'X-CSRF-Token': s.csrfToken },
			});
		}
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

	const area = () => page.locator('#printable-area');

	const selectStyle = async (name: string) => {
		await page.getByRole('button', { name, exact: true }).click();
	};

	const openGalleryAndPick = async (presetLabel: string) => {
		await page.getByRole('button', { name: 'Fondo' }).click();
		// El nombre accesible duplica la etiqueta (alt de la miniatura + caption).
		await page.getByRole('button', { name: new RegExp(presetLabel) }).first().click();
	};

	test('galería: un preset del catálogo se aplica al estilo Poster', async ({ baseURL }) => {
		test.skip(!!skipReason, skipReason);
		await openFlyer(baseURL!);

		await selectStyle('Poster');
		await openGalleryAndPick('Valle con niebla');
		await expect(area()).toHaveCSS('background-image', /cta-bg\.webp/);
	});

	test('WhatsApp hereda el fondo que la comunidad guardó', async ({ baseURL }) => {
		test.skip(!!skipReason, skipReason);
		await openFlyer(baseURL!);

		await selectStyle('WhatsApp');
		await expect(area()).toHaveCSS('background-image', /cta-bg\.webp/);
	});

	test('Default: un título largo no invade los bordes del header', async ({ baseURL }) => {
		test.skip(!!skipReason, skipReason);
		await openFlyer(baseURL!);

		await selectStyle('Default');
		const header = area().locator('header');
		const title = header.locator('h1');
		await expect(title).toHaveText(meetingTitle);

		// La aserción de caja no auto-espera: montar primero (hecho arriba) y
		// tolerar ~2px por la leve rotación del título (-rotate-1).
		const headerBox = (await header.boundingBox())!;
		const titleBox = (await title.boundingBox())!;
		expect(titleBox.x).toBeGreaterThanOrEqual(headerBox.x - 2);
		expect(titleBox.y).toBeGreaterThanOrEqual(headerBox.y - 2);
		expect(titleBox.x + titleBox.width).toBeLessThanOrEqual(headerBox.x + headerBox.width + 2);
		expect(titleBox.y + titleBox.height).toBeLessThanOrEqual(headerBox.y + headerBox.height + 2);
	});

	test('restaurar devuelve el fondo por defecto', async ({ baseURL }) => {
		test.skip(!!skipReason, skipReason);
		await openFlyer(baseURL!);

		await selectStyle('Poster');
		await page.getByRole('button', { name: 'Fondo' }).click();
		await page.getByRole('button', { name: 'Restaurar por defecto' }).click();
		await expect(area()).toHaveCSS('background-image', /poster\.png/);
	});
});
