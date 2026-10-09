/**
 * The quick-phone PATCH, exercised through the real router with the auth
 * middlewares stubbed (pattern of shirtOrderConfirmation.routes.simple.test.ts).
 *
 * The controller and service tests already cover validation and canonization in
 * isolation. What they cannot see is the wiring: the narrow Zod schema must strip
 * the body down to the three phones + retreatId before the controller runs, and
 * the endpoint must sit behind requirePermission('participant:update') +
 * requireRetreatAccess('retreatId', 'body') like its sibling attendance-confirmation.
 * This repo has been bitten by a mis-wired authorization middleware before
 * (the G3 IDOR), so the wiring gets its own test.
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

// participantRoutes mounts its session gate from this module (not
// middleware/authentication), and the real one calls req.isAuthenticated()
// (passport), which does not exist on a bare express() app → 500 on every hit.
jest.mock('../../middleware/isAuthenticated', () => ({
	isAuthenticated: (req: any, res: any, next: any) => {
		if (!authenticated) return res.status(401).json({ message: 'Unauthorized' });
		req.user = { id: 'u1' };
		next();
	},
}));

jest.mock('../../middleware/authorization', () => {
	const actual = jest.requireActual('../../middleware/authorization');
	return {
		...actual,
		requirePermission: (permission: string) => (_req: any, res: any, next: any) => {
			permissionCalls.push(permission);
			if (!permitted) return res.status(403).json({ message: 'Forbidden' });
			next();
		},
		requireRetreatAccess: (paramName: string, source?: string) => (_req: any, res: any, next: any) => {
			retreatAccessCalls.push(source ? `${paramName}:${source}` : paramName);
			if (!retreatAccessGranted) return res.status(403).json({ message: 'Forbidden' });
			next();
		},
	};
});

import participantRoutes from '../../routes/participantRoutes';

const app = express();
app.use(express.json());
// The router defines relative paths ('/:id/phones'); index.ts mounts it under
// /participants, so the test app must do the same or nothing matches.
app.use('/participants', participantRoutes);

const getDS = () => TestDataFactory['testDataSource'];

async function readPhones(participantId: string) {
	const rows: {
		cellPhone: string | null;
		emergencyContact1CellPhone: string | null;
		emergencyContact2CellPhone: string | null;
	}[] = await getDS().query(
		`SELECT cellPhone, emergencyContact1CellPhone, emergencyContact2CellPhone
		 FROM participants WHERE id = ? LIMIT 1`,
		[participantId],
	);
	return rows[0];
}

describe('PATCH /participants/:id/phones', () => {
	let retreatId: string;
	let participantId: string;

	const url = () => `/participants/${participantId}/phones`;

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
		// The factory hardcodes country 'Test Country', which phone.ts cannot
		// resolve to an ISO code (no length rule, no prefix stripping). The real
		// flow validates against the retreat house's country, so pin it to a
		// known one and let the endpoint canonize for real.
		await getDS().query(`UPDATE house SET country = 'México' WHERE id = ?`, [
			retreat.houseId,
		]);
		const participant = await TestDataFactory.createTestParticipant(retreatId, {
			type: 'walker',
		} as any);
		participantId = participant.id;
	});

	describe('wiring', () => {
		it("gates the PATCH behind participant:update + requireRetreatAccess('retreatId', 'body')", async () => {
			await request(app)
				.patch(url())
				.send({ retreatId, cellPhone: '5512345678' })
				.expect(200);

			expect(permissionCalls).toEqual(['participant:update']);
			expect(retreatAccessCalls).toEqual(['retreatId:body']);
		});

		it('rejects without a session (401) and leaves the phones untouched', async () => {
			authenticated = false;
			const response = await request(app)
				.patch(url())
				.send({ retreatId, cellPhone: '5512345678' });

			expect(response.status).toBe(401);
			expect((await readPhones(participantId)).cellPhone).toBe('1234567890');
		});

		it('rejects without participant:update (403)', async () => {
			permitted = false;
			const response = await request(app)
				.patch(url())
				.send({ retreatId, cellPhone: '5512345678' });

			expect(response.status).toBe(403);
			expect((await readPhones(participantId)).cellPhone).toBe('1234567890');
		});

		it('rejects when the caller has no access to the retreat (403)', async () => {
			retreatAccessGranted = false;
			const response = await request(app)
				.patch(url())
				.send({ retreatId, cellPhone: '5512345678' });

			expect(response.status).toBe(403);
			expect((await readPhones(participantId)).cellPhone).toBe('1234567890');
		});
	});

	describe('schema (validateRequest with assignParsedBody)', () => {
		it('400 when the request has no JSON body at all (not a 500)', async () => {
			const response = await request(app).patch(url());

			expect(response.status).toBe(400);
			expect((await readPhones(participantId)).cellPhone).toBe('1234567890');
		});

		it('400 when retreatId is missing from the body', async () => {
			const response = await request(app).patch(url()).send({ cellPhone: '5512345678' });

			expect(response.status).toBe(400);
			expect((await readPhones(participantId)).cellPhone).toBe('1234567890');
		});

		it("strips fields outside the schema: firstName sent alongside the phones survives", async () => {
			const response = await request(app)
				.patch(url())
				.send({ retreatId, cellPhone: '5512345678', firstName: 'Hacker' });

			expect(response.status).toBe(200);
			const rows: { firstName: string }[] = await getDS().query(
				`SELECT firstName FROM participants WHERE id = ? LIMIT 1`,
				[participantId],
			);
			expect(rows[0].firstName).toBe('Test');
		});
	});

	describe('controller semantics over HTTP', () => {
		it("canonizes '+52 55 1234 5678' to the national number and answers narrow", async () => {
			const response = await request(app)
				.patch(url())
				.send({ retreatId, cellPhone: '+52 55 1234 5678' });

			expect(response.status).toBe(200);
			expect(response.body).toEqual({
				id: participantId,
				cellPhone: '5512345678',
				emergencyContact1CellPhone: '0987654321',
				emergencyContact2CellPhone: null,
			});
			expect((await readPhones(participantId)).cellPhone).toBe('5512345678');
		});

		it("400 with '' in cellPhone and does not write", async () => {
			const response = await request(app).patch(url()).send({ retreatId, cellPhone: '' });

			expect(response.status).toBe(400);
			expect((await readPhones(participantId)).cellPhone).toBe('1234567890');
		});

		it("400 with a wrong-length MX number and does not write", async () => {
			const response = await request(app)
				.patch(url())
				.send({ retreatId, cellPhone: '123' });

			expect(response.status).toBe(400);
			expect((await readPhones(participantId)).cellPhone).toBe('1234567890');
		});

		it("'' in emergencyContact2CellPhone clears it to NULL", async () => {
			await getDS().query(
				`UPDATE participants SET emergencyContact2CellPhone = '5522222222' WHERE id = ?`,
				[participantId],
			);

			const response = await request(app)
				.patch(url())
				.send({ retreatId, emergencyContact2CellPhone: '' });

			expect(response.status).toBe(200);
			expect((await readPhones(participantId)).emergencyContact2CellPhone).toBeNull();
		});

		it('404 for a participant outside the retreat', async () => {
			const response = await request(app)
				.patch(`/participants/${uuidv4()}/phones`)
				.send({ retreatId, cellPhone: '5512345678' });

			expect(response.status).toBe(404);
			// And the retreat's real participant stays untouched.
			expect((await readPhones(participantId)).cellPhone).toBe('1234567890');
		});
	});
});
