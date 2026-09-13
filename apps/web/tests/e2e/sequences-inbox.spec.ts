import { test, expect, type Browser, type Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { loginAs, withCsrf, E2E_USERS, type AuthSession } from './helpers/auth';

/**
 * E2E de la bandeja de WhatsApp de Secuencias automáticas:
 *  - realtime: dos vistas abiertas en el mismo retiro; despachar en una
 *    refresca la otra vía websocket (sequences:queue-changed) sin interacción.
 *  - historial: despachar registra la comunicación en participant_communications
 *    (Fix del incidente 2026-09-12: envíos hechos sin quedar marcados/registrados).
 *
 * Todo el setup es por API contra un retiro desechable (fechas 2030) que se
 * borra en afterAll; el walker se importa con email único para no tocar
 * participantes reales (createParticipant matchea por email entre retiros).
 */

test.use({ locale: 'es-MX' });

const CSV_PATH = path.join(__dirname, 'fixtures', 'participant-import-sample.csv');

/** Mirrors the CSV parsing the import modal does in the browser. */
const parseCsv = (text: string): Record<string, string | null>[] => {
	const lines = text.split('\n').filter((line) => line.trim() !== '');
	const headers = parseCsvLine(lines[0]);
	return lines.slice(1).map((line) => {
		const values = parseCsvLine(line);
		const row: Record<string, string | null> = {};
		headers.forEach((header, i) => {
			row[header] = values[i] || null;
		});
		return row;
	});
};

const parseCsvLine = (line: string): string[] => {
	const result: string[] = [];
	let current = '';
	let inQuotes = false;
	for (let i = 0; i < line.length; ) {
		const char = line[i];
		if (char === '"') {
			if (inQuotes && line[i + 1] === '"') {
				current += '"';
				i += 2;
			} else {
				inQuotes = !inQuotes;
				i++;
			}
		} else if (char === ',' && !inQuotes) {
			result.push(current);
			current = '';
			i++;
		} else {
			current += char;
			i++;
		}
	}
	result.push(current);
	return result;
};

/**
 * Logs in with whatever credentials this database has (seeded e2e users first,
 * then E2E_LOCAL_*). Returns the creds too — the UI login needs them. A 429
 * THROWS instead of skipping: the rate limit burns out when the suite runs a
 * few times in a row, and a green skip would hide that.
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

let auth: Awaited<ReturnType<typeof login>> = null;
// Any house works: the retreat is disposable and gets deleted in afterAll.
// Resolved from the API instead of a fixture id — seeded e2e houses don't
// exist on every database.
let houseId = '';
// Name of the WALKER_WELCOME template the detail modal must list after a
// dispatch: the retreat's own if the seed created one, else the one we post.
let walkerWelcomeName = 'E2E Bienvenida';
const createdRetreatIds: string[] = [];

/**
 * Creates a disposable retreat with a whatsapp sequence of `stepCount` steps,
 * imports one walker (unique email, phone 5512345678) and runs the engine so
 * the inbox has `stepCount` pending items. Returns the retreatId.
 */
async function createScenario(stepCount: number): Promise<string> {
	const { ctx, csrfToken } = auth!.session;
	const stamp = Date.now();

	// Retreat (2030 so it never expires) + public so the import accepts rows.
	const createRes = await ctx.post('/api/retreats', {
		headers: withCsrf(csrfToken),
		data: {
			parish: `E2E Sequencias ${stamp}`,
			startDate: '2030-06-13',
			endDate: '2030-06-15',
			houseId,
		},
	});
	expect(createRes.ok(), `create retreat: ${createRes.status()}`).toBeTruthy();
	const retreatId = (await createRes.json()).id;
	createdRetreatIds.push(retreatId);

	const publishRes = await ctx.put(`/api/retreats/${retreatId}`, {
		headers: withCsrf(csrfToken),
		data: { isPublic: true },
	});
	expect(publishRes.ok(), `publish retreat: ${publishRes.status()}`).toBeTruthy();

	// WALKER_WELCOME template. Retreat creation seeds one on most databases;
	// reuse it when present (two rows with the same type would make template
	// resolution ambiguous) and post our own otherwise.
	const tplListRes = await ctx.get(`/api/message-templates?retreatId=${retreatId}`);
	const tplList = await tplListRes.json();
	const existing = (Array.isArray(tplList) ? tplList : (tplList.data ?? [])).find(
		(tpl: any) => tpl.type === 'WALKER_WELCOME',
	);
	if (existing) {
		walkerWelcomeName = existing.name;
	} else {
		const tplRes = await ctx.post('/api/message-templates', {
			headers: withCsrf(csrfToken),
			data: {
				name: walkerWelcomeName,
				type: 'WALKER_WELCOME',
				scope: 'retreat',
				message: '<p>Hola {participant.firstName}, te esperamos!</p>',
				retreatId,
			},
		});
		expect(tplRes.ok(), `create template: ${tplRes.status()}`).toBeTruthy();
	}

	// Retreat creation also seeds default sequences; they would enqueue their
	// own whatsapp items and pollute the inbox counts. Delete them before the
	// walker exists so their steps never materialize.
	const seqListRes = await ctx.get(`/api/message-sequences/retreat/${retreatId}`);
	const seqList = await seqListRes.json();
	for (const seq of Array.isArray(seqList) ? seqList : (seqList.data ?? [])) {
		const delRes = await ctx.delete(`/api/message-sequences/${seq.id}`, {
			headers: withCsrf(csrfToken),
		});
		expect(delRes.ok(), `delete seed sequence ${seq.id}: ${delRes.status()}`).toBeTruthy();
	}

	// Sequence: participant_created + sendHour 0 ⇒ scheduledFor today 00:00 in
	// the retreat TZ ⇒ always due when the engine runs.
	const seqRes = await ctx.post('/api/message-sequences', {
		headers: withCsrf(csrfToken),
		data: {
			name: `E2E Secuencia ${stamp}`,
			retreatId,
			trigger: 'participant_created',
			audience: 'walker',
			isActive: true,
			maxOverdueDays: null,
			steps: Array.from({ length: stepCount }, (_, i) => ({
				stepOrder: i,
				offsetDays: 0,
				sendHour: 0,
				templateType: 'WALKER_WELCOME',
				channel: 'whatsapp',
				recipientTarget: 'participant',
				recipientResponsibility: null,
				condition: null,
			})),
		},
	});
	expect(seqRes.ok(), `create sequence: ${seqRes.status()}`).toBeTruthy();

	// One walker, unique email (never matches a real participant), known phone.
	const rows = parseCsv(fs.readFileSync(CSV_PATH, 'utf8')).slice(0, 1).map((row) => ({
		...row,
		nombre: 'Juan',
		apellidos: 'Seq E2e',
		email: `e2e-seq-${stamp}@test.local`,
		telcelular: '5512345678',
	}));
	expect(rows.length, 'the CSV must have rows').toBeGreaterThan(0);
	const importRes = await ctx.post(`/api/participants/import/${retreatId}`, {
		headers: withCsrf(csrfToken),
		data: { participants: rows },
	});
	expect(importRes.ok(), `import: ${importRes.status()}`).toBeTruthy();

	// Run the engine: due pendings drop into the whatsapp inbox.
	const runRes = await ctx.post(`/api/message-sequences/retreat/${retreatId}/run`, {
		headers: withCsrf(csrfToken),
	});
	expect(runRes.ok(), `run: ${runRes.status()}`).toBeTruthy();
	const queueRes = await ctx.get(`/api/message-sequences/retreat/${retreatId}/queue`);
	const queue = await queueRes.json();
	expect(
		Array.isArray(queue) ? queue.length : (queue.data ?? []).length,
		`inbox must have ${stepCount} item(s): ${JSON.stringify(queue)}`,
	).toBe(stepCount);

	return retreatId;
}

/** Opens the sequences view on the pending tab, logged in, retreat preselected. */
async function openInbox(page: Page, retreatId: string): Promise<void> {
	await page.addInitScript((rid) => {
		localStorage.setItem('preferred-locale', 'es');
		localStorage.setItem('selectedRetreatId', rid);
	}, retreatId);
	await page.goto('/login');
	await page.locator('input[type="email"]').fill(auth!.creds.email);
	await page.locator('input[type="password"]').fill(auth!.creds.password);
	await page.getByRole('button', { name: 'Iniciar Sesión' }).click();
	await page.waitForURL(/\/app/, { timeout: 20000 });

	await page.goto('/app/settings/message-sequences');
	await page.locator('#seq-tab-pending').click();
}

test.describe.serial('Bandeja de Secuencias — realtime e historial', () => {
	test.beforeAll(async ({ baseURL }) => {
		test.skip(!fs.existsSync(CSV_PATH), `CSV fixture not found: ${CSV_PATH}`);
		auth = await login(baseURL!);
		test.skip(!auth, 'no usable credentials (seed the e2e users or set E2E_LOCAL_*)');

		const housesRes = await auth.session.ctx.get('/api/houses');
		const houses = await housesRes.json();
		const first = Array.isArray(houses) ? houses[0] : (houses.data ?? [])[0];
		test.skip(!first?.id, 'no houses in this database — the retreat needs one');
		houseId = first.id;
	});

	test.afterAll(async () => {
		if (auth) {
			for (const id of createdRetreatIds) {
				await auth.session.ctx
					.delete(`/api/retreats/${id}`, { headers: withCsrf(auth.session.csrfToken) })
					.catch(() => {});
			}
			await auth.session.dispose();
		}
	});

	test('realtime: despachar en una vista saca la fila de la otra sin interacción', async ({
		page,
		browser,
	}) => {
		test.slow();
		const retreatId = await createScenario(1);

		// View A: login through the UI, then reuse its session for view B.
		await openInbox(page, retreatId);
		const rowA = page.getByText('Juan Seq E2e');
		await expect(rowA).toBeVisible({ timeout: 15000 });

		const contextB = await (browser as Browser).newContext({
			storageState: await page.context().storageState(),
			locale: 'es-MX',
		});
		const pageB = await contextB.newPage();
		try {
			await pageB.addInitScript((rid) => {
				localStorage.setItem('preferred-locale', 'es');
				localStorage.setItem('selectedRetreatId', rid);
			}, retreatId);
			await pageB.goto('/app/settings/message-sequences');
			await pageB.locator('#seq-tab-pending').click();
			const rowB = pageB.getByText('Juan Seq E2e');
			await expect(rowB).toBeVisible({ timeout: 15000 });

			// Dispatch in A ("Ya lo envié" — avoids window.open to whatsapp.com).
			await page.getByRole('button', { name: 'Ya lo envié' }).first().click();

			// B refreshes on its own via sequences:queue-changed.
			await expect(rowB).toBeHidden({ timeout: 10000 });
			// A's own row is gone too (optimistic removal + echo refetch).
			await expect(rowA).toBeHidden({ timeout: 10000 });
		} finally {
			await contextB.close();
		}
	});

	test('historial: despachar registra la comunicación en el detalle del participante', async ({
		page,
	}) => {
		test.slow();
		// Two steps ⇒ two queued items for the same walker.
		const retreatId = await createScenario(2);

		await openInbox(page, retreatId);
		const row = page.getByText('Juan Seq E2e');
		await expect(row.first()).toBeVisible({ timeout: 15000 });

		// Dispatch the first pending item.
		await page.getByRole('button', { name: 'Ya lo envié' }).first().click();
		await expect(row).toHaveCount(1, { timeout: 10000 });

		// Open the detail of the remaining item; the "Mensajes enviados"
		// section must list the dispatched communication (whatsapp + template).
		await page.getByRole('button', { name: 'Juan Seq E2e' }).click();
		await expect(page.getByText('Mensajes enviados')).toBeVisible({ timeout: 10000 });
		// Queue rows are divs; communication rows are the only <li>s — that
		// scoping avoids matching the template name shown in the queue itself.
		const commRow = page.locator('li', { hasText: walkerWelcomeName });
		await expect(commRow).toHaveCount(1, { timeout: 10000 });
		await expect(commRow).toContainText('whatsapp');
	});
});
