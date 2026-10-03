/**
 * The walker estimate endpoints of the shirts report (PUT/DELETE
 * /retreats/:retreatId/shirt-order-estimate), exercised through the real router
 * with the auth middlewares stubbed (pattern of shirtReport.routes.simple.test.ts).
 *
 * The estimate changes what the retreat buys, so it is gated like a retreat edit
 * (retreat:update) and scoped to the retreat. The service tests cannot see that
 * wiring, nor that only the schema's fields reach the stored JSON.
 */
import express from 'express';
import request from 'supertest';
import { v4 as uuidv4 } from 'uuid';
import { setupTestDatabase, teardownTestDatabase, clearTestData } from '../test-setup';
import { TestDataFactory } from '../test-utils/testDataFactory';

const permissionCalls: string[] = [];
const retreatAccessCalls: string[] = [];
let authenticated = true;
let permitted = true;
let retreatAccessGranted = true;

jest.mock('../../middleware/isAuthenticated', () => {
	const actual = jest.requireActual('../../middleware/isAuthenticated');
	return {
		...actual,
		isAuthenticated: (req: any, res: any, next: any) => {
			if (!authenticated) return res.status(401).json({ message: 'Unauthorized' });
			req.user = { id: 'u1' };
			next();
		},
	};
});

jest.mock('../../middleware/authorization', () => {
	const actual = jest.requireActual('../../middleware/authorization');
	return {
		...actual,
		requirePermission: (permission: string) => (_req: any, res: any, next: any) => {
			permissionCalls.push(permission);
			if (!permitted) return res.status(403).json({ message: 'Forbidden' });
			next();
		},
		requireRetreatAccess: (paramName: string) => (_req: any, res: any, next: any) => {
			retreatAccessCalls.push(paramName);
			if (!retreatAccessGranted) return res.status(403).json({ message: 'Forbidden' });
			next();
		},
	};
});

import shirtTypeRoutes from '../../routes/shirtTypeRoutes';
import { update as updateRetreat } from '../../services/retreatService';

const app = express();
app.use(express.json());
app.use(shirtTypeRoutes);

const getDS = () => TestDataFactory['testDataSource'];

async function readEstimate(retreatId: string): Promise<unknown> {
	const rows: { shirtOrderEstimate: string | null }[] = await getDS().query(
		`SELECT shirtOrderEstimate FROM retreat WHERE id = ? LIMIT 1`,
		[retreatId],
	);
	const raw = rows[0]?.shirtOrderEstimate ?? null;
	return raw == null ? null : JSON.parse(raw);
}

describe('PUT/DELETE /retreats/:retreatId/shirt-order-estimate', () => {
	let retreatId: string;

	const url = (id = retreatId) => `/retreats/${id}/shirt-order-estimate`;
	const validBody = { expectedWalkers: 40, estimatedShirts: { M: 10, G: 12 } };

	beforeAll(async () => {
		await setupTestDatabase();
	});

	afterAll(async () => {
		await teardownTestDatabase();
	});

	beforeEach(async () => {
		await clearTestData();
		jest.clearAllMocks();
		permissionCalls.length = 0;
		retreatAccessCalls.length = 0;
		authenticated = true;
		permitted = true;
		retreatAccessGranted = true;

		const retreat = await TestDataFactory.createTestRetreat({});
		retreatId = retreat.id;
	});

	describe('wiring', () => {
		it('gates PUT behind retreat:update + requireRetreatAccess(retreatId)', async () => {
			await request(app).put(url()).send(validBody).expect(200);

			expect(permissionCalls).toEqual(['retreat:update']);
			expect(retreatAccessCalls).toEqual(['retreatId']);
		});

		it('gates DELETE behind retreat:update + requireRetreatAccess(retreatId)', async () => {
			await request(app).delete(url()).expect(200);

			expect(permissionCalls).toEqual(['retreat:update']);
			expect(retreatAccessCalls).toEqual(['retreatId']);
		});

		it('rejects without a session (401) and stores nothing', async () => {
			authenticated = false;
			await request(app).put(url()).send(validBody).expect(401);
			expect(await readEstimate(retreatId)).toBeNull();
		});

		it('rejects without retreat:update (403) and stores nothing', async () => {
			permitted = false;
			await request(app).put(url()).send(validBody).expect(403);
			expect(await readEstimate(retreatId)).toBeNull();
		});

		it('rejects when the caller has no access to the retreat (403) and stores nothing', async () => {
			retreatAccessGranted = false;
			await request(app).put(url()).send(validBody).expect(403);
			expect(await readEstimate(retreatId)).toBeNull();
		});
	});

	describe('validation', () => {
		it.each([
			['a negative expectedWalkers', { expectedWalkers: -1 }],
			['a fractional expectedWalkers', { expectedWalkers: 2.5 }],
			['a non-numeric piece count', { estimatedShirts: { M: 'diez' } }],
			['a negative piece count', { estimatedShirts: { M: -3 } }],
			['a nested per-type shape', { estimatedShirts: { t1: { M: 3 } } }],
			[
				'more sizes than any garment has',
				{ estimatedShirts: Object.fromEntries(Array.from({ length: 31 }, (_, i) => [`T${i}`, 1])) },
			],
		])('400 on %s, nothing stored', async (_label, body) => {
			const response = await request(app).put(url()).send(body);

			expect(response.status).toBe(400);
			expect(await readEstimate(retreatId)).toBeNull();
		});
		// No "no body at all" case: body-parser sets req.body = {} even without a
		// JSON payload, so it is the empty-estimate case under persistence.
	});

	describe('persistence', () => {
		it('PUT stores the estimate (verified by direct query)', async () => {
			const response = await request(app).put(url()).send(validBody);

			expect(response.status).toBe(200);
			expect(response.body).toEqual({ ok: true });
			expect(await readEstimate(retreatId)).toEqual(validBody);
		});

		it('only the schema fields reach the stored JSON (assignParsedBody)', async () => {
			await request(app)
				.put(url())
				.send({ ...validBody, injected: '<script>', expectedWalkersNote: 'x' })
				.expect(200);

			expect(await readEstimate(retreatId)).toEqual(validBody);
		});

		it('an empty body stores an empty estimate (no expected count, no pieces)', async () => {
			await request(app).put(url()).send({}).expect(200);

			expect(await readEstimate(retreatId)).toEqual({ expectedWalkers: null, estimatedShirts: {} });
		});

		it('DELETE clears it back to NULL', async () => {
			await request(app).put(url()).send(validBody).expect(200);
			expect(await readEstimate(retreatId)).not.toBeNull();

			await request(app).delete(url()).expect(200);
			expect(await readEstimate(retreatId)).toBeNull();
		});

		it('404 for a retreat that does not exist', async () => {
			await request(app).put(url(uuidv4())).send(validBody).expect(404);
			await request(app).delete(url(uuidv4())).expect(404);
		});
	});

	describe('write-protect on the general retreat update', () => {
		// PUT /retreats/:id hands the raw body to retreatService.update, and the
		// retreat edit form re-sends the whole DTO: a stale copy of the estimate
		// there would silently revert the one saved from the shirts report.
		it('retreatService.update ignores shirtOrderEstimate in its payload', async () => {
			await request(app).put(url()).send(validBody).expect(200);

			await updateRetreat(retreatId, {
				parish: 'Parroquia editada',
				shirtOrderEstimate: { expectedWalkers: 1 },
			} as any);

			expect(await readEstimate(retreatId)).toEqual(validBody);
			const rows: { parish: string }[] = await getDS().query(
				`SELECT parish FROM retreat WHERE id = ?`,
				[retreatId],
			);
			expect(rows[0].parish).toBe('Parroquia editada');
		});
	});
});
