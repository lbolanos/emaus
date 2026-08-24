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
 */
const login = async (baseURL: string): Promise<AuthSession | null> => {
	const local =
		process.env.E2E_LOCAL_EMAIL && process.env.E2E_LOCAL_PASSWORD
			? { email: process.env.E2E_LOCAL_EMAIL, password: process.env.E2E_LOCAL_PASSWORD }
			: null;
	for (const creds of [E2E_USERS.superadmin, local]) {
		if (!creds) continue;
		const session = await loginAs(baseURL, creds).catch(() => null);
		if (session) return session;
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
	 * Known open bug, reproduced locally on 2026-08-24 (3 of 3 runs).
	 *
	 * TypeORM drives SQLite over a single shared connection, so a long import that
	 * opens transactions races against any other write hitting the API at the same
	 * moment. Rows die individually with either
	 *   - `SQLITE_ERROR: cannot start a transaction within a transaction`, or
	 *   - `Transaction is not started yet, start transaction before committing…`
	 * and the endpoint still answers 200 — the loss is silent, visible only as
	 * skippedCount in the response.
	 *
	 * Remove the fixme once imports survive concurrent writes (the roadmap fix is
	 * the synchronous better-sqlite3 driver; see the db-production-resilience skill).
	 */
	test.fixme('survives concurrent writes without losing rows', async ({ baseURL }) => {
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

			const rows = parseCsv(fs.readFileSync(CSV_PATH, 'utf8')).map((row, index) => ({
				...row,
				email: `e2e-race-${stamp}-${index}@test.local`,
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
						data: { name: `Race ${i}`, retreatId },
					}),
				),
			]);

			const raw = await importRes.text();
			const result = JSON.parse(raw);
			expect(result.skippedCount ?? 0, `rows lost to a transaction race: ${raw}`).toBe(0);
			expect(result.importedCount).toBe(rows.length);
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
