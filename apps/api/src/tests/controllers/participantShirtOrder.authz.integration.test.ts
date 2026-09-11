import { setupTestDatabase, teardownTestDatabase, clearTestData } from '../test-setup';
import { TestDataFactory } from '../test-utils/testDataFactory';
import { AppDataSource } from '@/data-source';
import { Retreat } from '@/entities/retreat.entity';
import { Participant } from '@/entities/participant.entity';
import { RetreatShirtType } from '@/entities/retreatShirtType.entity';
import { ParticipantShirtSize } from '@/entities/participantShirtSize.entity';
import { getParticipantShirtOrder } from '@/controllers/participantController';
import { authorizationService } from '@/middleware/authorization';

function mockRes() {
	const res: any = { statusCode: 200, body: undefined };
	res.status = (code: number) => {
		res.statusCode = code;
		return res;
	};
	res.json = (body: any) => {
		res.body = body;
		return res;
	};
	return res;
}

/**
 * Authorization for `GET /participants/:id/shirt-order` (the endpoint that
 * feeds MANUAL message sending: MessageDialog/BaseMessageTemplateModal build
 * the participant from an object already in memory, without `shirtSizes`
 * loaded, so without this fetch {participant.shirtOrderSummary}/
 * {participant.shirtCharge} would come back empty).
 *
 * `retreatId` arrives as a query param (not as the route's `:retreatId`), so
 * `requireRetreatAccess` doesn't cover it — the controller validates with
 * `ensureRetreatAccess` inline. This test closes that gate: missing
 * `retreatId` is 400, no access to the retreat is 403, and with access it
 * resolves the real summary.
 */
describe('getParticipantShirtOrder — authorization and resolution', () => {
	let retreatA: Retreat;
	let retreatB: Retreat;
	let participant: Participant;

	beforeAll(async () => {
		await setupTestDatabase();
	});
	afterAll(async () => {
		await teardownTestDatabase();
	});

	beforeEach(async () => {
		await clearTestData();
		jest.restoreAllMocks();
		retreatA = await TestDataFactory.createTestRetreat({});
		retreatB = await TestDataFactory.createTestRetreat({});
		participant = await TestDataFactory.createTestParticipant(retreatA.id, {
			type: 'server',
		} as any);

		const shirtRepo = AppDataSource.getRepository(RetreatShirtType);
		const shirt = await shirtRepo.save(
			shirtRepo.create({
				retreatId: retreatA.id,
				name: 'Playera',
				price: 150,
				sortOrder: 0,
			} as any),
		);
		await AppDataSource.getRepository(ParticipantShirtSize).save(
			AppDataSource.getRepository(ParticipantShirtSize).create({
				participantId: participant.id,
				shirtTypeId: shirt.id,
				size: 'M',
			}),
		);
	});

	it('400 when retreatId is missing', async () => {
		const req: any = { params: { id: participant.id }, query: {}, user: { id: 'someone' } };
		const res = mockRes();
		await getParticipantShirtOrder(req, res, jest.fn());
		expect(res.statusCode).toBe(400);
	});

	it('401 without an authenticated user', async () => {
		const req: any = {
			params: { id: participant.id },
			query: { retreatId: retreatA.id },
		};
		const res = mockRes();
		await getParticipantShirtOrder(req, res, jest.fn());
		expect(res.statusCode).toBe(401);
	});

	it('403 when the caller has no access to the requested retreat', async () => {
		jest.spyOn(authorizationService, 'hasRetreatAccess').mockResolvedValue(false);
		const req: any = {
			params: { id: participant.id },
			query: { retreatId: retreatA.id },
			user: { id: 'someone' },
		};
		const res = mockRes();
		await getParticipantShirtOrder(req, res, jest.fn());
		expect(res.statusCode).toBe(403);
	});

	it('200 with the resolved summary when the caller does have access', async () => {
		jest.spyOn(authorizationService, 'hasRetreatAccess').mockResolvedValue(true);
		const req: any = {
			params: { id: participant.id },
			query: { retreatId: retreatA.id },
			user: { id: 'someone' },
		};
		const res = mockRes();
		await getParticipantShirtOrder(req, res, jest.fn());
		expect(res.statusCode).toBe(200);
		expect(res.body.shirtCharge).toBe(150);
		expect(res.body.shirtOrderSummary).toContain('Playera');
		expect(res.body.shirtOrderSummary).toContain('talla M');
	});

	it('does not mix in the order from ANOTHER retreat even if the caller has access there too', async () => {
		jest.spyOn(authorizationService, 'hasRetreatAccess').mockResolvedValue(true);
		const req: any = {
			params: { id: participant.id },
			query: { retreatId: retreatB.id },
			user: { id: 'someone' },
		};
		const res = mockRes();
		await getParticipantShirtOrder(req, res, jest.fn());
		expect(res.statusCode).toBe(200);
		expect(res.body.shirtCharge).toBe(0);
		expect(res.body.shirtOrderSummary).toBe('Aún no has configurado tus tallas');
	});
});
