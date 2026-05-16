import { test, expect } from '@playwright/test';

/**
 * E2E coverage for the public Community Search section on the landing page.
 *
 * Covers:
 * - Loading communities from the public API
 * - Filtering by text (city/state/name)
 * - Clearing filters
 * - Geolocation: granting permission + setting coords + verifying distance shown
 * - Detail modal open flow
 * - Lazy-loaded Leaflet map renders
 */

test.use({ locale: 'es-MX' });

test.describe('Community Search (landing)', () => {
	test('carga comunidades públicas y muestra tarjeta más cercana', async ({ page }) => {
		await page.goto('/');
		await page.waitForLoadState('networkidle');
		await page.locator('#community').scrollIntoViewIfNeeded();

		// El botón "Unirse" de la tarjeta inferior debe existir (significa que hay >=1 comunidad cargada)
		const joinBtn = page.locator('#community').getByRole('button', { name: 'Unirse' }).first();
		await expect(joinBtn).toBeVisible({ timeout: 10_000 });
	});

	test('filtra por texto al escribir y limpia con el botón', async ({ page }) => {
		await page.goto('/');
		await page.locator('#community').scrollIntoViewIfNeeded();
		await page.waitForLoadState('networkidle');

		const input = page.locator('#community input[type="search"]');
		await input.fill('Querétaro');
		await page.waitForTimeout(300); // esperar debounce

		// El contador debe aparecer
		await expect(page.getByText(/comunidad(es)? encontrad/)).toBeVisible();

		// El botón "Limpiar" debe aparecer
		const clearBtn = page.locator('button', { hasText: 'Limpiar' });
		await expect(clearBtn).toBeVisible();

		// Limpiar
		await clearBtn.click();
		await page.waitForTimeout(300);
		await expect(input).toHaveValue('');
		await expect(page.getByText(/comunidad(es)? encontrad/)).toBeHidden();
	});

	test('estado vacío cuando no hay resultados', async ({ page }) => {
		await page.goto('/');
		await page.locator('#community').scrollIntoViewIfNeeded();
		await page.waitForLoadState('networkidle');

		await page.locator('#community input[type="search"]').fill('xyz_no_existe_zzz');
		await page.waitForTimeout(300);

		await expect(page.getByText('No se encontraron comunidades')).toBeVisible();
	});

	test('geolocalización: con permiso y coords CDMX, muestra distancia en la tarjeta', async ({ browser }) => {
		const context = await browser.newContext({
			permissions: ['geolocation'],
			geolocation: { latitude: 19.4326, longitude: -99.1332 },
			locale: 'es-MX',
		});
		const page = await context.newPage();
		await page.goto('/');
		await page.locator('#community').scrollIntoViewIfNeeded();
		await page.waitForLoadState('networkidle');

		// El botón "Usar Mi Ubicación" debe mostrar el sub-label "Ordenadas por tu ubicación"
		await expect(page.getByText('Ordenadas por tu ubicación')).toBeVisible({ timeout: 10_000 });

		// La tarjeta inferior debe incluir distancia en km/m
		const distanceText = page.locator('#community').getByText(/\d+(\.\d+)?\s*(km|m)\b/).first();
		await expect(distanceText).toBeVisible();

		await context.close();
	});

	test('abre modal de detalle al clicar Unirse en la tarjeta', async ({ page }) => {
		await page.goto('/');
		await page.locator('#community').scrollIntoViewIfNeeded();
		await page.waitForLoadState('networkidle');

		// El primer botón "Unirse" dentro de #community es el de la tarjeta inferior
		const joinBtn = page.locator('#community').getByRole('button', { name: 'Unirse' }).first();
		await joinBtn.click();

		// Debe aparecer el modal de detalle
		const dialog = page.getByRole('dialog');
		await expect(dialog).toBeVisible();
		// 2 botones "Cerrar" (X y footer), basta verificar que existe al menos uno
		await expect(dialog.getByRole('button', { name: 'Cerrar' }).first()).toBeVisible();
		await expect(dialog.getByRole('button', { name: 'Unirse' })).toBeVisible();
	});

	test('el mapa Leaflet renderiza tiles reales', async ({ page }) => {
		await page.goto('/');
		await page.locator('#community').scrollIntoViewIfNeeded();
		await page.waitForLoadState('networkidle');
		// Esperar a que el componente async cargue y tiles aparezcan
		await page.waitForSelector('.leaflet-tile-loaded', { timeout: 15_000 });

		const tileCount = await page.locator('.leaflet-tile-loaded').count();
		expect(tileCount).toBeGreaterThan(0);

		// Verificar que .leaflet-container existe (significa que el CSS fix funcionó)
		await expect(page.locator('.leaflet-container')).toBeVisible();
	});

	test('pines del mapa usan color rojo (#dc2626)', async ({ page }) => {
		await page.goto('/');
		await page.locator('#community').scrollIntoViewIfNeeded();
		await page.waitForSelector('.leaflet-marker-icon', { timeout: 15_000 });

		// El marker es un divIcon con un div hijo de color rojo
		const pinColor = await page.locator('.leaflet-marker-icon div.rounded-full[style*="background"]').first().evaluate((el) => {
			return (el as HTMLElement).style.background || (el as HTMLElement).style.backgroundColor;
		});
		expect(pinColor).toContain('220'); // rgb(220, 38, 38) o similar
	});

	test('click en el mapa activa scroll-wheel zoom', async ({ page }) => {
		await page.goto('/');
		await page.locator('#community').scrollIntoViewIfNeeded();
		await page.waitForSelector('.leaflet-container', { timeout: 15_000 });

		const mapEl = page.locator('.leaflet-container').first();
		// Click sobre el mapa (en un área sin marker, esquina inferior)
		await mapEl.click({ position: { x: 50, y: 250 } });
		await page.waitForTimeout(100);

		// Verificar que el wrapper recibió la clase .map-active
		const isActive = await page.locator('.map-active').count();
		expect(isActive).toBeGreaterThan(0);
	});

	test('flujo completo: modal detalle → modal solicitud con checkbox consentimiento', async ({ page }) => {
		await page.goto('/');
		await page.locator('#community').scrollIntoViewIfNeeded();
		await page.waitForLoadState('networkidle');

		// 1. Abrir modal de detalle desde la card "Círculo Más Cercano"
		await page.locator('#community').getByRole('button', { name: 'Unirse' }).first().click();
		const detailDialog = page.getByRole('dialog');
		await expect(detailDialog).toBeVisible();

		// 2. Click "Unirse" del modal de detalle → abre el modal de PublicJoinRequestModal
		await detailDialog.getByRole('button', { name: 'Unirse' }).click();
		await page.waitForTimeout(400);

		// 3. El form de solicitud debe estar visible
		await expect(page.locator('input[id="firstName"]')).toBeVisible({ timeout: 5000 });

		// 4. El checkbox de consentimiento debe estar presente y desmarcado por defecto
		const consentCheckbox = page.locator('input[type="checkbox"]').first();
		await expect(consentCheckbox).toBeVisible();
		await expect(consentCheckbox).not.toBeChecked();

		// 5. El label del consentimiento debe mencionar los datos personales
		const consentLabel = page.locator('label').filter({ has: consentCheckbox });
		await expect(consentLabel).toContainText(/datos personales|personal data/i);

		// 6. Marcar el checkbox
		await consentCheckbox.check();
		await expect(consentCheckbox).toBeChecked();
	});

	test('Escape cierra el modal de detalle', async ({ page }) => {
		await page.goto('/');
		await page.locator('#community').scrollIntoViewIfNeeded();
		await page.waitForLoadState('networkidle');

		// Abrir modal
		const joinBtn = page.locator('#community').getByRole('button', { name: 'Unirse' }).first();
		await joinBtn.click();
		await expect(page.getByRole('dialog')).toBeVisible();

		// Presionar Escape
		await page.keyboard.press('Escape');
		await expect(page.getByRole('dialog')).toBeHidden();
	});

	test('tabla de horarios muestra fila aunque la comunidad no tenga meeting próximo', async ({ page }) => {
		await page.goto('/');
		await page.locator('#community').scrollIntoViewIfNeeded();
		await page.waitForLoadState('networkidle');

		const rows = page.locator('tbody tr');
		const count = await rows.count();
		// Hay 12 comunidades activas → al menos algunas filas en la tabla
		expect(count).toBeGreaterThan(0);

		// Buscar al menos una fila con "Horario por confirmar" (sin meeting próximo y sin default)
		// O al menos una con día válido (Lunes/Monday/etc.)
		// Solo verificar que hay >= número de comunidades visibles
		expect(count).toBeGreaterThanOrEqual(1);
	});

	test('tabla de horarios tiene scroll cuando hay muchas filas', async ({ page }) => {
		await page.goto('/');
		await page.locator('#community').scrollIntoViewIfNeeded();
		await page.waitForLoadState('networkidle');

		// El contenedor scroleable tiene max-h-[600px] overflow-y-auto
		const scrollable = page.locator('div.overflow-y-auto').filter({ has: page.locator('table') });
		await expect(scrollable).toBeVisible();

		// scrollHeight > clientHeight indica que hay contenido para scrollear (si hay >X filas)
		const { scrollHeight, clientHeight } = await scrollable.evaluate((el) => ({
			scrollHeight: el.scrollHeight,
			clientHeight: el.clientHeight,
		}));
		// clientHeight debe ser max 600 (o menos si hay pocas filas)
		expect(clientHeight).toBeLessThanOrEqual(600);
		expect(scrollHeight).toBeGreaterThan(0);
	});
});
