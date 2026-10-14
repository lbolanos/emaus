/**
 * Tests del contrato HTTP de los handlers públicos del enlace personal
 * cifrado de guardias del Santísimo (specs/santisimo-guardia-links):
 *   - GET    /santisimo/public/invite/:token
 *   - POST   /santisimo/public/invite/:token/signup
 *   - DELETE /santisimo/public/invite/:token/signup
 *
 * Verifica el 404 uniforme ante token inválido (sin distinguir la causa), el
 * mapeo de errores del service (Capacity/Disabled/Past → 409 con `error`) y
 * los status de éxito. El comportamiento del service con DB real se prueba
 * en `santisimoInvite.integration.test.ts`; aquí se mockea con spyOn.
 */
import * as santisimoController from '../../controllers/santisimoController';
import {
	santisimoService,
	SantisimoCapacityError,
	SantisimoDisabledError,
	SantisimoNotFoundError,
	SantisimoPastError,
} from '../../services/santisimoService';
import { authorizationService } from '../../middleware/authorization';
import { buildSantisimoInviteToken } from '../../utils/santisimoInviteToken';

const RETREAT_ID = '33333333-3333-4333-8333-333333333333';
const PARTICIPANT_ID = '44444444-4444-4444-8444-444444444444';

describe('santisimoController — public invite handlers', () => {
	const createMockRequest = (overrides: any = {}) => ({
		params: {},
		body: {},
		query: {},
		ip: '203.0.113.99',
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

	let validToken: string;
	const hadSecret = 'INVITE_TOKEN_SECRET' in process.env;
	const prevSecret = process.env.INVITE_TOKEN_SECRET;

	beforeAll(() => {
		process.env.INVITE_TOKEN_SECRET = 'test-controller-secret';
		validToken = buildSantisimoInviteToken(RETREAT_ID, PARTICIPANT_ID);
	});
	afterAll(() => {
		if (hadSecret) process.env.INVITE_TOKEN_SECRET = prevSecret;
		else delete process.env.INVITE_TOKEN_SECRET;
	});

	afterEach(() => {
		// clearAllMocks NO restaura spies (memoria §26): devolver la impl real.
		jest.restoreAllMocks();
	});

	describe('publicGetInvite', () => {
		it('token inválido → 404 uniforme sin llamar al service', async () => {
			const spy = jest.spyOn(santisimoService, 'getInviteData');
			const req = createMockRequest({ params: { token: 'no-es-un-token-valido-1234567890' } });
			const res = createMockResponse();

			await santisimoController.publicGetInvite(req as any, res as any);

			expect(res.status).toHaveBeenCalledWith(404);
			expect(res.json).toHaveBeenCalledWith({ message: 'Invite not found' });
			expect(spy).not.toHaveBeenCalled();
		});

		it('contexto inválido (service null) → 404 uniforme', async () => {
			jest.spyOn(santisimoService, 'getInviteData').mockResolvedValue(null);
			const req = createMockRequest({ params: { token: validToken } });
			const res = createMockResponse();

			await santisimoController.publicGetInvite(req as any, res as any);

			expect(santisimoService.getInviteData).toHaveBeenCalledWith(RETREAT_ID, PARTICIPANT_ID);
			expect(res.status).toHaveBeenCalledWith(404);
			expect(res.json).toHaveBeenCalledWith({ message: 'Invite not found' });
		});

		it('datos del invite → 200 con el body whitelistado', async () => {
			const data = {
				participant: { firstName: 'Test', fullName: 'Test Participant' },
				retreat: { parish: 'P', startDate: new Date(), endDate: new Date() },
				current: null,
				slots: [],
			};
			jest.spyOn(santisimoService, 'getInviteData').mockResolvedValue(data as any);
			const req = createMockRequest({ params: { token: validToken } });
			const res = createMockResponse();

			await santisimoController.publicGetInvite(req as any, res as any);

			expect(res.status).not.toHaveBeenCalledWith(404);
			expect(res.json).toHaveBeenCalledWith(data);
		});
	});

	describe('publicInviteSignup', () => {
		const reqFor = (token: string) =>
			createMockRequest({ params: { token }, body: { slotId: 'slot-1' } });

		it('token inválido → 404 uniforme', async () => {
			const req = reqFor('garbage-token-aaaaaaaaaaaaaaaaaaaaaa');
			const res = createMockResponse();

			await santisimoController.publicInviteSignup(req as any, res as any);

			expect(res.status).toHaveBeenCalledWith(404);
			expect(res.json).toHaveBeenCalledWith({ message: 'Invite not found' });
		});

		it('éxito → 201 { signup } pasando slotId del body e IP', async () => {
			const signup = { slotId: 'slot-1', startTime: new Date(), endTime: new Date() };
			jest.spyOn(santisimoService, 'inviteSignup').mockResolvedValue(signup as any);
			const res = createMockResponse();

			await santisimoController.publicInviteSignup(reqFor(validToken) as any, res as any);

			expect(santisimoService.inviteSignup).toHaveBeenCalledWith(
				RETREAT_ID,
				PARTICIPANT_ID,
				'slot-1',
				'203.0.113.99',
			);
			expect(res.status).toHaveBeenCalledWith(201);
			expect(res.json).toHaveBeenCalledWith({ signup });
		});

		it('mapea Capacity a 409 con error CAPACITY', async () => {
			jest.spyOn(santisimoService, 'inviteSignup').mockRejectedValue(
				new SantisimoCapacityError('Slot full'),
			);
			const res = createMockResponse();

			await santisimoController.publicInviteSignup(reqFor(validToken) as any, res as any);

			expect(res.status).toHaveBeenCalledWith(409);
			expect(res.json).toHaveBeenCalledWith({ message: 'Slot full', error: 'CAPACITY' });
		});

		it('mapea Disabled a 409 con error DISABLED', async () => {
			jest.spyOn(santisimoService, 'inviteSignup').mockRejectedValue(
				new SantisimoDisabledError('Slot disabled'),
			);
			const res = createMockResponse();

			await santisimoController.publicInviteSignup(reqFor(validToken) as any, res as any);

			expect(res.status).toHaveBeenCalledWith(409);
			expect(res.json).toHaveBeenCalledWith({ message: 'Slot disabled', error: 'DISABLED' });
		});

		it('mapea Past a 409 con error PAST', async () => {
			jest.spyOn(santisimoService, 'inviteSignup').mockRejectedValue(
				new SantisimoPastError('Slot passed'),
			);
			const res = createMockResponse();

			await santisimoController.publicInviteSignup(reqFor(validToken) as any, res as any);

			expect(res.status).toHaveBeenCalledWith(409);
			expect(res.json).toHaveBeenCalledWith({ message: 'Slot passed', error: 'PAST' });
		});

		it('NotFound del service → 404', async () => {
			jest
				.spyOn(santisimoService, 'inviteSignup')
				.mockRejectedValue(new SantisimoNotFoundError('Invite not found'));
			const res = createMockResponse();

			await santisimoController.publicInviteSignup(reqFor(validToken) as any, res as any);

			expect(res.status).toHaveBeenCalledWith(404);
			expect(res.json).toHaveBeenCalledWith({ message: 'Invite not found' });
		});
	});

	describe('publicInviteCancel', () => {
		it('token inválido → 404 uniforme', async () => {
			const req = createMockRequest({ params: { token: 'otro-garbage-token-bbbbbb' } });
			const res = createMockResponse();

			await santisimoController.publicInviteCancel(req as any, res as any);

			expect(res.status).toHaveBeenCalledWith(404);
			expect(res.json).toHaveBeenCalledWith({ message: 'Invite not found' });
		});

		it('ok=true → 204 sin body', async () => {
			jest.spyOn(santisimoService, 'inviteCancel').mockResolvedValue(true);
			const req = createMockRequest({ params: { token: validToken } });
			const res = createMockResponse();

			await santisimoController.publicInviteCancel(req as any, res as any);

			expect(santisimoService.inviteCancel).toHaveBeenCalledWith(
				RETREAT_ID,
				PARTICIPANT_ID,
				'203.0.113.99',
			);
			expect(res.status).toHaveBeenCalledWith(204);
			expect(res.send).toHaveBeenCalled();
		});

		it('ok=false → 404 "No signup to cancel"', async () => {
			jest.spyOn(santisimoService, 'inviteCancel').mockResolvedValue(false);
			const req = createMockRequest({ params: { token: validToken } });
			const res = createMockResponse();

			await santisimoController.publicInviteCancel(req as any, res as any);

			expect(res.status).toHaveBeenCalledWith(404);
			expect(res.json).toHaveBeenCalledWith({ message: 'No signup to cancel' });
		});
	});

	describe('getGuardiaLinks (autenticado)', () => {
		it('responde 403 cuando el usuario no tiene acceso al retiro', async () => {
			jest.spyOn(authorizationService, 'hasRetreatAccess').mockResolvedValue(false);
			const req = createMockRequest({ params: { retreatId: RETREAT_ID }, user: { id: 'u1' } });
			const res = createMockResponse();

			await santisimoController.getGuardiaLinks(req as any, res as any);

			expect(res.status).toHaveBeenCalledWith(403);
			expect(res.json).toHaveBeenCalledWith({ message: 'Forbidden' });
		});

		it('responde 200 con { links } del service', async () => {
			jest.spyOn(authorizationService, 'hasRetreatAccess').mockResolvedValue(true);
			const links = { 'p-1': 'https://emaus.cc/santisimo/servidor/abc' };
			jest.spyOn(santisimoService, 'getGuardiaLinks').mockResolvedValue(links);
			const req = createMockRequest({ params: { retreatId: RETREAT_ID }, user: { id: 'u1' } });
			const res = createMockResponse();

			await santisimoController.getGuardiaLinks(req as any, res as any);

			expect(santisimoService.getGuardiaLinks).toHaveBeenCalledWith(RETREAT_ID);
			expect(res.status).not.toHaveBeenCalledWith(403);
			expect(res.json).toHaveBeenCalledWith({ links });
		});
	});
});
