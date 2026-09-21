/**
 * The shirt report GET, exercised through the real router with the auth
 * middlewares stubbed (pattern of shirtOrderConfirmation.routes.simple.test.ts).
 *
 * The report now carries cellPhone/country for every server of the retreat, so
 * the route must be retreat-scoped: participant:read alone is a global permission
 * (seeded for the regular role) and would let any authenticated user enumerate
 * another retreat's phones. The service tests cannot see that wiring.
 */
import express from 'express';
import request from 'supertest';
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

const app = express();
app.use(express.json());
app.use(shirtTypeRoutes);

describe('GET /retreats/:retreatId/shirt-report', () => {
	let retreatId: string;

	const url = () => `/retreats/${retreatId}/shirt-report`;

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

	it('gates the report behind participant:read + requireRetreatAccess(retreatId)', async () => {
		await request(app).get(url()).expect(200);

		expect(permissionCalls).toEqual(['participant:read']);
		expect(retreatAccessCalls).toEqual(['retreatId']);
	});

	it('rejects without a session (401)', async () => {
		authenticated = false;
		await request(app).get(url()).expect(401);
	});

	it('rejects without participant:read (403)', async () => {
		permitted = false;
		await request(app).get(url()).expect(403);
	});

	it('rejects when the caller has no access to the retreat (403)', async () => {
		retreatAccessGranted = false;
		await request(app).get(url()).expect(403);
	});
});
