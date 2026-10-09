import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';
import { loginAs, withCsrf, E2E_USERS, type AuthSession } from './helpers/auth';

/**
 * E2E of POST /api/participants/import/:retreatId driven by a real CSV export.
 *
 * Regression coverage for the 2026-08-24 Celaya incident: the bed/table assignment
 * phase wrote tableId through `.update(Participant)`, but tableId is a virtual field
 * whose column lives on retreat_participants. TypeORM threw at runtime
 * (`Property "tableId" was not found in "Participant"`), the API answered 400 and the
 * assignment transaction rolled back — participants imported, no beds, no tables.
 *
 * The bug only fires when the target retreat has tables, because that is when
 * assignTableToWalker returns an id. Creating a retreat seeds 5 tables, so the path
 * is covered as long as we assert the tables are there before importing.
 *
 * The retreat is created and deleted inside the test, and every row gets a unique
 * email, so it never touches real data: createParticipant matches by email across
 * retreats and would otherwise MOVE an existing participant into the test retreat.
 */

// Defaults to the anonymised fixture; point E2E_IMPORT_CSV at a real export to
// reproduce a specific incident.
const CSV_PATH =
	process.env.E2E_IMPORT_CSV || path.join(__dirname, 'fixtures', 'participant-import-sample.csv');

// A retreat materializes its beds from a house. Overridable for other databases.
const HOUSE_ID = process.env.E2E_IMPORT_HOUSE_ID || '';

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
 * Logs in with whatever credentials this database has. CI seeds the e2e users; a
 * developer machine running a copy of production does not, so it falls back to
 * credentials supplied via env. Never hardcode credentials here.
 *
 * Returns null only when no credentials work, which is a legitimate skip. A 429
 * THROWS instead: /auth/login allows 10 attempts per 15 minutes, and running the
 * suite a few times in a row burns through them. Skipping on that would report a
 * green run for a test that never executed — the failure mode this distinction
 * exists to prevent.
 */
const login = async (baseURL: string): Promise<AuthSession | null> => {
	const local =
		process.env.E2E_LOCAL_EMAIL && process.env.E2E_LOCAL_PASSWORD
			? { email: process.env.E2E_LOCAL_EMAIL, password: process.env.E2E_LOCAL_PASSWORD }
			: null;
	let rateLimited = false;
	for (const creds of [E2E_USERS.superadmin, local]) {
		if (!creds) continue;
		try {
			return await loginAs(baseURL, creds);
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
};

test.describe('Import participants from CSV', () => {
	test('assigns every imported walker a table and a bed', async ({ baseURL }) => {
		test.skip(!fs.existsSync(CSV_PATH), `CSV fixture not found: ${CSV_PATH}`);

		const session = await login(baseURL!);
		test.skip(!session, 'no usable credentials (seed the e2e users or set E2E_LOCAL_*)');
		const { ctx, csrfToken } = session!;

		let retreatId: string | undefined;
		try {
			// Pick a house big enough that beds are not the limiting factor.
			let houseId = HOUSE_ID;
			if (!houseId) {
				const housesRes = await ctx.get('/api/houses');
				expect(housesRes.ok(), `list houses: ${housesRes.status()}`).toBeTruthy();
				const body = await housesRes.json();
				const houses = Array.isArray(body) ? body : (body.data ?? []);
				const sorted = [...houses].sort(
					(a: { capacity?: number }, b: { capacity?: number }) =>
						(b.capacity ?? 0) - (a.capacity ?? 0),
				);
				houseId = sorted[0]?.id;
			}
			expect(houseId, 'a house is required to create the retreat').toBeTruthy();

			const stamp = Date.now();
			const createRes = await ctx.post('/api/retreats', {
				headers: withCsrf(csrfToken),
				data: {
					parish: `E2E Import ${stamp}`,
					startDate: '2030-03-08',
					endDate: '2030-03-10',
					houseId,
				},
			});
			expect(createRes.ok(), `create retreat: ${createRes.status()}`).toBeTruthy();
			retreatId = (await createRes.json()).id;
			expect(retreatId).toBeTruthy();

			// New retreats are private; the import refuses to register into one
			// that is not accepting registrations (RETREAT_NOT_PUBLIC).
			const publishRes = await ctx.put(`/api/retreats/${retreatId}`, {
				headers: withCsrf(csrfToken),
				data: { isPublic: true },
			});
			expect(publishRes.ok(), `publish retreat: ${publishRes.status()}`).toBeTruthy();

			// Tables must exist or assignTableToWalker returns undefined and the
			// regression path is never exercised.
			const tablesRes = await ctx.get(`/api/tables/retreat/${retreatId}`);
			expect(tablesRes.ok(), `list tables: ${tablesRes.status()}`).toBeTruthy();
			const tablesBody = await tablesRes.json();
			const tables = Array.isArray(tablesBody) ? tablesBody : (tablesBody.data ?? []);
			expect(
				tables.length,
				'the retreat must have tables for this test to mean anything',
			).toBeGreaterThan(0);

			// Unique emails so no existing participant gets moved into this retreat.
			const rows = parseCsv(fs.readFileSync(CSV_PATH, 'utf8')).map((row, index) => ({
				...row,
				email: `e2e-import-${stamp}-${index}@test.local`,
			}));
			expect(rows.length, 'the CSV must have rows').toBeGreaterThan(0);

			const importRes = await ctx.post(`/api/participants/import/${retreatId}`, {
				headers: withCsrf(csrfToken),
				data: { participants: rows },
			});
			const raw = await importRes.text();
			expect(importRes.ok(), `import failed (${importRes.status()}): ${raw}`).toBeTruthy();

			const result = JSON.parse(raw);
			expect(result.skippedCount ?? 0, `rows were skipped: ${raw}`).toBe(0);
			expect(result.importedCount, `unexpected result: ${raw}`).toBe(rows.length);

			// The point of the test: the assignment phase ran to completion instead
			// of rolling back, so walkers land on a table and on a bed.
			const listRes = await ctx.get(`/api/participants?retreatId=${retreatId}`);
			expect(listRes.ok(), `list participants: ${listRes.status()}`).toBeTruthy();
			const listBody = await listRes.json();
			const participants = Array.isArray(listBody) ? listBody : (listBody.data ?? []);
			const walkers = participants.filter((p: { type?: string }) => p.type === 'walker');
			expect(walkers.length).toBe(rows.length);

			const withTable = walkers.filter((p: { tableId?: string | null }) => !!p.tableId);
			expect(withTable.length, 'every imported walker should get a table').toBe(walkers.length);

			const withBed = walkers.filter(
				(p: { retreatBed?: unknown; bedId?: string | null }) => !!p.retreatBed || !!p.bedId,
			);
			expect(withBed.length, 'every imported walker should get a bed').toBe(walkers.length);
		} finally {
			if (retreatId) {
				await ctx
					.delete(`/api/retreats/${retreatId}`, { headers: withCsrf(csrfToken) })
					.catch(() => undefined);
			}
			await session!.dispose();
		}
	});

	/**
	 * Guards the role-conflict skip (troubleshooting §25.8, 2026-10-02).
	 *
	 * An angelito registered their brother as a walker with their own email. The
	 * import matched the row by email and overwrote the angelito's record with the
	 * walker's data, on every re-import — twice in prod. The importer now skips a
	 * row whose declared tipousuario sits on the other side of the walker/team line,
	 * and still updates rows that declare the same side or declare nothing.
	 */
	test('skips a walker row whose email belongs to a team member', async ({ baseURL }) => {
		test.skip(!fs.existsSync(CSV_PATH), `CSV fixture not found: ${CSV_PATH}`);
		const session = await login(baseURL!);
		test.skip(!session, 'no usable credentials (seed the e2e users or set E2E_LOCAL_*)');
		const { ctx, csrfToken } = session!;

		let retreatId: string | undefined;
		try {
			const housesRes = await ctx.get('/api/houses');
			const housesBody = await housesRes.json();
			const houses = Array.isArray(housesBody) ? housesBody : (housesBody.data ?? []);
			const stamp = Date.now();
			const createRes = await ctx.post('/api/retreats', {
				headers: withCsrf(csrfToken),
				data: {
					parish: `E2E Role ${stamp}`,
					startDate: '2030-07-08',
					endDate: '2030-07-10',
					houseId: houses[0]?.id,
				},
			});
			expect(createRes.ok(), `create retreat: ${createRes.status()}`).toBeTruthy();
			retreatId = (await createRes.json()).id;
			const publishRes = await ctx.put(`/api/retreats/${retreatId}`, {
				headers: withCsrf(csrfToken),
				data: { isPublic: true },
			});
			expect(publishRes.ok(), `publish retreat: ${publishRes.status()}`).toBeTruthy();

			// One template row; payment columns cleared so no payment noise.
			const template = { ...parseCsv(fs.readFileSync(CSV_PATH, 'utf8'))[0], montopago: null, fechapago: null };
			const row = (tipousuario: string | null, nombre: string, email: string) => ({
				...template,
				tipousuario,
				nombre,
				apellidos: 'E2E ROL',
				email,
			});
			const angelitoEmail = `e2e-role-${stamp}-angelito@test.local`;
			const serverEmail = `e2e-role-${stamp}-server@test.local`;
			const walkerEmail = `e2e-role-${stamp}-walker@test.local`;

			const importRows = async (rows: unknown[]) => {
				const res = await ctx.post(`/api/participants/import/${retreatId}`, {
					headers: withCsrf(csrfToken),
					data: { participants: rows },
				});
				const raw = await res.text();
				expect(res.ok(), `import failed (${res.status()}): ${raw}`).toBeTruthy();
				return JSON.parse(raw);
			};
			const roster = async () => {
				const res = await ctx.get(`/api/participants?retreatId=${retreatId}`);
				expect(res.ok(), `list participants: ${res.status()}`).toBeTruthy();
				const body = await res.json();
				const list: Array<{ email: string; firstName: string; type: string }> = Array.isArray(body)
					? body
					: (body.data ?? []);
				return new Map(list.map((p) => [p.email.toLowerCase(), p]));
			};

			const seeded = await importRows([
				row('5', 'ANGELITO', angelitoEmail),
				row('0', 'SERVIDOR', serverEmail),
				row('3', 'CAMINANTE', walkerEmail),
			]);
			expect(seeded.importedCount, JSON.stringify(seeded)).toBe(3);
			const before = await roster();
			expect(before.get(angelitoEmail)?.type).toBe('partial_server');
			expect(before.get(serverEmail)?.type).toBe('server');
			expect(before.get(walkerEmail)?.type).toBe('walker');

			const result = await importRows([
				// Borrowed emails: a walker row carrying a team member's address.
				row('3', 'INVITADO', angelitoEmail),
				row('3', 'OTRO INVITADO', serverEmail),
				// Same side of the line: a plain update.
				row('3', 'CAMINANTE EDITADO', walkerEmail),
			]);
			expect(result.skippedCount, JSON.stringify(result)).toBe(2);
			expect(result.updatedCount, JSON.stringify(result)).toBe(1);
			const reasons = (result.skippedDetails as Array<{ reason: string; name?: string }>)
				.map((d) => `${d.name}: ${d.reason}`)
				.join('\n');
			expect(reasons).toContain('ANGELITO E2E ROL');
			expect(reasons).toContain('angelito');
			expect(reasons).toContain('SERVIDOR E2E ROL');

			// The point of the test: the team members' records were not overwritten.
			const after = await roster();
			expect(after.get(angelitoEmail)?.firstName).toBe('ANGELITO');
			expect(after.get(angelitoEmail)?.type).toBe('partial_server');
			expect(after.get(serverEmail)?.firstName).toBe('SERVIDOR');
			expect(after.get(serverEmail)?.type).toBe('server');
			expect(after.get(walkerEmail)?.firstName).toBe('CAMINANTE EDITADO');

			// A row without tipousuario declares no role (the importer only defaults
			// it to "server"), so it must keep updating, not trip the guard.
			const undeclared = await importRows([row(null, 'CAMINANTE SIN TIPO', walkerEmail)]);
			expect(undeclared.skippedCount ?? 0, JSON.stringify(undeclared)).toBe(0);
			expect(undeclared.updatedCount, JSON.stringify(undeclared)).toBe(1);
			const last = await roster();
			expect(last.get(walkerEmail)?.firstName).toBe('CAMINANTE SIN TIPO');
			expect(last.get(walkerEmail)?.type).toBe('walker');
		} finally {
			if (retreatId) {
				await ctx
					.delete(`/api/retreats/${retreatId}`, { headers: withCsrf(csrfToken) })
					.catch(() => undefined);
			}
			await session!.dispose();
		}
	});

	/**
	 * Guards troubleshooting §25.10 (2026-10-09).
	 *
	 * The parish export carries no palancas, scholarship or single-room column:
	 * those are captured in emaus.cc. The importer mapped an absent Y/N column to
	 * false and the update branch wrote it, so every re-import reset "Palancas
	 * solicitadas" (and the scholarship with its amount, and the single-room
	 * request) to "No" for walkers already enrolled — seven times between Oct 1
	 * and 8 in Buen Despacho. A missing or blank cell is now "no data"; an
	 * explicit S/N still applies, and a brand-new enrollment still starts at No.
	 */
	test('re-import keeps palancas, scholarship and single room captured in emaus.cc', async ({
		baseURL,
	}) => {
		test.skip(!fs.existsSync(CSV_PATH), `CSV fixture not found: ${CSV_PATH}`);
		const session = await login(baseURL!);
		test.skip(!session, 'no usable credentials (seed the e2e users or set E2E_LOCAL_*)');
		const { ctx, csrfToken } = session!;

		let retreatId: string | undefined;
		try {
			const housesRes = await ctx.get('/api/houses');
			const housesBody = await housesRes.json();
			const houses = Array.isArray(housesBody) ? housesBody : (housesBody.data ?? []);
			const stamp = Date.now();
			const createRes = await ctx.post('/api/retreats', {
				headers: withCsrf(csrfToken),
				data: {
					parish: `E2E Keep ${stamp}`,
					startDate: '2030-09-08',
					endDate: '2030-09-10',
					houseId: houses[0]?.id,
				},
			});
			expect(createRes.ok(), `create retreat: ${createRes.status()}`).toBeTruthy();
			retreatId = (await createRes.json()).id;
			const publishRes = await ctx.put(`/api/retreats/${retreatId}`, {
				headers: withCsrf(csrfToken),
				data: { isPublic: true },
			});
			expect(publishRes.ok(), `publish retreat: ${publishRes.status()}`).toBeTruthy();

			// Shape of the parish CSV: none of the three columns, no payment.
			const {
				becado: _becado,
				palancaspedidas: _palancaspedidas,
				habitacionindividual: _habitacionindividual,
				...template
			} = parseCsv(fs.readFileSync(CSV_PATH, 'utf8'))[0];
			const email = `e2e-keep-${stamp}@test.local`;
			const parishRow = {
				...template,
				tipousuario: '3',
				nombre: 'CAMINANTE',
				apellidos: 'E2E KEEP',
				email,
				montopago: null,
				fechapago: null,
			};

			const importRows = async (rows: unknown[]) => {
				const res = await ctx.post(`/api/participants/import/${retreatId}`, {
					headers: withCsrf(csrfToken),
					data: { participants: rows },
				});
				const raw = await res.text();
				expect(res.ok(), `import failed (${res.status()}): ${raw}`).toBeTruthy();
				return JSON.parse(raw);
			};
			type Walker = {
				id: string;
				email: string;
				palancasRequested?: boolean | null;
				isScholarship?: boolean | null;
				scholarshipAmount?: number | null;
				requestsSingleRoom?: boolean | null;
			};
			const walker = async (): Promise<Walker> => {
				const res = await ctx.get(`/api/participants?retreatId=${retreatId}`);
				expect(res.ok(), `list participants: ${res.status()}`).toBeTruthy();
				const body = await res.json();
				const list: Walker[] = Array.isArray(body) ? body : (body.data ?? []);
				const found = list.find((p) => p.email.toLowerCase() === email);
				expect(found, `walker ${email} not in the roster`).toBeTruthy();
				return found!;
			};

			const created = await importRows([parishRow]);
			expect(created.importedCount, JSON.stringify(created)).toBe(1);
			const fresh = await walker();
			// A new enrollment still starts at No (the list's Yes/No filter is exact).
			expect(fresh.palancasRequested).toBe(false);
			expect(fresh.isScholarship).toBe(false);
			expect(fresh.requestsSingleRoom).toBe(false);

			// What the palancas coordinator does in the edit form.
			const markRes = await ctx.put(`/api/participants/${fresh.id}`, {
				headers: withCsrf(csrfToken),
				data: {
					contextRetreatId: retreatId,
					palancasRequested: true,
					isScholarship: true,
					scholarshipAmount: 500,
					requestsSingleRoom: true,
				},
			});
			expect(markRes.ok(), `mark: ${markRes.status()} ${await markRes.text()}`).toBeTruthy();
			const marked = await walker();
			expect(marked.palancasRequested).toBe(true);
			expect(marked.isScholarship).toBe(true);
			expect(Number(marked.scholarshipAmount)).toBe(500);
			expect(marked.requestsSingleRoom).toBe(true);

			// The point of the test: the next parish export leaves them alone.
			const reimported = await importRows([parishRow]);
			expect(reimported.updatedCount, JSON.stringify(reimported)).toBe(1);
			const kept = await walker();
			expect(kept.palancasRequested, 'palancas solicitadas').toBe(true);
			expect(kept.isScholarship, 'beca').toBe(true);
			expect(Number(kept.scholarshipAmount), 'monto de la beca').toBe(500);
			expect(kept.requestsSingleRoom, 'cuarto individual').toBe(true);

			// A file that does carry the columns still decides.
			const explicit = await importRows([
				{ ...parishRow, palancaspedidas: 'N', becado: 'N', habitacionindividual: 'N' },
			]);
			expect(explicit.updatedCount, JSON.stringify(explicit)).toBe(1);
			const overridden = await walker();
			expect(overridden.palancasRequested).toBe(false);
			expect(overridden.isScholarship).toBe(false);
			expect(overridden.requestsSingleRoom).toBe(false);
		} finally {
			if (retreatId) {
				await ctx
					.delete(`/api/retreats/${retreatId}`, { headers: withCsrf(csrfToken) })
					.catch(() => undefined);
			}
			await session!.dispose();
		}
	});

	/**
	 * Guards the fix for the transaction race (2026-08-25).
	 *
	 * With the asynchronous `sqlite` driver, TypeORM drove SQLite over a single shared
	 * connection and every statement yielded the event loop, so a long import raced
	 * against any other write hitting the API at the same moment. Rows died one by one
	 * with either
	 *   - `SQLITE_ERROR: cannot start a transaction within a transaction`, or
	 *   - `Transaction is not started yet, start transaction before committing…`
	 * and the endpoint still answered 200 — the loss was silent, visible only as
	 * skippedCount. Measured at the time: 3 of 3 runs lost rows.
	 *
	 * The synchronous `better-sqlite3` driver closes the window (statements resolve
	 * in place, so the intermediate awaits are microtasks Node drains before serving
	 * another request). If this test starts failing, check whether the driver in
	 * `apps/api/src/database/config.ts` went back to `sqlite`, or whether a
	 * transaction grew an await that is not a database call — either one reopens it.
	 * Background: specs/sqlite-sync-driver/.
	 */
	test('survives concurrent writes without losing rows', async ({ baseURL }) => {
		test.skip(!fs.existsSync(CSV_PATH), `CSV fixture not found: ${CSV_PATH}`);
		const session = await login(baseURL!);
		test.skip(!session, 'no usable credentials (seed the e2e users or set E2E_LOCAL_*)');
		const { ctx, csrfToken } = session!;

		let retreatId: string | undefined;
		try {
			const housesRes = await ctx.get('/api/houses');
			const housesBody = await housesRes.json();
			const houses = Array.isArray(housesBody) ? housesBody : (housesBody.data ?? []);
			const stamp = Date.now();
			const createRes = await ctx.post('/api/retreats', {
				headers: withCsrf(csrfToken),
				data: {
					parish: `E2E Race ${stamp}`,
					startDate: '2030-05-08',
					endDate: '2030-05-10',
					houseId: houses[0]?.id,
				},
			});
			retreatId = (await createRes.json()).id;
			await ctx.put(`/api/retreats/${retreatId}`, {
				headers: withCsrf(csrfToken),
				data: { isPublic: true },
			});

			const csv = parseCsv(fs.readFileSync(CSV_PATH, 'utf8'));

			// Losing the race is probabilistic, so one round is not enough to trust a
			// pass: with the old driver a single round caught it only ~2 times out of 3.
			// Three rounds make a false green unlikely enough to be worth relying on.
			for (let round = 0; round < 3; round++) {
				const rows = csv.map((row, index) => ({
					...row,
					email: `e2e-race-${stamp}-${round}-${index}@test.local`,
				}));

				// Import while hammering the API with other writes on the same connection.
				const [importRes] = await Promise.all([
					ctx.post(`/api/participants/import/${retreatId}`, {
						headers: withCsrf(csrfToken),
						data: { participants: rows },
					}),
					...Array.from({ length: 25 }, (_, i) =>
						ctx.post('/api/tables', {
							headers: withCsrf(csrfToken),
							data: { name: `Race ${round}-${i}`, retreatId },
						}),
					),
				]);

				const raw = await importRes.text();
				const result = JSON.parse(raw);
				expect(
					result.skippedCount ?? 0,
					`round ${round + 1}: rows lost to a transaction race: ${raw}`,
				).toBe(0);
				expect(result.importedCount, `round ${round + 1}`).toBe(rows.length);
			}
		} finally {
			if (retreatId) {
				await ctx
					.delete(`/api/retreats/${retreatId}`, { headers: withCsrf(csrfToken) })
					.catch(() => undefined);
			}
			await session!.dispose();
		}
	});
});
