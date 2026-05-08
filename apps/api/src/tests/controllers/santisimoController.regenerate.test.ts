import * as santisimoController from '../../controllers/santisimoController';
import { santisimoService } from '../../services/santisimoService';
import { retreatScheduleService } from '../../services/retreatScheduleService';
import { authorizationService } from '../../middleware/authorization';

/**
 * Tests del endpoint POST /api/santisimo/retreats/:retreatId/slots/regenerate-from-schedule
 *
 * Verifica el contrato HTTP del controller `regenerateFromSchedule`:
 *   - 403 cuando el usuario no tiene acceso al retreat
 *   - 200 con el body correcto cuando todo funciona
 *   - Mapeo de errores del service (NotFound, etc.) al status correcto
 *
 * Mockea el authorizationService y los services subyacentes para aislar
 * la lógica del controller — el comportamiento del service ya se prueba
 * en `santisimoMaterializeAutogen.test.ts`.
 */
describe('santisimoController.regenerateFromSchedule', () => {
	const createMockRequest = (overrides: any = {}) => ({
		params: { retreatId: 'retreat-id-123' },
		body: {},
		query: {},
		user: { id: 'user-id-1' },
		...overrides,
	});

	const createMockResponse = () => {
		const res: any = {
			status: jest.fn().mockReturnThis(),
			json: jest.fn().mockReturnThis(),
			send: jest.fn().mockReturnThis(),
		};
		return res;
	};

	beforeEach(() => {
		jest.clearAllMocks();
	});

	test('responde 403 cuando el usuario no tiene acceso al retreat', async () => {
		jest.spyOn(authorizationService, 'hasRetreatAccess').mockResolvedValue(false);

		const req = createMockRequest();
		const res = createMockResponse();

		await santisimoController.regenerateFromSchedule(req as any, res as any);

		expect(authorizationService.hasRetreatAccess).toHaveBeenCalledWith(
			'user-id-1',
			'retreat-id-123',
		);
		expect(res.status).toHaveBeenCalledWith(403);
		expect(res.json).toHaveBeenCalledWith({ message: 'Forbidden' });
	});

	test('responde 200 con { deleted, created, replacedItems, slots } cuando todo va bien', async () => {
		jest.spyOn(authorizationService, 'hasRetreatAccess').mockResolvedValue(true);
		jest
			.spyOn(retreatScheduleService, 'regenerateSantisimoSlotsFromSchedule')
			.mockResolvedValue({ deleted: 5, created: 8, replacedItems: 1, removedTemplateItems: 0 });
		const fakeSlots = [
			{
				id: 's1',
				retreatId: 'retreat-id-123',
				startTime: new Date('2026-06-05T22:00:00.000Z'),
				endTime: new Date('2026-06-05T23:00:00.000Z'),
				capacity: 1,
				isDisabled: false,
				signups: [],
				signedUpCount: 0,
			},
		] as any;
		jest.spyOn(santisimoService, 'listSlotsForRetreat').mockResolvedValue(fakeSlots);

		const req = createMockRequest();
		const res = createMockResponse();

		await santisimoController.regenerateFromSchedule(req as any, res as any);

		expect(retreatScheduleService.regenerateSantisimoSlotsFromSchedule)
			.toHaveBeenCalledWith('retreat-id-123');
		expect(santisimoService.listSlotsForRetreat).toHaveBeenCalledWith('retreat-id-123');
		expect(res.status).toHaveBeenCalledWith(200);
		expect(res.json).toHaveBeenCalledWith({
			deleted: 5,
			created: 8,
			replacedItems: 1,
			removedTemplateItems: 0,
			slots: fakeSlots,
		});
	});

	test('responde 200 con created=0 cuando el retreat no tiene items santísimo', async () => {
		jest.spyOn(authorizationService, 'hasRetreatAccess').mockResolvedValue(true);
		jest
			.spyOn(retreatScheduleService, 'regenerateSantisimoSlotsFromSchedule')
			.mockResolvedValue({ deleted: 0, created: 0, replacedItems: 0, removedTemplateItems: 0 });
		jest.spyOn(santisimoService, 'listSlotsForRetreat').mockResolvedValue([]);

		const req = createMockRequest();
		const res = createMockResponse();

		await santisimoController.regenerateFromSchedule(req as any, res as any);

		expect(res.status).toHaveBeenCalledWith(200);
		expect(res.json).toHaveBeenCalledWith({
			deleted: 0,
			created: 0,
			replacedItems: 0,
			removedTemplateItems: 0,
			slots: [],
		});
	});

	test('mapea errores del service a 500 con el mensaje', async () => {
		jest.spyOn(authorizationService, 'hasRetreatAccess').mockResolvedValue(true);
		jest
			.spyOn(retreatScheduleService, 'regenerateSantisimoSlotsFromSchedule')
			.mockRejectedValue(new Error('boom'));

		const req = createMockRequest();
		const res = createMockResponse();

		await santisimoController.regenerateFromSchedule(req as any, res as any);

		expect(res.status).toHaveBeenCalledWith(500);
		expect(res.json).toHaveBeenCalledWith({ message: 'boom' });
	});

	test('responde 403 sin invocar al service cuando hay user pero falla la auth', async () => {
		jest.spyOn(authorizationService, 'hasRetreatAccess').mockResolvedValue(false);
		const serviceSpy = jest.spyOn(
			retreatScheduleService,
			'regenerateSantisimoSlotsFromSchedule',
		);

		const req = createMockRequest();
		const res = createMockResponse();

		await santisimoController.regenerateFromSchedule(req as any, res as any);

		expect(serviceSpy).not.toHaveBeenCalled();
		expect(res.status).toHaveBeenCalledWith(403);
	});
});
