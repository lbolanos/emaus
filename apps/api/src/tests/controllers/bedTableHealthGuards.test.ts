/**
 * Health-data gate for the bed map and the tables: both embedded the full
 * Participant ficha (medication, diet, disability, notes, 12 emergency-contact
 * fields) in their JSON responses, gated only by generic retreat access — not
 * by `participant:health`. HIGH findings of the post-deploy code review
 * (2026-09-16); same gate and same strip that already protect /participants.
 *
 * - retreatBedController: getRetreatBeds / assignParticipantToBed /
 *   toggleBedActive all return beds with `relations: ['participant']`.
 * - tableMesaController: getTablesForRetreat / getTable and the four
 *   assignment mutations return tables whose lider/colider1/colider2/walkers
 *   slots embed participants.
 *
 * Database-independent: mocks repos and services, spies on authorizationService.
 */

jest.mock('typeorm', () => {
	const actual = jest.requireActual('typeorm');
	return {
		...actual,
		DataSource: jest.fn().mockImplementation(() => ({
			getRepository: jest.fn().mockReturnValue({ findOne: jest.fn(), find: jest.fn() }),
			initialize: jest.fn().mockResolvedValue(undefined),
			isInitialized: true,
			transaction: jest.fn(),
		})),
	};
});

const mockRetreatBedRepo = { find: jest.fn(), findOne: jest.fn(), update: jest.fn() };
const mockRetreatParticipantRepo = { find: jest.fn() };
// Repos handed to the AppDataSource.transaction callback — separate instances
// so the in-transaction findOne calls don't interleave with the post-transaction
// reads of the outer repos.
const mockTemRepos: Record<string, { findOne: jest.Mock; update: jest.Mock }> = {
	RetreatBed: { findOne: jest.fn(), update: jest.fn() },
	Participant: { findOne: jest.fn(), update: jest.fn() },
	RetreatParticipant: { findOne: jest.fn(), update: jest.fn() },
	Retreat: { findOne: jest.fn(), update: jest.fn() },
};
const mockGenericRepo = () => ({
	findOne: jest.fn(),
	find: jest.fn(),
	save: jest.fn(),
	create: jest.fn(),
	update: jest.fn(),
	createQueryBuilder: jest.fn(),
});

jest.mock('../../data-source', () => ({
	AppDataSource: {
		getRepository: jest.fn((entity: { name?: string }) => {
			if (entity?.name === 'RetreatBed') return mockRetreatBedRepo;
			if (entity?.name === 'RetreatParticipant') return mockRetreatParticipantRepo;
			return mockGenericRepo();
		}),
		initialize: jest.fn().mockResolvedValue(undefined),
		isInitialized: true,
		transaction: jest.fn((fn: (tem: unknown) => Promise<unknown>) =>
			fn({
				getRepository: (entity: { name?: string }) => mockTemRepos[entity?.name ?? ''],
			}),
		),
	},
}));

jest.mock('../../realtime', () => ({ emitReceptionBagMade: jest.fn() }));

jest.mock('../../services/domainAuditService', () => {
	const actual = jest.requireActual('../../services/domainAuditService');
	return {
		...actual,
		domainAuditService: { log: jest.fn().mockResolvedValue(undefined) },
	};
});

const mockFindTablesByRetreatId = jest.fn();
const mockFindTableById = jest.fn();
const mockAssignLeaderToTable = jest.fn();
const mockUnassignLeaderFromTable = jest.fn();
const mockAssignWalkerToTable = jest.fn();
const mockUnassignWalkerFromTable = jest.fn();
jest.mock('../../services/tableMesaService', () => ({
	findTablesByRetreatId: (...args: unknown[]) => mockFindTablesByRetreatId(...args),
	findTableById: (...args: unknown[]) => mockFindTableById(...args),
	assignLeaderToTable: (...args: unknown[]) => mockAssignLeaderToTable(...args),
	unassignLeaderFromTable: (...args: unknown[]) => mockUnassignLeaderFromTable(...args),
	assignWalkerToTable: (...args: unknown[]) => mockAssignWalkerToTable(...args),
	unassignWalkerFromTable: (...args: unknown[]) => mockUnassignWalkerFromTable(...args),
}));

import { Request, Response } from 'express';
import { authorizationService } from '../../middleware/authorization';
import { domainAuditService, DomainAuditAction } from '../../services/domainAuditService';
import {
	getRetreatBeds,
	assignParticipantToBed,
	toggleBedActive,
} from '../../controllers/retreatBedController';
import * as tableMesaController from '../../controllers/tableMesaController';

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

const responseBody = (res: Response) => (res.json as jest.Mock).mock.calls[0][0];

const participantWithHealth = {
	id: 'p-1',
	firstName: 'Ana',
	lastName: 'Ruiz',
	// Booleans the bed map renders — must survive the strip.
	snores: true,
	hasMedication: true,
	// Sensitive health fields — must not travel without participant:health.
	medicationDetails: 'Losartán',
	medicationSchedule: '22:00',
	dietaryRestrictionsDetails: 'sin gluten',
	notes: 'nota privada',
	emergencyContact1Name: 'Carlos Ruiz',
	emergencyContact1CellPhone: '5550001111',
};

const bedWithHealth = {
	id: 'bed-1',
	retreatId: 'retreat-1',
	roomNumber: '101',
	bedNumber: '1',
	floor: 1,
	isActive: true,
	participant: participantWithHealth,
};

const tableWithHealth = {
	id: 'table-1',
	retreatId: 'retreat-1',
	tableNumber: 1,
	lider: { ...participantWithHealth, id: 'p-lider' },
	colider1: { ...participantWithHealth, id: 'p-colider1' },
	colider2: null,
	walkers: [
		{ ...participantWithHealth, id: 'p-walker1', type: 'walker' },
		{ ...participantWithHealth, id: 'p-walker2', type: 'walker' },
	],
};

describe('mapa de camas y mesas — ficha de salud gateada por participant:health', () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	describe('getRetreatBeds', () => {
		beforeEach(() => {
			mockRetreatBedRepo.find.mockResolvedValue([bedWithHealth]);
			mockRetreatParticipantRepo.find.mockResolvedValue([]);
		});

		it('recorta la salud de bed.participant sin participant:health', async () => {
			jest.spyOn(authorizationService, 'hasPermission').mockResolvedValue(false);

			const res = createMockRes();
			await getRetreatBeds(createMockReq({ params: { retreatId: 'retreat-1' } }), res);

			const body = responseBody(res);
			expect(body[0].participant).not.toHaveProperty('medicationDetails');
			expect(body[0].participant).not.toHaveProperty('notes');
			expect(body[0].participant).not.toHaveProperty('emergencyContact1Name');
			// UI contract: the booleans the bed map renders survive the strip.
			expect(body[0].participant.snores).toBe(true);
			expect(body[0].participant.hasMedication).toBe(true);
			expect(body[0].participant.firstName).toBe('Ana');
		});

		it('conserva la salud con participant:health y audita la vista', async () => {
			jest.spyOn(authorizationService, 'hasPermission').mockResolvedValue(true);

			const res = createMockRes();
			await getRetreatBeds(createMockReq({ params: { retreatId: 'retreat-1' } }), res);

			const body = responseBody(res);
			expect(body[0].participant.medicationDetails).toBe('Losartán');
			expect(domainAuditService.log).toHaveBeenCalledWith(
				expect.objectContaining({
					action: DomainAuditAction.PARTICIPANT_HEALTH_VIEW,
					resourceType: 'participant',
					retreatId: 'retreat-1',
					metadata: { endpoint: 'bed-map', count: 1 },
				}),
			);
		});

		it('no audita PARTICIPANT_HEALTH_VIEW cuando el caller no ve salud', async () => {
			jest.spyOn(authorizationService, 'hasPermission').mockResolvedValue(false);

			const res = createMockRes();
			await getRetreatBeds(createMockReq({ params: { retreatId: 'retreat-1' } }), res);

			expect(domainAuditService.log).not.toHaveBeenCalledWith(
				expect.objectContaining({ action: DomainAuditAction.PARTICIPANT_HEALTH_VIEW }),
			);
		});
	});

	describe('assignParticipantToBed — respuesta de la mutación', () => {
		beforeEach(() => {
			jest.spyOn(authorizationService, 'hasRetreatAccess').mockResolvedValue(true);
			// In-transaction reads. Both RetreatBed.findOne calls (bedCheck and
			// existingBed) resolve to the same bed — same participantId means
			// neither the "already assigned" nor the reassign path fires.
			mockTemRepos.RetreatBed.findOne.mockResolvedValue({
				id: 'bed-1',
				retreatId: 'retreat-1',
				isActive: true,
				participantId: 'p-1',
			});
			mockTemRepos.Participant.findOne.mockResolvedValue({ id: 'p-1', firstName: 'Ana' });
			mockTemRepos.RetreatParticipant.findOne.mockResolvedValue(null);
			mockTemRepos.Retreat.findOne.mockResolvedValue(null);
			// Post-transaction read with the participant relation.
			mockRetreatBedRepo.findOne.mockResolvedValue(bedWithHealth);
		});

		it('recorta la salud de la cama devuelta sin participant:health (audita BED_ASSIGN, no HEALTH_VIEW)', async () => {
			jest.spyOn(authorizationService, 'hasPermission').mockResolvedValue(false);

			const res = createMockRes();
			await assignParticipantToBed(
				createMockReq({ params: { bedId: 'bed-1' }, body: { participantId: 'p-1' } }),
				res,
			);

			const body = responseBody(res);
			expect(body.participant).not.toHaveProperty('medicationDetails');
			expect(body.participant.firstName).toBe('Ana');
			// The mutation audits its own action; the health gate only shapes
			// the payload, so no extra PARTICIPANT_HEALTH_VIEW noise.
			expect(domainAuditService.log).toHaveBeenCalledWith(
				expect.objectContaining({ action: DomainAuditAction.BED_ASSIGN }),
			);
			expect(domainAuditService.log).not.toHaveBeenCalledWith(
				expect.objectContaining({ action: DomainAuditAction.PARTICIPANT_HEALTH_VIEW }),
			);
		});

		it('conserva la salud con participant:health', async () => {
			jest.spyOn(authorizationService, 'hasPermission').mockResolvedValue(true);

			const res = createMockRes();
			await assignParticipantToBed(
				createMockReq({ params: { bedId: 'bed-1' }, body: { participantId: 'p-1' } }),
				res,
			);

			expect(responseBody(res).participant.medicationDetails).toBe('Losartán');
		});
	});

	describe('toggleBedActive — respuesta de la mutación', () => {
		it('recorta la salud de la cama devuelta sin participant:health', async () => {
			jest.spyOn(authorizationService, 'hasPermission').mockResolvedValue(false);
			jest.spyOn(authorizationService, 'hasRetreatAccess').mockResolvedValue(true);
			mockRetreatBedRepo.findOne
				.mockResolvedValueOnce({
					id: 'bed-1',
					retreatId: 'retreat-1',
					isActive: false,
					participantId: 'p-1',
				})
				.mockResolvedValueOnce(bedWithHealth);

			const res = createMockRes();
			await toggleBedActive(
				createMockReq({ params: { bedId: 'bed-1' }, body: { isActive: true } }),
				res,
			);

			const body = responseBody(res);
			expect(body.participant).not.toHaveProperty('medicationDetails');
			expect(body.participant.hasMedication).toBe(true);
		});
	});

	describe('tableMesaController', () => {
		const TABLE_ID = '123e4567-e89b-12d3-a456-426614174000';

		describe('getTablesForRetreat', () => {
			it('recorta la salud de lider/colider/walkers sin participant:health', async () => {
				jest.spyOn(authorizationService, 'hasPermission').mockResolvedValue(false);
				mockFindTablesByRetreatId.mockResolvedValue([tableWithHealth]);

				const res = createMockRes();
				await tableMesaController.getTablesForRetreat(
					createMockReq({ params: { retreatId: 'retreat-1' } }),
					res,
				);

				const body = responseBody(res);
				// Nested single objects (stripSensitiveHealthFields does not
				// descend into them) and the walkers array are all covered.
				expect(body[0].lider).not.toHaveProperty('medicationDetails');
				expect(body[0].colider1).not.toHaveProperty('dietaryRestrictionsDetails');
				expect(body[0].walkers[0]).not.toHaveProperty('notes');
				expect(body[0].walkers[1]).not.toHaveProperty('emergencyContact1Name');
				// colider2 stays null; names survive everywhere.
				expect(body[0].colider2).toBeNull();
				expect(body[0].lider.firstName).toBe('Ana');
				expect(body[0].walkers[0].firstName).toBe('Ana');
			});

			it('conserva la salud con participant:health y audita la vista', async () => {
				jest.spyOn(authorizationService, 'hasPermission').mockResolvedValue(true);
				mockFindTablesByRetreatId.mockResolvedValue([tableWithHealth]);

				const res = createMockRes();
				await tableMesaController.getTablesForRetreat(
					createMockReq({ params: { retreatId: 'retreat-1' } }),
					res,
				);

				const body = responseBody(res);
				expect(body[0].lider.medicationDetails).toBe('Losartán');
				expect(body[0].walkers[0].notes).toBe('nota privada');
				expect(domainAuditService.log).toHaveBeenCalledWith(
					expect.objectContaining({
						action: DomainAuditAction.PARTICIPANT_HEALTH_VIEW,
						resourceType: 'participant',
						retreatId: 'retreat-1',
						metadata: { endpoint: 'table-list', count: 1 },
					}),
				);
			});
		});

		describe('getTable', () => {
			it('recorta la salud sin participant:health', async () => {
				jest.spyOn(authorizationService, 'hasPermission').mockResolvedValue(false);
				mockFindTableById.mockResolvedValue(tableWithHealth);

				const res = createMockRes();
				await tableMesaController.getTable(createMockReq({ params: { id: TABLE_ID } }), res);

				const body = responseBody(res);
				expect(body.lider).not.toHaveProperty('medicationDetails');
				expect(body.walkers[0]).not.toHaveProperty('medicationDetails');
			});
		});

		describe('mutaciones de asignación — respuesta recortada sin participant:health', () => {
			it.each(['assignLeader', 'unassignLeader', 'assignWalker', 'unassignWalker'])(
				'%s devuelve la mesa recortada',
				async (handlerName) => {
					jest.spyOn(authorizationService, 'hasPermission').mockResolvedValue(false);
					const serviceMock = {
						assignLeader: mockAssignLeaderToTable,
						unassignLeader: mockUnassignLeaderFromTable,
						assignWalker: mockAssignWalkerToTable,
						unassignWalker: mockUnassignWalkerFromTable,
					}[handlerName as string] as jest.Mock;
					serviceMock.mockResolvedValue(tableWithHealth);

					const res = createMockRes();
					const req = createMockReq({
						params: { id: TABLE_ID, role: 'lider', walkerId: 'p-walker1' },
						body: { participantId: 'p-1' },
					});
					await (tableMesaController as any)[handlerName](req, res, jest.fn());

					expect(serviceMock).toHaveBeenCalledTimes(1);
					const body = responseBody(res);
					expect(body.lider).not.toHaveProperty('medicationDetails');
					expect(body.walkers[1]).not.toHaveProperty('emergencyContact1Name');
					expect(body.lider.firstName).toBe('Ana');
				},
			);
		});
	});
});
