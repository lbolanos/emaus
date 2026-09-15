/**
 * Fase 2 de protección de datos de salud: cada vez que la API entrega los
 * campos sensibles (medicación, dieta, discapacidad, notas, contactos de
 * emergencia) a alguien con `participant:health`, o cuando el cliente avisa
 * que los exportó a archivo, debe quedar un evento en `domain_audit_log`.
 * Antes de esto, ninguna lectura ni exportación de la ficha médica dejaba
 * rastro — solo las escrituras se auditaban.
 *
 * Database-independent: mockea el repo/servicio y espía domainAuditService.log.
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

const mockFindAllParticipants = jest.fn();
const mockFindParticipantById = jest.fn();
const mockUpdateParticipant = jest.fn();
jest.mock('../../services/participantService', () => ({
	findAllParticipants: mockFindAllParticipants,
	findParticipantById: mockFindParticipantById,
	updateParticipant: mockUpdateParticipant,
}));

const mockDomainAuditLog = jest.fn();
jest.mock('../../services/domainAuditService', () => ({
	domainAuditService: { log: mockDomainAuditLog },
	DomainAuditAction: {
		PARTICIPANT_HEALTH_VIEW: 'participant.health_view',
		PARTICIPANT_HEALTH_EXPORT: 'participant.health_export',
	},
}));

import { Request, Response, NextFunction } from 'express';
import { authorizationService } from '../../middleware/authorization';
import {
	getAllParticipants,
	getParticipantById,
	updateParticipant,
	logHealthDataExport,
} from '../../controllers/participantController';

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

const mockNext: NextFunction = jest.fn();

const participantWithHealth = {
	id: 'p-1',
	retreatId: 'retreat-1',
	medicationDetails: 'Losartán',
	emergencyContact1Name: 'Ana Ruiz',
};

describe('auditoría de lectura/exportación de datos de salud', () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	describe('getAllParticipants', () => {
		it('registra PARTICIPANT_HEALTH_VIEW cuando el caller tiene participant:health y hay resultados', async () => {
			jest.spyOn(authorizationService, 'hasPermission').mockResolvedValue(true);
			mockFindAllParticipants.mockResolvedValue([participantWithHealth]);

			const req = createMockReq({ query: { retreatId: 'retreat-1' } });
			const res = createMockRes();
			await getAllParticipants(req, res, mockNext);

			expect(mockDomainAuditLog).toHaveBeenCalledWith(
				expect.objectContaining({
					action: 'participant.health_view',
					resourceType: 'participant',
					retreatId: 'retreat-1',
					metadata: expect.objectContaining({ endpoint: 'list', count: 1 }),
				}),
			);
		});

		it('NO registra nada sin participant:health (y la respuesta viene sin salud)', async () => {
			jest.spyOn(authorizationService, 'hasPermission').mockResolvedValue(false);
			mockFindAllParticipants.mockResolvedValue([participantWithHealth]);

			const req = createMockReq({ query: {} });
			const res = createMockRes();
			await getAllParticipants(req, res, mockNext);

			expect(mockDomainAuditLog).not.toHaveBeenCalled();
			const body = (res.json as jest.Mock).mock.calls[0][0];
			expect(body[0]).not.toHaveProperty('medicationDetails');
		});

		it('NO registra nada si la lista viene vacía, aun con el permiso', async () => {
			jest.spyOn(authorizationService, 'hasPermission').mockResolvedValue(true);
			mockFindAllParticipants.mockResolvedValue([]);

			const req = createMockReq({ query: {} });
			const res = createMockRes();
			await getAllParticipants(req, res, mockNext);

			expect(mockDomainAuditLog).not.toHaveBeenCalled();
		});
	});

	describe('getParticipantById', () => {
		it('registra PARTICIPANT_HEALTH_VIEW con el id del participante', async () => {
			jest.spyOn(authorizationService, 'hasPermission').mockResolvedValue(true);
			mockFindParticipantById.mockResolvedValue(participantWithHealth);

			const req = createMockReq({ params: { id: 'p-1' } });
			const res = createMockRes();
			await getParticipantById(req, res, mockNext);

			expect(mockDomainAuditLog).toHaveBeenCalledWith(
				expect.objectContaining({
					action: 'participant.health_view',
					resourceId: 'p-1',
					retreatId: 'retreat-1',
					metadata: expect.objectContaining({ endpoint: 'detail' }),
				}),
			);
		});

		it('NO registra nada sin participant:health', async () => {
			jest.spyOn(authorizationService, 'hasPermission').mockResolvedValue(false);
			mockFindParticipantById.mockResolvedValue(participantWithHealth);

			const req = createMockReq({ params: { id: 'p-1' } });
			const res = createMockRes();
			await getParticipantById(req, res, mockNext);

			expect(mockDomainAuditLog).not.toHaveBeenCalled();
		});
	});

	describe('updateParticipant', () => {
		it('registra PARTICIPANT_HEALTH_VIEW cuando el caller tiene participant:health (la respuesta trae salud sin recortar)', async () => {
			jest.spyOn(authorizationService, 'hasPermission').mockResolvedValue(true);
			mockUpdateParticipant.mockResolvedValue(participantWithHealth);

			const req = createMockReq({ params: { id: 'p-1' }, body: { firstName: 'Ana' } });
			const res = createMockRes();
			await updateParticipant(req, res, mockNext);

			expect(mockDomainAuditLog).toHaveBeenCalledWith(
				expect.objectContaining({
					action: 'participant.health_view',
					resourceId: 'p-1',
					retreatId: 'retreat-1',
					metadata: expect.objectContaining({ endpoint: 'update' }),
				}),
			);
		});

		it('NO registra nada sin participant:health (y la respuesta viene sin salud)', async () => {
			jest.spyOn(authorizationService, 'hasPermission').mockResolvedValue(false);
			mockUpdateParticipant.mockResolvedValue(participantWithHealth);

			const req = createMockReq({ params: { id: 'p-1' }, body: { firstName: 'Ana' } });
			const res = createMockRes();
			await updateParticipant(req, res, mockNext);

			expect(mockDomainAuditLog).not.toHaveBeenCalled();
			const body = (res.json as jest.Mock).mock.calls[0][0];
			expect(body).not.toHaveProperty('medicationDetails');
		});
	});

	describe('logHealthDataExport (POST /participants/health-export-audit)', () => {
		it('registra PARTICIPANT_HEALTH_EXPORT con los metadatos recibidos cuando el caller tiene acceso al retiro', async () => {
			jest.spyOn(authorizationService, 'hasRetreatAccess').mockResolvedValue(true);
			const req = createMockReq({
				body: { retreatId: 'retreat-1', count: 12, format: 'xlsx' },
			});
			const res = createMockRes();
			await logHealthDataExport(req, res, mockNext);

			expect(mockDomainAuditLog).toHaveBeenCalledWith(
				expect.objectContaining({
					action: 'participant.health_export',
					retreatId: 'retreat-1',
					metadata: { count: 12, format: 'xlsx' },
				}),
			);
			expect(res.json).toHaveBeenCalledWith({ success: true });
		});

		it('registra sin chequeo de retiro cuando el cliente no manda retreatId', async () => {
			const hasRetreatAccessSpy = jest.spyOn(authorizationService, 'hasRetreatAccess');
			const req = createMockReq({ body: { count: 3, format: 'csv' } });
			const res = createMockRes();
			await logHealthDataExport(req, res, mockNext);

			expect(hasRetreatAccessSpy).not.toHaveBeenCalled();
			expect(mockDomainAuditLog).toHaveBeenCalledWith(
				expect.objectContaining({
					action: 'participant.health_export',
					retreatId: null,
					metadata: { count: 3, format: 'csv' },
				}),
			);
			expect(res.json).toHaveBeenCalledWith({ success: true });
		});

		it('rechaza con 403 si el caller no tiene acceso al retiro indicado (spoofing cross-tenant)', async () => {
			jest.spyOn(authorizationService, 'hasRetreatAccess').mockResolvedValue(false);
			const req = createMockReq({
				body: { retreatId: 'retreat-ajeno', count: 5, format: 'xlsx' },
			});
			const res = createMockRes();
			await logHealthDataExport(req, res, mockNext);

			expect(res.status).toHaveBeenCalledWith(403);
			expect(mockDomainAuditLog).not.toHaveBeenCalled();
		});
	});
});
