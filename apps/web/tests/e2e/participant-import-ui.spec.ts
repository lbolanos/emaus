import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Browser-level e2e for the import flow.
 *
 * Why this exists on top of participant-csv-import.spec.ts: that one drives the API
 * through APIRequestContext, so the frontend never mounts. It stayed green while the
 * worktree's web app was failing to boot (`@repo/ui` resolved to a dist/ that had
 * never been built). An API-only test cannot see that class of breakage.
 *
 * This spec loads the real app in a real browser, so a broken bundle, a missing
 * workspace build or a runtime error in the page fails the run.
 */

const CSV_PATH =
	process.env.E2E_IMPORT_CSV || path.join(__dirname, 'fixtures', 'participant-import-sample.csv');

const EMAIL = process.env.E2E_LOCAL_EMAIL;
const PASSWORD = process.env.E2E_LOCAL_PASSWORD;

test.use({ locale: 'es-MX' });

test.describe('Import flow in the browser', () => {
	test.beforeEach(async ({ page }) => {
		await page.addInitScript(() => localStorage.setItem('preferred-locale', 'es'));
	});

	test('the app boots without console or page errors', async ({ page }) => {
		const failures: string[] = [];
		page.on('console', (msg) => {
			if (msg.type() === 'error') failures.push(`console: ${msg.text()}`);
		});
		page.on('pageerror', (err) => failures.push(`pageerror: ${err.message}`));

		const response = await page.goto('/login');
		expect(response?.status(), 'the login page should be served').toBeLessThan(400);

		// A Vite resolution failure renders the error overlay instead of the app.
		await expect(page.locator('vite-error-overlay')).toHaveCount(0);

		// The app really mounted: the login form is interactive, not an empty shell.
		await expect(page.locator('input[type="email"]')).toBeVisible({ timeout: 15000 });
		await expect(page.locator('input[type="password"]')).toBeVisible();
		// The submit control is a @repo/ui <Button>, which renders without type="submit".
		await expect(page.getByRole('button', { name: 'Iniciar Sesión' })).toBeVisible();

		expect(failures, `page reported errors:\n${failures.join('\n')}`).toEqual([]);
	});

	test('imports a CSV through the UI and shows the result', async ({ page }) => {
		test.skip(!EMAIL || !PASSWORD, 'set E2E_LOCAL_EMAIL / E2E_LOCAL_PASSWORD');
		test.skip(!fs.existsSync(CSV_PATH), `CSV fixture not found: ${CSV_PATH}`);

		await page.goto('/login');
		await page.locator('input[type="email"]').fill(EMAIL!);
		await page.locator('input[type="password"]').fill(PASSWORD!);
		await page.getByRole('button', { name: 'Iniciar Sesión' }).click();

		// Landing anywhere inside /app means authentication succeeded.
		await page.waitForURL(/\/app/, { timeout: 20000 });

		await page.goto('/app/walkers');
		// The list view has no heading — it opens straight into the toolbar and table.
		await expect(page.getByPlaceholder('Buscar...').first()).toBeVisible({ timeout: 20000 });

		// The import lives behind the toolbar's overflow menu. It carries a testid
		// because the trigger is an icon-only button: no text, and the lucide icon
		// exposes neither a class nor an accessible name to hook onto.
		await page.getByTestId('participant-actions-menu').click();

		const importItem = page.getByText('Importar Participantes', { exact: false }).first();
		await expect(importItem).toBeVisible({ timeout: 10000 });
		await importItem.click();

		// Feed the CSV to the hidden file input inside the drop zone.
		const fileInput = page.locator('input[type="file"]');
		await expect(fileInput).toBeAttached({ timeout: 10000 });
		await fileInput.setInputFiles(CSV_PATH);

		// Parsing is client-side: the preview must list the rows before importing.
		await expect(page.getByText(/Vista Previa|filas/i).first()).toBeVisible({ timeout: 15000 });
	});
});
