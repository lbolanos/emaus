/**
 * Cierre de la tarea de protección de datos de salud: `code-review` encontró
 * dos endpoints, fuera del diff original, que devolvían la ficha completa de
 * salud (medicación, dieta, discapacidad, notas, 12 campos de contacto de
 * emergencia) gateados solo por acceso genérico al retiro/comunidad, no por
 * `participant:health` — el mismo permiso que ya protege `/participants`.
 *
 * - `retreatParticipantController.getParticipantsByRetreatController` /
 *   `getParticipantsByRoleController`: la relación `RetreatParticipant.participant`
 *   traía el Participant sin recortar.
 * - `communityController.getPotentialMembers`: el picker de "agregar miembro"
 *   traía el Participant completo del retiro para armar candidatos.
 *
 * Database-independent: mockea los servicios y espía `authorizationService`.
 */

jest.mock('typeorm', () => {
	const actual = jest.requireActual('typeorm');
	return {
		...actual,
		DataSource: jest.fn().mockImplementation(() => ({
			getRepository: jest.fn().mockReturnValue({
				findOne: jest.fn(),
				find: jest.fn(),
				save: jest.fn(),
				create: jest.fn(),
			}),
			initialize: jest.fn().mockResolvedValue(undefined),
			isInitialized: true,
			transaction: jest.fn(),
		})),
	};
});

jest.mock('../../data-source', () => ({
	AppDataSource: {
		getRepository: jest.fn().mockReturnValue({
			findOne: jest.fn(),
			find: jest.fn(),
			save: jest.fn(),
			create: jest.fn(),
		}),
		initialize: jest.fn().mockResolvedValue(undefined),
		isInitialized: true,
		transaction: jest.fn(),
	},
}));

const mockGetParticipantsByRetreat = jest.fn();
const mockGetParticipantsByRole = jest.fn();
jest.mock('../../services/retreatParticipantService', () => ({
	getParticipantsByRetreat: (...args: unknown[]) => mockGetParticipantsByRetreat(...args),
	getParticipantsByRole: (...args: unknown[]) => mockGetParticipantsByRole(...args),
}));

jest.mock('../../realtime', () => ({ emitReceptionBagMade: jest.fn() }));

const mockGetPotentialMembers = jest.fn();
jest.mock('../../services/communityService', () => ({
	CommunityService: jest.fn().mockImplementation(() => ({
		getPotentialMembers: (...args: unknown[]) => mockGetPotentialMembers(...args),
	})),
}));

import { Request, Response } from 'express';
import { authorizationService } from '../../middleware/authorization';
import {
	getParticipantsByRetreatController,
	getParticipantsByRoleController,
} from '../../controllers/retreatParticipantController';
import { CommunityController } from '../../controllers/communityController';

const createMockReq = (overrides: Partial<Request> = {}): Request =>
	({
		params: {},
		query: {},
		body: {},
		user: { id: 'user-1' },
		...overrides,
	}) as unknown as Request;

const createMockRes = () => {
	const res: Partial<Response> = {};
	res.status = jest.fn().mockReturnValue(res);
	res.json = jest.fn().mockReturnValue(res);
	return res as Response;
};

const retreatParticipantWithHealth = {
	id: 'rp-1',
	retreatId: 'retreat-1',
	roleInRetreat: 'walker',
	participant: {
		id: 'p-1',
		firstName: 'Ana',
		medicationDetails: 'Losartán',
		emergencyContact1Name: 'Carlos Ruiz',
	},
};

describe('fuga de salud fuera del diff original — endpoints gateados solo por acceso genérico', () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	describe('getParticipantsByRetreatController', () => {
		it('recorta la salud del Participant anidado sin participant:health', async () => {
			jest.spyOn(authorizationService, 'hasPermission').mockResolvedValue(false);
			mockGetParticipantsByRetreat.mockResolvedValue([retreatParticipantWithHealth]);

			const req = createMockReq({ params: { retreatId: 'retreat-1' } });
			const res = createMockRes();
			await getParticipantsByRetreatController(req, res);

			const body = (res.json as jest.Mock).mock.calls[0][0];
			expect(body[0].participant).not.toHaveProperty('medicationDetails');
			expect(body[0].participant).not.toHaveProperty('emergencyContact1Name');
			expect(body[0].participant.firstName).toBe('Ana');
		});

		it('conserva la salud del Participant anidado con participant:health', async () => {
			jest.spyOn(authorizationService, 'hasPermission').mockResolvedValue(true);
			mockGetParticipantsByRetreat.mockResolvedValue([retreatParticipantWithHealth]);

			const req = createMockReq({ params: { retreatId: 'retreat-1' } });
			const res = createMockRes();
			await getParticipantsByRetreatController(req, res);

			const body = (res.json as jest.Mock).mock.calls[0][0];
			expect(body[0].participant.medicationDetails).toBe('Losartán');
		});
	});

	describe('getParticipantsByRoleController', () => {
		it('recorta la salud del Participant anidado sin participant:health', async () => {
			jest.spyOn(authorizationService, 'hasPermission').mockResolvedValue(false);
			mockGetParticipantsByRole.mockResolvedValue([retreatParticipantWithHealth]);

			const req = createMockReq({ params: { retreatId: 'retreat-1', role: 'walker' } });
			const res = createMockRes();
			await getParticipantsByRoleController(req, res);

			const body = (res.json as jest.Mock).mock.calls[0][0];
			expect(body[0].participant).not.toHaveProperty('medicationDetails');
		});
	});

	describe('CommunityController.getPotentialMembers', () => {
		const participantWithHealth = {
			id: 'p-1',
			firstName: 'Ana',
			medicationDetails: 'Losartán',
			emergencyContact1Name: 'Carlos Ruiz',
			alreadyMember: false,
		};

		it('recorta la salud del candidato sin participant:health', async () => {
			jest.spyOn(authorizationService, 'hasPermission').mockResolvedValue(false);
			mockGetPotentialMembers.mockResolvedValue([participantWithHealth]);

			const req = createMockReq({
				params: { id: 'community-1' },
				query: { retreatId: 'retreat-1' },
			});
			const res = createMockRes();
			await CommunityController.getPotentialMembers(req, res);

			const body = (res.json as jest.Mock).mock.calls[0][0];
			expect(body[0]).not.toHaveProperty('medicationDetails');
			expect(body[0]).not.toHaveProperty('emergencyContact1Name');
			expect(body[0].firstName).toBe('Ana');
		});

		it('conserva la salud del candidato con participant:health', async () => {
			jest.spyOn(authorizationService, 'hasPermission').mockResolvedValue(true);
			mockGetPotentialMembers.mockResolvedValue([participantWithHealth]);

			const req = createMockReq({
				params: { id: 'community-1' },
				query: { retreatId: 'retreat-1' },
			});
			const res = createMockRes();
			await CommunityController.getPotentialMembers(req, res);

			const body = (res.json as jest.Mock).mock.calls[0][0];
			expect(body[0].medicationDetails).toBe('Losartán');
		});

		it('sigue devolviendo 400 si falta retreatId, sin llamar al service', async () => {
			const req = createMockReq({ params: { id: 'community-1' }, query: {} });
			const res = createMockRes();
			await CommunityController.getPotentialMembers(req, res);

			expect(res.status).toHaveBeenCalledWith(400);
			expect(mockGetPotentialMembers).not.toHaveBeenCalled();
		});
	});
});
