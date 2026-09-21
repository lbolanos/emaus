/**
 * The shirt-order confirmation PATCH, exercised through the real router with the
 * auth middlewares stubbed (pattern of flyerRoutes.simple.test.ts).
 *
 * The service tests already cover the report and the per-retreat semantics. What
 * they cannot see is the wiring: an endpoint that forgets `requirePermission` or
 * `requireRetreatAccess`, or a controller that accepts a non-boolean, looks the
 * same from the service's side. This repo has been bitten by a mis-wired
 * authorization middleware before (the G3 IDOR), so the wiring gets its own test.
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

jest.mock('../../middleware/authentication', () => {
	const actual = jest.requireActual('../../middleware/authentication');
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

import participantHistoryRoutes from '../../routes/retreatParticipant.routes';
import { stripWriteProtectedFields } from '../../services/retreatParticipantService';

const app = express();
app.use(express.json());
app.use(participantHistoryRoutes);

const getDS = () => TestDataFactory['testDataSource'];

async function readConfirmedAt(
	participantId: string,
	retreatId: string,
): Promise<string | null> {
	const rows: { shirtOrderConfirmedAt: string | null }[] = await getDS().query(
		`SELECT shirtOrderConfirmedAt FROM retreat_participants
		 WHERE participantId = ? AND retreatId = ? LIMIT 1`,
		[participantId, retreatId],
	);
	return rows[0]?.shirtOrderConfirmedAt ?? null;
}

describe('PATCH /history/retreat/:retreatId/participant/:participantId/shirt-order-confirmation', () => {
	let retreatId: string;
	let participantId: string;

	const url = () =>
		`/history/retreat/${retreatId}/participant/${participantId}/shirt-order-confirmation`;

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
		const participant = await TestDataFactory.createTestParticipant(retreatId, {
			type: 'server',
		} as any);
		participantId = participant.id;
	});

	describe('wiring', () => {
		it('gates the PATCH behind participant:update + requireRetreatAccess(retreatId)', async () => {
			await request(app).patch(url()).send({ confirmed: true }).expect(200);

			expect(permissionCalls).toEqual(['participant:update']);
			expect(retreatAccessCalls).toEqual(['retreatId']);
		});

		it('rejects without a session (401) and leaves the flag untouched', async () => {
			authenticated = false;
			const response = await request(app).patch(url()).send({ confirmed: true });

			expect(response.status).toBe(401);
			expect(await readConfirmedAt(participantId, retreatId)).toBeNull();
		});

		it('rejects without participant:update (403) and leaves the flag untouched', async () => {
			permitted = false;
			const response = await request(app).patch(url()).send({ confirmed: true });

			expect(response.status).toBe(403);
			expect(await readConfirmedAt(participantId, retreatId)).toBeNull();
		});

		it('rejects when the caller has no access to the retreat (403)', async () => {
			retreatAccessGranted = false;
			const response = await request(app).patch(url()).send({ confirmed: true });

			expect(response.status).toBe(403);
			expect(await readConfirmedAt(participantId, retreatId)).toBeNull();
		});
	});

	describe('controller semantics', () => {
		it('400 when confirmed is not a boolean', async () => {
			const response = await request(app).patch(url()).send({ confirmed: 'yes' });

			expect(response.status).toBe(400);
			expect(await readConfirmedAt(participantId, retreatId)).toBeNull();
		});

		it('400 when confirmed is missing', async () => {
			const response = await request(app).patch(url()).send({});

			expect(response.status).toBe(400);
			expect(await readConfirmedAt(participantId, retreatId)).toBeNull();
		});

		it('400 when the request has no JSON body at all (validateRequest, not a 500)', async () => {
			// No .send(): no Content-Type → express.json skips → req.body is
			// undefined. The route schema rejects it before the controller's
			// destructuring could blow up.
			const response = await request(app).patch(url());

			expect(response.status).toBe(400);
			expect(await readConfirmedAt(participantId, retreatId)).toBeNull();
		});

		it('true stamps the timestamp on the retreat_participants row', async () => {
			const response = await request(app).patch(url()).send({ confirmed: true });

			expect(response.status).toBe(200);
			expect(response.body).toEqual({ ok: true });
			const at = await readConfirmedAt(participantId, retreatId);
			// Raw query: SQLite hands the datetime back as a string, never a Date.
			expect(typeof at).toBe('string');
			expect(at).not.toBe('');
		});

		it('false clears it back to NULL', async () => {
			await request(app).patch(url()).send({ confirmed: true }).expect(200);
			expect(await readConfirmedAt(participantId, retreatId)).not.toBeNull();

			const response = await request(app).patch(url()).send({ confirmed: false });

			expect(response.status).toBe(200);
			expect(await readConfirmedAt(participantId, retreatId)).toBeNull();
		});

		it('answers ok for a participant not in the retreat (0 rows affected — documented bag-made behavior)', async () => {
			const response = await request(app)
				.patch(`/history/retreat/${retreatId}/participant/${uuidv4()}/shirt-order-confirmation`)
				.send({ confirmed: true });

			expect(response.status).toBe(200);
			expect(response.body).toEqual({ ok: true });
			// 0 rows affected, proven: the retreat's real participant stays
			// untouched — this is what catches a WHERE that drops participantId
			// (which would stamp the whole retreat).
			expect(await readConfirmedAt(participantId, retreatId)).toBeNull();
		});
	});

	describe('write-protect on the unscoped history CRUD', () => {
		// PUT/POST /history run the real updateHistoryEntry/createHistoryEntry,
		// which hydrate entities through the router graph — under jest that
		// throws the pre-existing "Class constructor RetreatParticipant cannot
		// be invoked without 'new'" (documented in palancasCountWritePath
		// .test.ts), so the HTTP path is not exercisable here. The strip both
		// CRUD entry points call is what this unit test pins down.
		it('stripWriteProtectedFields drops shirtOrderConfirmedAt and keeps the rest', async () => {
			const payload = stripWriteProtectedFields({
				participantId,
				retreatId,
				roleInRetreat: 'server',
				notes: 'coordinador',
				shirtOrderConfirmedAt: '2020-01-01 00:00:00',
			});

			expect(payload).toEqual({
				participantId,
				retreatId,
				roleInRetreat: 'server',
				notes: 'coordinador',
			});
			expect('shirtOrderConfirmedAt' in payload).toBe(false);
		});

		it('is a no-op on payloads that never carried the field', async () => {
			expect(stripWriteProtectedFields({ notes: 'hola' })).toEqual({ notes: 'hola' });
			expect(stripWriteProtectedFields({})).toEqual({});
		});
	});
});
