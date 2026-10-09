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

/**
 * Dispatch button of an inbox row. The long label only renders from `sm` up; the
 * mobile projects (Pixel 5 / iPhone 12) see the short one, so match both.
 */
const MARK_SENT_LABEL = /^(Ya lo envié|Enviado)$/;

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
 * Retreat creation also seeds default sequences; they would enqueue their own
 * whatsapp items and pollute the inbox counts. Delete them before any walker
 * exists so their steps never materialize.
 */
async function deleteSeedSequences(retreatId: string): Promise<void> {
	const { ctx, csrfToken } = auth!.session;
	const seqListRes = await ctx.get(`/api/message-sequences/retreat/${retreatId}`);
	const seqList = await seqListRes.json();
	for (const seq of Array.isArray(seqList) ? seqList : (seqList.data ?? [])) {
		const delRes = await ctx.delete(`/api/message-sequences/${seq.id}`, {
			headers: withCsrf(csrfToken),
		});
		expect(delRes.ok(), `delete seed sequence ${seq.id}: ${delRes.status()}`).toBeTruthy();
	}
}

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

	// Seed sequences would pollute the inbox counts (see deleteSeedSequences).
	await deleteSeedSequences(retreatId);

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

/**
 * Disposable retreat for the filter/page-size tests: 6 walkers × 2 steps of
 * TWO known templates (12 items — more than the default page of 10). With
 * `offsetDays` 0 (default) the items are due and land in the whatsapp inbox
 * (queued); with a positive value they materialize as FUTURE pending rows —
 * the "Programadas" tab (v1.1 M6). When `assignWalker` is set, both items of
 * that walker get assigned to the logged-in user so the "Asignado: {name}"
 * option resolves a real displayName through the API (M1).
 */
async function createFilterScenario(
	opts: { assignWalker?: number; offsetDays?: number } = {},
): Promise<{ retreatId: string; myName: string }> {
	const { ctx, csrfToken } = auth!.session;
	const stamp = Date.now();

	const createRes = await ctx.post('/api/retreats', {
		headers: withCsrf(csrfToken),
		data: {
			parish: `E2E Seq Filtros ${stamp}`,
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

	await deleteSeedSequences(retreatId);

	// A fresh retreat gets a copy of every active GLOBAL template; the filter
	// options must show OUR names, so drop the copies of our two types and
	// post our own (one template per type keeps step resolution unambiguous).
	const templateSpecs = [
		{ type: 'WALKER_WELCOME', name: 'E2E Filtro Bienvenida' },
		{ type: 'WALKER_REUNION_INVITATION', name: 'E2E Filtro Reunion' },
	];
	const tplListRes = await ctx.get(`/api/message-templates?retreatId=${retreatId}`);
	const tplList = await tplListRes.json();
	const templates = Array.isArray(tplList) ? tplList : (tplList.data ?? []);
	for (const spec of templateSpecs) {
		for (const tpl of templates.filter((t: any) => t.type === spec.type)) {
			const del = await ctx.delete(`/api/message-templates/${tpl.id}`, {
				headers: withCsrf(csrfToken),
			});
			expect(del.ok(), `delete ${spec.type} template copy: ${del.status()}`).toBeTruthy();
		}
		const post = await ctx.post('/api/message-templates', {
			headers: withCsrf(csrfToken),
			data: {
				name: spec.name,
				type: spec.type,
				scope: 'retreat',
				message: '<p>Hola {participant.firstName}, te esperamos!</p>',
				retreatId,
			},
		});
		expect(post.ok(), `create ${spec.type} template: ${post.status()}`).toBeTruthy();
	}

	// Two steps (one per template). offset 0 + hour 0 ⇒ due immediately; a
	// positive offsetDays keeps them as future pending rows (Programadas).
	const seqRes = await ctx.post('/api/message-sequences', {
		headers: withCsrf(csrfToken),
		data: {
			name: `E2E Secuencia Filtros ${stamp}`,
			retreatId,
			trigger: 'participant_created',
			audience: 'walker',
			isActive: true,
			maxOverdueDays: null,
			steps: templateSpecs.map((spec, i) => ({
				stepOrder: i,
				offsetDays: opts.offsetDays ?? 0,
				sendHour: 0,
				templateType: spec.type,
				channel: 'whatsapp',
				recipientTarget: 'participant',
				recipientResponsibility: null,
				condition: null,
			})),
		},
	});
	expect(seqRes.ok(), `create sequence: ${seqRes.status()}`).toBeTruthy();

	// Six walkers: 6 × 2 steps = 12 queued items (> the default page of 10).
	const walkerCount = 6;
	const rows = parseCsv(fs.readFileSync(CSV_PATH, 'utf8')).slice(0, 1).flatMap((row) =>
		Array.from({ length: walkerCount }, (_, i) => ({
			...row,
			nombre: `Filtro${i + 1}`,
			apellidos: 'E2e',
			email: `e2e-flt-${stamp}-${i + 1}@test.local`,
			telcelular: '5512345678',
		})),
	);
	expect(rows.length, 'the CSV must have rows').toBeGreaterThan(0);
	const importRes = await ctx.post(`/api/participants/import/${retreatId}`, {
		headers: withCsrf(csrfToken),
		data: { participants: rows },
	});
	expect(importRes.ok(), `import: ${importRes.status()}`).toBeTruthy();

	const runRes = await ctx.post(`/api/message-sequences/retreat/${retreatId}/run`, {
		headers: withCsrf(csrfToken),
	});
	expect(runRes.ok(), `run: ${runRes.status()}`).toBeTruthy();

	// Due items land in the whatsapp inbox; future offsets stay as pending
	// rows of the scheduled tab. Either way there must be 12 (6 walkers × 2).
	let items: any[] = [];
	if ((opts.offsetDays ?? 0) > 0) {
		const schedRes = await ctx.get(
			`/api/message-sequences/retreat/${retreatId}/scheduled?statuses=pending&limit=200`,
		);
		const rawSched = await schedRes.json();
		items = rawSched.items ?? rawSched.data ?? [];
		expect(
			items.length,
			`scheduled must have 12 pending rows: ${JSON.stringify(rawSched)}`,
		).toBe(walkerCount * 2);
	} else {
		const queueRes = await ctx.get(`/api/message-sequences/retreat/${retreatId}/queue`);
		const rawQueue = await queueRes.json();
		items = Array.isArray(rawQueue) ? rawQueue : (rawQueue.data ?? []);
		expect(items.length, `inbox must have 12 items: ${JSON.stringify(rawQueue)}`).toBe(
			walkerCount * 2,
		);
	}

	// Assign both items of one walker to the logged-in user — the rows then
	// carry assignedTo + assignedToName resolved server-side (M1).
	let myName = '';
	if (opts.assignWalker) {
		const statusRes = await ctx.get('/api/auth/status');
		const me = await statusRes.json();
		myName = me.displayName;
		const walkerItems = items.filter(
			(it: any) => it.participant?.firstName === `Filtro${opts.assignWalker}`,
		);
		expect(walkerItems.length, 'the walker to assign must have 2 items').toBe(2);
		for (const it of walkerItems) {
			const assignRes = await ctx.post(`/api/message-sequences/scheduled/${it.id}/assign`, {
				headers: withCsrf(csrfToken),
				data: { userId: me.id },
			});
			expect(assignRes.ok(), `assign ${it.id}: ${assignRes.status()}`).toBeTruthy();
		}
	}
	return { retreatId, myName };
}

/**
 * Scope of the pending-tab selects: the inline desktop toolbar, or the "⋯"
 * menu (which has to be opened first) on the mobile projects — the toolbar
 * itself is in the DOM at every breakpoint, but hidden below `sm`.
 * Scoped to the pending panel: every tab has its own "Más acciones" button
 * and `hidden sm:flex` toolbar in the DOM (the tab panels are v-show), so a
 * page-wide locator would hit strict mode violations.
 */
async function queueControls(page: Page, isMobile: boolean | undefined) {
	const panel = page.locator('#seq-panel-pending');
	if (isMobile) {
		await panel.getByRole('button', { name: 'Más acciones' }).click();
		return panel.locator('div.z-20.w-64');
	}
	return panel.locator('div.hidden.sm\\:flex');
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

// Shared setup for every describe below: credentials, a house for the
// disposable retreats, and the retreat cleanup.
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

test.describe.serial('Bandeja de Secuencias — realtime e historial', () => {
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
			await page.getByRole('button', { name: MARK_SENT_LABEL }).first().click();

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
		await page.getByRole('button', { name: MARK_SENT_LABEL }).first().click();
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

test.describe.serial('Bandeja de Secuencias — filtros, por página y acciones de fila (M2/M3)', () => {
	// Name button of every queue row (one per item), for row counting.
	const rowButtons = (page: Page) =>
		page.locator('#seq-panel-pending button[title="Ver detalle del participante"]');

	test('filtros: plantilla con conteo y asignado con nombre del usuario', async ({
		page,
		isMobile,
	}) => {
		test.slow();
		const { retreatId, myName } = await createFilterScenario({ assignWalker: 1 });

		await openInbox(page, retreatId);
		const panel = page.locator('#seq-panel-pending');
		const rows = rowButtons(page);
		await expect(panel.getByText('Filtro1 E2e').first()).toBeVisible({ timeout: 15000 });
		// Scenario sanity: 12 items > default page of 10 ⇒ paginator present.
		await expect(panel.getByText('Página 1 de 2')).toBeVisible();

		const controls = await queueControls(page, isMobile);

		// Template filter: one option per template with its count; picking one
		// leaves its 6 items (one row per walker) and a single page.
		const tplSelect = controls.locator('label', { hasText: 'Plantilla' }).locator('select');
		await tplSelect.selectOption({ label: 'E2E Filtro Bienvenida (6)' });
		await expect(rows).toHaveCount(6);
		await expect(panel.getByText('Página 1 de 2')).toBeHidden();

		// Assignee filter: the dynamic option carries the displayName resolved
		// by the API (M1) and filters by user:<id> — the 2 items that user took.
		await tplSelect.selectOption('all');
		const showSelect = controls.locator('label', { hasText: 'Mostrar' }).locator('select');
		await showSelect.selectOption({ label: `Asignado: ${myName} (2)` });
		await expect(rows).toHaveCount(2);
		await expect(panel.getByText('Filtro1 E2e').first()).toBeVisible();
	});

	test('por página: default 10 pagina; "Todos" muestra todo sin paginador; 5 re-página', async ({
		page,
		isMobile,
	}) => {
		test.slow();
		const { retreatId } = await createFilterScenario();

		await openInbox(page, retreatId);
		const panel = page.locator('#seq-panel-pending');
		const rows = rowButtons(page);
		await expect(rows.first()).toBeVisible({ timeout: 15000 });
		await expect(rows).toHaveCount(10);
		await expect(panel.getByText('Página 1 de 2')).toBeVisible();

		const controls = await queueControls(page, isMobile);
		const sizeSelect = controls.locator('label', { hasText: 'Por página' }).locator('select');

		// "Todos": all 12 rows on one page, the paginator goes away.
		await sizeSelect.selectOption('all');
		await expect(rows).toHaveCount(12);
		await expect(panel.getByText('Página 1 de 2')).toBeHidden();

		// 5: back to paging from page 1.
		await sizeSelect.selectOption('5');
		await expect(rows).toHaveCount(5);
		await expect(panel.getByText('Página 1 de 3')).toBeVisible();
	});

	test('acciones de fila sin mutación: conversación sin text= y ficha en popover', async ({
		page,
	}) => {
		test.slow();
		const retreatId = await createScenario(1);

		// D1 (incident 2026-09-12): "ver conversación" is a plain window.open to
		// the chat — NO state transition. Stub window.open BEFORE navigating so
		// the URL is captured without actually opening whatsapp.com.
		await page.addInitScript(() => {
			const w = window as unknown as {
				__e2eOpened: string[];
				open: (url?: string | URL) => null;
			};
			w.__e2eOpened = [];
			w.open = (url?: string | URL) => {
				w.__e2eOpened.push(String(url));
				return null;
			};
		});
		const mutations: string[] = [];
		page.on('request', (req) => {
			if (
				(req.resourceType() === 'xhr' || req.resourceType() === 'fetch') &&
				/\/scheduled\/[^/]+\/(open|dispatch|skip|assign|retry|discard)/.test(req.url())
			) {
				mutations.push(`${req.method()} ${req.url()}`);
			}
		});

		await openInbox(page, retreatId);
		const conversation = page.locator('button[title="Ver conversación en WhatsApp"]');
		await expect(conversation.first()).toBeVisible({ timeout: 15000 });
		await conversation.first().click();

		const opened: string[] = await page.evaluate(() => (window as any).__e2eOpened);
		expect(opened, 'window.open must fire exactly once').toHaveLength(1);
		expect(opened[0]).toMatch(/^https:\/\/api\.whatsapp\.com\/send\?phone=\d+$/);
		expect(opened[0]).toContain('5512345678');
		expect(opened[0]).not.toContain('text=');

		// Participant card: the ⓘ in the row opens the popover; Escape closes
		// it without leaving the body blocked (known reka-ui failure mode).
		const info = page.locator('button[title="Detalles del participante"]');
		await info.first().click();
		await expect(page.getByRole('button', { name: 'Mandar mensaje' })).toBeVisible({
			timeout: 5000,
		});
		await page.keyboard.press('Escape');
		await expect(page.getByRole('button', { name: 'Mandar mensaje' })).toBeHidden({
			timeout: 5000,
		});
		expect(await page.evaluate(() => document.body.style.pointerEvents)).not.toBe('none');

		// Looking at history or the card moves nothing: zero transition POSTs.
		// (Short pause — asserting absence needs to let the clicks breathe.)
		await page.waitForTimeout(1000);
		expect(mutations, 'no state transitions were issued').toEqual([]);
	});
});

test.describe.serial('Programadas y Problemas — filtros v1.1 y ficha CRM (M6/M7/M5)', () => {
	/**
	 * Desktop toolbar of the issues panel (the pending tab has its own — always
	 * scope to the panel so the locators never cross tabs).
	 */
	const issuesControls = (page: Page) =>
		page.locator('#seq-panel-issues div.hidden.sm\\:flex');

	test('Programadas: filtros server-side (plantilla/asignado) y por página', async ({
		page,
	}) => {
		test.slow();
		// Fase 1 — offsetDays 10 ⇒ future pending rows: the Programadas default.
		const { retreatId: futureId } = await createFilterScenario({ offsetDays: 10 });

		await openInbox(page, futureId);
		await page.locator('#seq-tab-scheduled').click();
		const panel = page.locator('#seq-panel-scheduled');
		// Every walker carries the phone ⇒ one conversation button per row.
		const rows = panel.locator('button[title="Ver conversación en WhatsApp"]');
		await expect(rows.first()).toBeVisible({ timeout: 15000 });
		await expect(rows).toHaveCount(12);

		// Template filter (server-side: option WITHOUT count, the current page
		// would make a partial count) — picking it refetches with templateType.
		const tplSelect = panel.locator('label', { hasText: 'Plantilla' }).locator('select');
		await tplSelect.selectOption({ label: 'E2E Filtro Bienvenida' });
		await expect(rows).toHaveCount(6);
		await tplSelect.selectOption('all');
		await expect(rows).toHaveCount(12);

		// Page size travels as limit: 5 re-pages from 1 (12 rows → 3 pages).
		const sizeSelect = panel.locator('label', { hasText: 'Por página' }).locator('select');
		await sizeSelect.selectOption('5');
		await expect(rows).toHaveCount(5);
		await expect(panel.getByText('Página 1 de 3')).toBeVisible();

		// v1.2 — channel filter (server-side). A second sequence with an email
		// step materializes 6 more pending rows for the same walkers; both share
		// scheduledFor (same trigger/offset/hour), so only the channel span tells
		// them apart — 'Correo' < 'Filtros' also makes the email sequence sort
		// first under the new sequence order below.
		const { ctx, csrfToken } = auth!.session;
		const emailSeqRes = await ctx.post('/api/message-sequences', {
			headers: withCsrf(csrfToken),
			data: {
				name: `E2E Secuencia Correo ${Date.now()}`,
				retreatId: futureId,
				trigger: 'participant_created',
				audience: 'walker',
				isActive: true,
				maxOverdueDays: null,
				steps: [{
					stepOrder: 0,
					offsetDays: 10,
					sendHour: 0,
					templateType: 'WALKER_WELCOME',
					channel: 'email',
					recipientTarget: 'participant',
					recipientResponsibility: null,
					condition: null,
				}],
			},
		});
		expect(emailSeqRes.ok(), `create email sequence: ${emailSeqRes.status()}`).toBeTruthy();
		const rerunRes = await ctx.post(`/api/message-sequences/retreat/${futureId}/run`, {
			headers: withCsrf(csrfToken),
		});
		expect(rerunRes.ok(), `rerun for email rows: ${rerunRes.status()}`).toBeTruthy();

		await sizeSelect.selectOption('50'); // back from 5; the change refetches
		const allRows = panel.locator('div.divide-y > div');
		await expect(rows).toHaveCount(18); // 12 whatsapp + 6 email pending
		const channelSelect = panel
			.locator('label')
			.filter({ hasText: 'Todos los canales' })
			.locator('select');
		await channelSelect.selectOption('email');
		await expect(allRows).toHaveCount(6);
		await expect(allRows.first()).toContainText('Email');
		await channelSelect.selectOption('whatsapp');
		await expect(allRows).toHaveCount(12);
		await channelSelect.selectOption('all');
		await expect(allRows).toHaveCount(18);

		// v1.2 — order by sequence (server-side): groups each sequence's rows
		// (name ASC, scheduledFor as tiebreaker) instead of interleaving them.
		const orderSelect = panel.locator('label', { hasText: 'Ordenar por' }).locator('select');
		await orderSelect.selectOption('sequence');
		await expect(allRows.first()).toContainText('Email');
		await expect(allRows.nth(6)).toContainText('WhatsApp');
		await orderSelect.selectOption('scheduled');

		// Fase 2 — assignee filter. `assign` only accepts QUEUED rows (the
		// inbox, by design), so exercise it through this same server-side view
		// with status "En cola" over a due scenario with walker 1 assigned (M1).
		const { retreatId, myName } = await createFilterScenario({ assignWalker: 1 });
		// A later init script runs after the earlier one and wins on every
		// navigation — no second UI login needed (session cookie stays).
		await page.addInitScript((rid) => {
			localStorage.setItem('selectedRetreatId', rid);
		}, retreatId);
		await page.goto('/app/settings/message-sequences');
		await page.locator('#seq-tab-scheduled').click();

		// Phase 1 left the template/page-size filters on: reset them, then
		// switch the status (each change refetches server-side).
		await tplSelect.selectOption('all');
		await sizeSelect.selectOption('50');
		const statusSelect = panel.locator('label', { hasText: 'Estado' }).locator('select');
		await statusSelect.selectOption('queued');
		await expect(rows).toHaveCount(12);

		const showSelect = panel.locator('label', { hasText: 'Mostrar' }).locator('select');
		await showSelect.selectOption({ label: `Asignado: ${myName}` });
		await expect(rows).toHaveCount(2);
		// The removable chip refetches without the filter.
		const clearButtons = panel.getByRole('button', { name: 'Quitar filtro' });
		await expect(clearButtons).toHaveCount(1);
		await clearButtons.first().click();
		await expect(rows).toHaveCount(12);
	});

	// The issues toolbar is `hidden sm:flex` — on mobile its selects live in
	// the "⋯" menu (covered by vitest); only the desktop toolbar is exercised.
	test.skip(({ isMobile }) => isMobile, 'toolbar desktop de Problemas oculto en móvil');

	test('Problemas: filtro plantilla con conteo y por página (client-side)', async ({
		page,
	}) => {
		test.slow();
		const { retreatId } = await createFilterScenario();

		// Skip 6 Bienvenida + 2 Reunión items via the API → 8 issues: the
		// template filter then has counts to show (M7).
		const { ctx, csrfToken } = auth!.session;
		const queueRes = await ctx.get(`/api/message-sequences/retreat/${retreatId}/queue`);
		const rawQueue = await queueRes.json();
		const queue: any[] = Array.isArray(rawQueue) ? rawQueue : (rawQueue.data ?? []);
		const byTemplate = (type: string) => queue.filter((it: any) => it.templateType === type);
		for (const it of [...byTemplate('WALKER_WELCOME').slice(0, 6), ...byTemplate('WALKER_REUNION_INVITATION').slice(0, 2)]) {
			const skipRes = await ctx.post(`/api/message-sequences/scheduled/${it.id}/skip`, {
				headers: withCsrf(csrfToken),
			});
			expect(skipRes.ok(), `skip ${it.id}: ${skipRes.status()}`).toBeTruthy();
		}

		await openInbox(page, retreatId);
		await page.locator('#seq-tab-issues').click();
		const panel = page.locator('#seq-panel-issues');
		const rows = panel.locator('button[title="Ver detalle del participante"]');
		await expect(rows.first()).toBeVisible({ timeout: 15000 });
		await expect(rows).toHaveCount(8);

		// Template filter with its count (client-side over the loaded issues).
		const controls = issuesControls(page);
		const tplSelect = controls.locator('label', { hasText: 'Plantilla' }).locator('select');
		await tplSelect.selectOption({ label: 'E2E Filtro Bienvenida (6)' });
		await expect(rows).toHaveCount(6);

		// v1.2 — status/channel/sequence filters (client-side). Everything here
		// is skipped+whatsapp: the failed/email negatives and the restore prove
		// the selects actually filter (selectOption also fails if the option
		// is missing, so mounting is covered by the call itself).
		await tplSelect.selectOption('all');
		await expect(rows).toHaveCount(8);
		// NB: the sort select offers "Estado"/"Secuencia" options, so a plain
		// hasText match would hit the "Ordenar por" label too — anchor each
		// locator on the "Todos los …" option, unique to its filter select.
		const statusSelect = controls
			.locator('label')
			.filter({ hasText: 'Todos los estados' })
			.locator('select');
		await statusSelect.selectOption('failed');
		await expect(rows).toHaveCount(0);
		await statusSelect.selectOption('skipped');
		await expect(rows).toHaveCount(8);

		const chanSelect = controls
			.locator('label')
			.filter({ hasText: 'Todos los canales' })
			.locator('select');
		await chanSelect.selectOption('email');
		await expect(rows).toHaveCount(0);
		await chanSelect.selectOption('whatsapp');
		await expect(rows).toHaveCount(8);

		// Sequence options carry their count over the loaded issues; selecting
		// the only present sequence keeps all rows (and renders its chip).
		const seqSelect = controls
			.locator('label')
			.filter({ hasText: 'Todas las secuencias' })
			.locator('select');
		const seqOption = seqSelect.locator('option').filter({ hasText: '(8)' });
		await expect(seqOption).toHaveCount(1);
		await seqSelect.selectOption((await seqOption.getAttribute('value'))!);
		await expect(rows).toHaveCount(8);
		await expect(panel.getByRole('button', { name: 'Quitar filtro' })).toHaveCount(1);

		// Page size paginates what is loaded; "Cargar más" not needed (8 < cap).
		const sizeSelect = controls.locator('label', { hasText: 'Por página' }).locator('select');
		await sizeSelect.selectOption('5');
		await expect(rows).toHaveCount(5);
		await expect(panel.getByText('Página 1 de 2')).toBeVisible();
	});

	test('ficha popover: la nota CRM creada por API aparece (M5) + captura', async ({
		page,
	}) => {
		test.slow();
		const retreatId = await createScenario(1);

		// CRM note via the API — the popover fetches the timeline on open (M5).
		const { ctx, csrfToken } = auth!.session;
		const queueRes = await ctx.get(`/api/message-sequences/retreat/${retreatId}/queue`);
		const rawQueue = await queueRes.json();
		const queue: any[] = Array.isArray(rawQueue) ? rawQueue : (rawQueue.data ?? []);
		expect(queue.length, 'the scenario must have 1 queued item').toBe(1);
		const noteRes = await ctx.post('/api/crm/notes', {
			headers: withCsrf(csrfToken),
			data: {
				retreatId,
				participantId: queue[0].participantId,
				body: 'E2E: confirmó que llega el viernes en la tarde',
			},
		});
		expect(noteRes.ok(), `create note: ${noteRes.status()}`).toBeTruthy();

		await openInbox(page, retreatId);
		// The card is a fixed-position portal capped at 70vh anchored below its
		// row; at the default 720px viewport its bottom edge spills past the
		// window. Grow the viewport FIRST so the whole card fits on screen —
		// the element screenshot then needs no beyond-viewport capture.
		await page.setViewportSize({ width: 1280, height: 960 });
		const info = page.locator('button[title="Detalles del participante"]');
		await expect(info.first()).toBeVisible({ timeout: 15000 });
		await info.first().click();
		// The note body surfaces through the timeline fetch (fetch-on-open).
		await expect(page.getByText('E2E: confirmó que llega el viernes en la tarde')).toBeVisible({
			timeout: 10000,
		});

		// Screenshot for the user (v1.1 M8): the card with notes + palancas.
		// Element capture of the popover box (not the viewport): the box is the
		// unit that shows the whole card, and its internal overflow scrolls the
		// note into view first.
		const note = page.getByText('E2E: confirmó que llega el viernes en la tarde');
		await note.scrollIntoViewIfNeeded();
		const card = page.locator('div.max-h-\\[70vh\\]').first();
		await expect(card).toBeVisible();
		fs.mkdirSync(path.join(__dirname, '..', '..', '.playwright-mcp'), { recursive: true });
		await card.screenshot({
			path: path.join(__dirname, '..', '..', '.playwright-mcp', 'm8-ficha-popover.png'),
		});

		await page.keyboard.press('Escape');
		await expect(page.getByText('E2E: confirmó que llega el viernes en la tarde')).toBeHidden({
			timeout: 5000,
		});
	});
});
