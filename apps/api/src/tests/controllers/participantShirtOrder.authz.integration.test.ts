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
 * Autorización de `GET /participants/:id/shirt-order` (endpoint que alimenta
 * el envío MANUAL de mensajes: MessageDialog/BaseMessageTemplateModal arman
 * el participante desde un objeto ya en memoria, sin `shirtSizes` cargado, así
 * que sin este fetch {participant.shirtOrderSummary}/{participant.shirtCharge}
 * quedan vacías).
 *
 * El `retreatId` llega por query param (no como `:retreatId` de la ruta), así
 * que `requireRetreatAccess` no lo cubre — el controller valida con
 * `ensureRetreatAccess` dentro. Este test cierra ese gate: sin `retreatId` es
 * 400, sin acceso al retiro es 403, y con acceso resuelve el resumen real.
 */
describe('getParticipantShirtOrder — autorización y resolución', () => {
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

	it('400 cuando falta retreatId', async () => {
		const req: any = { params: { id: participant.id }, query: {}, user: { id: 'someone' } };
		const res = mockRes();
		await getParticipantShirtOrder(req, res, jest.fn());
		expect(res.statusCode).toBe(400);
	});

	it('401 sin usuario autenticado', async () => {
		const req: any = {
			params: { id: participant.id },
			query: { retreatId: retreatA.id },
		};
		const res = mockRes();
		await getParticipantShirtOrder(req, res, jest.fn());
		expect(res.statusCode).toBe(401);
	});

	it('403 cuando el caller no tiene acceso al retiro pedido', async () => {
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

	it('200 con el resumen resuelto cuando el caller sí tiene acceso', async () => {
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

	it('no mezcla el pedido de OTRO retiro aunque el caller tenga acceso ahí también', async () => {
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
