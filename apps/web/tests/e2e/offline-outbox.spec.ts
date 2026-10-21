import { test, expect, type Page, type APIRequestContext, type BrowserContext } from '@playwright/test';

/**
 * offline-mode M4 E2E (specs/offline-mode): what the team does at the door
 * without signal — charge, arrive, cancel a no-show — survives a reload, reaches
 * the server once when the signal comes back, with the device time; a write whose
 * answer is lost (timeout) is replayed by the server, not repeated; a rejected
 * write is shown with the server's message and leaves only when discarded.
 *
 * THIS SPEC WRITES TO THE DATABASE (that is the point: the server must receive
 * the writes). It only runs with E2E_OFFLINE_WRITES=1 against a disposable copy —
 * the worktree stack of `.ruler/skills/worktree-testing` recreates it on every
 * start. It undoes the payment, the check-in and the cancellation it made; the
 * bed and table the cancellation freed are NOT given back (reactivating does not
 * do that), which is why a disposable copy is required. It needs `vite preview` of a production
 * build (the service worker serves the app offline) and a retreat with at least
 * two walkers still pending, the first one with nothing paid:
 *
 *   E2E_OFFLINE_WRITES=1 E2E_BASE_URL=http://localhost:4179 \
 *     npx playwright test tests/e2e/offline-outbox.spec.ts --project=chromium
 */

test.use({ locale: 'es-MX', serviceWorkers: 'allow' });

const RETREAT_ID = process.env.E2E_RETREAT_ID || 'e9b3c568-050a-4d66-a99d-305f287a59df';
const USER = {
	email: process.env.E2E_LOCAL_EMAIL || 'leonardo.bolanos@gmail.com',
	password: process.env.E2E_LOCAL_PASSWORD || '123456',
};
const OFFLINE_AMOUNT = 123.45;

interface Walker {
	participantId: string;
	firstName: string;
	lastName: string;
	totalPaid: number;
}

async function login(page: Page): Promise<string | null> {
	await page.addInitScript((rid) => {
		localStorage.setItem('preferred-locale', 'es');
		localStorage.setItem('selectedRetreatId', rid);
	}, RETREAT_ID);
	await page.goto('/login');
	await page.locator('input[type="email"]').fill(USER.email);
	await page.locator('input[type="password"]').fill(USER.password);
	const loginResponse = page.waitForResponse(
		(r) => r.url().includes('/api/auth/login') && r.request().method() === 'POST',
		{ timeout: 30000 },
	);
	await page.getByRole('button', { name: 'Iniciar Sesión' }).click();
	const response = await loginResponse;
	if (!response.ok()) return `login rejected with ${response.status()} for ${USER.email}`;
	await page.waitForURL(/\/app/, { timeout: 30000 });
	await page.waitForFunction(() => navigator.serviceWorker?.controller != null, null, { timeout: 60000 });
	return null;
}

/** API calls with the browser's session (the context shares its cookies). */
function serverApi(context: BrowserContext) {
	const req: APIRequestContext = context.request;
	const csrf = async () => (await (await req.get('/api/csrf-token')).json()).csrfToken as string;
	return {
		get: async (path: string) => (await req.get(`/api${path}`)).json(),
		send: async (method: 'put' | 'delete', path: string, data?: unknown) => {
			const response = await req.fetch(`/api${path}`, { method, data, headers: { 'x-csrf-token': await csrf() } });
			if (!response.ok()) throw new Error(`${method} ${path} → ${response.status()}`);
		},
	};
}

const chip = (page: Page) => page.getByTestId('connectivity-chip');
const pendingRow = (page: Page, w: Walker) =>
	page.locator('li').filter({ hasText: w.lastName }).filter({ has: page.getByRole('button', { name: 'Llegó', exact: true }) });
const arrivedRow = (page: Page, w: Walker) =>
	page.locator('li').filter({ hasText: w.lastName }).filter({ has: page.getByRole('button', { name: 'Deshacer' }) });

test('the door without signal reaches the server once, with the device time', async ({ page, context, request }) => {
	test.setTimeout(300_000);
	test.skip(
		process.env.E2E_OFFLINE_WRITES !== '1',
		'writes to the database: run only against a disposable copy with E2E_OFFLINE_WRITES=1',
	);
	const sw = await request.get('/sw.js');
	test.skip(!(await sw.text()).includes('workbox'), 'needs a production build served by vite preview');
	const loginSkip = await login(page);
	test.skip(loginSkip !== null, loginSkip ?? '');

	const api = serverApi(context);
	// The saved data of a retreat whose window closed is deleted on start (D9):
	// pin the browser clock inside the retreat. It is also the "device time" the
	// server must store (D7), different from the server's own clock.
	const retreat = await api.get(`/retreats/${RETREAT_ID}`);
	const deviceTime = new Date(Date.parse(retreat.startDate) + 18 * 60 * 60 * 1000);
	await context.clock.setFixedTime(deviceTime);
	const before = await api.get(`/participants/reception/${RETREAT_ID}`);
	const unpaid = before.pendingList.find((w: Walker) => !w.totalPaid);
	const other = before.pendingList.find((w: Walker) => w !== unpaid);
	test.skip(!unpaid || !other, 'needs two pending walkers, one with nothing paid');
	const a: Walker = unpaid;
	const b: Walker = other;
	page.on('dialog', (dialog) => void dialog.accept());
	let paymentIds: string[] = [];

	try {
		await test.step('online: open Recepción once so the phone has it', async () => {
			await page.goto(`/app/retreats/${RETREAT_ID}/reception`, { waitUntil: 'networkidle' });
			await expect(pendingRow(page, a)).toBeVisible({ timeout: 30000 });
			await expect(pendingRow(page, b)).toBeVisible();
		});

		await test.step('no signal: charge A, A arrives, B did not come', async () => {
			await context.setOffline(true);

			await pendingRow(page, a).getByRole('button', { name: 'Cobrar' }).click();
			await page.locator('input[type="number"]').fill(String(OFFLINE_AMOUNT));
			await page.getByRole('button', { name: 'Registrar pago' }).click();
			await expect(pendingRow(page, a)).toContainText('123.45', { timeout: 15000 });
			// The screen's own toast ("Pago registrado…") says where it really is (D11).
			// The toast is also mirrored for screen readers: take the first copy.
			await expect(page.getByText(/Pago registrado/).first()).toBeVisible();
			await expect(
				page.getByText('Guardado en el teléfono: se enviará solo cuando vuelva la señal.').first(),
			).toBeVisible();

			await pendingRow(page, a).getByRole('button', { name: 'Llegó', exact: true }).click();
			await pendingRow(page, b).getByTestId('reception-cancel-no-show').click();

			await expect(chip(page)).toHaveAttribute('data-pending', '3', { timeout: 15000 });
			await expect(chip(page)).toHaveAttribute('data-state', 'offline');
		});

		await test.step('a reload without signal keeps what was done', async () => {
			await page.reload();
			const arrivedToggle = page.getByRole('button', { name: new RegExp(`Ver llegados \\(${before.arrived + 1}\\)`) });
			await expect(arrivedToggle).toBeVisible({ timeout: 30000 });
			await expect(chip(page)).toHaveAttribute('data-pending', '3');
			await expect(pendingRow(page, a)).toHaveCount(0);
			await expect(pendingRow(page, b)).toHaveCount(0);
		});

		await test.step('signal back: the queue empties by itself', async () => {
			await context.setOffline(false);
			await expect(chip(page)).toHaveAttribute('data-pending', '0', { timeout: 90000 });
			await expect(chip(page)).toHaveAttribute('data-conflicts', '0');
		});

		await test.step('the server has each write once, with the device time', async () => {
			const after = await api.get(`/participants/reception/${RETREAT_ID}`);
			const arrived = after.arrivedList.find((e: any) => e.participantId === a.participantId);
			expect(arrived, 'A arrived on the server').toBeTruthy();
			expect(
				new Date(arrived.checkedInAt).toISOString(),
				'checkedInAt is the device time of the button press, not the server time of the sync',
			).toBe(deviceTime.toISOString());
			const bStillListed = [...after.pendingList, ...after.arrivedList].some((e: any) => e.participantId === b.participantId);
			expect(bStillListed, 'B was cancelled').toBe(false);

			const payments = (await api.get(`/payments/participant/${a.participantId}`)) as any[];
			const doorPayments = payments.filter((p) => Number(p.amount) === OFFLINE_AMOUNT);
			expect(doorPayments, 'the door payment was recorded exactly once').toHaveLength(1);
			paymentIds = doorPayments.map((p) => p.id);
		});

		await test.step('an answer lost on the way back: queued with the same key, replayed by the server', async () => {
			let held = false;
			await page.route('**/api/participants/*/checkin', async (route) => {
				if (held) return route.fallback();
				held = true;
				// The server receives and applies it; the answer arrives after the
				// client already gave up (10 s).
				const response = await route.fetch();
				await new Promise((r) => setTimeout(r, 11_000));
				await route.fulfill({ response }).catch(() => {});
			});

			// The client gives up at 10 s and queues the write with the SAME key. The
			// next request that succeeds (the list reload) proves the connection is
			// back and the queue is sent right away: the server must replay it.
			const replayed = page.waitForResponse(
				(r) =>
					r.url().includes(`/participants/${a.participantId}/checkin`) &&
					r.request().method() === 'PUT' &&
					r.headers()['idempotent-replayed'] === 'true',
				{ timeout: 60000 },
			);
			await page.getByRole('button', { name: /Ver llegados/ }).click();
			await arrivedRow(page, a).getByRole('button', { name: 'Deshacer' }).click();
			const resent = await replayed;
			expect(resent.status()).toBe(200);
			expect(resent.request().headers()['x-outbox-sync'], 'the resend came from the outbox').toBe('1');
			await page.unroute('**/api/participants/*/checkin');
			await expect(chip(page)).toHaveAttribute('data-pending', '0', { timeout: 30000 });

			const after = await api.get(`/participants/reception/${RETREAT_ID}`);
			expect(after.pendingList.some((e: any) => e.participantId === a.participantId), 'A is pending again').toBe(true);
		});

		await test.step('a write the server rejects is shown with its message and leaves only when discarded', async () => {
			// A fulfilled route answers even with the context offline, so the first
			// attempt is aborted like a dropped connection (→ queued) and only the
			// resend gets the server's rejection.
			let attempts = 0;
			await page.route('**/api/participants/*/checkin', (route) => {
				attempts += 1;
				if (attempts === 1) return route.abort('internetdisconnected');
				return route.fulfill({
					status: 404,
					contentType: 'application/json',
					body: JSON.stringify({ message: 'Participant not found in retreat' }),
				});
			});
			await context.setOffline(true);
			await pendingRow(page, a).getByRole('button', { name: 'Llegó', exact: true }).click();
			await expect(chip(page)).toHaveAttribute('data-pending', '1', { timeout: 15000 });

			await context.setOffline(false);
			await expect(chip(page)).toHaveAttribute('data-conflicts', '1', { timeout: 90000 });
			await chip(page).click();
			const row = page.getByTestId('pending-op');
			await expect(row).toContainText('Participant not found in retreat');
			await row.getByRole('button', { name: 'Descartar' }).click();
			await expect(chip(page)).toHaveAttribute('data-conflicts', '0');
			await page.unroute('**/api/participants/*/checkin');

			const after = await api.get(`/participants/reception/${RETREAT_ID}`);
			expect(after.pendingList.some((e: any) => e.participantId === a.participantId), 'nothing reached the server').toBe(true);
		});
	} finally {
		// Leave the disposable DB as it was found. With the signal back the page
		// sends whatever was still queued (a step may have failed mid-way): let
		// it, then clean by what the server has, not by what this run noted.
		await context.setOffline(false).catch(() => {});
		await expect(chip(page)).toHaveAttribute('data-pending', '0', { timeout: 30000 }).catch(() => {});
		await page.close().catch(() => {});
		const left = ((await api.get(`/payments/participant/${a.participantId}`)) as any[]).filter(
			(p) => Number(p.amount) === OFFLINE_AMOUNT,
		);
		for (const id of new Set([...paymentIds, ...left.map((p) => p.id)])) {
			await api.send('delete', `/payments/${id}`).catch(() => {});
		}
		await api
			.send('put', `/participants/${a.participantId}/checkin`, { retreatId: RETREAT_ID, checkedIn: false })
			.catch(() => {});
		await api
			.send('put', `/participants/${b.participantId}`, { isCancelled: false, contextRetreatId: RETREAT_ID })
			.catch(() => {});
	}
});
