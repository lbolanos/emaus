/**
 * Tests for the validateParticipant service method (dry-run validation).
 * Verifies read-only checks: retreat exists/public, email uniqueness, capacity.
 *
 * Database-independent: uses Jest mocks for AppDataSource repositories.
 */

// Mock repository methods
const mockFindOne = jest.fn();
const mockCount = jest.fn();
const mockGetOne = jest.fn();

const mockCreateQueryBuilder = jest.fn().mockReturnValue({
	where: jest.fn().mockReturnThis(),
	orderBy: jest.fn().mockReturnThis(),
	getOne: mockGetOne,
});

const mockRetreatRepo = {
	findOne: mockFindOne,
};

const mockHistoryRepo = {
	count: mockCount,
};

const mockParticipantRepo = {
	createQueryBuilder: mockCreateQueryBuilder,
};

// Mock TypeORM before any imports
jest.mock('typeorm', () => {
	const actual = jest.requireActual('typeorm');
	return {
		...actual,
		DataSource: jest.fn().mockImplementation(() => ({
			getRepository: jest.fn(),
			initialize: jest.fn().mockResolvedValue(undefined),
			isInitialized: true,
			transaction: jest.fn(),
		})),
	};
});

jest.mock('../../data-source', () => ({
	AppDataSource: {
		getRepository: jest.fn().mockImplementation((entity: any) => {
			const name = typeof entity === 'function' ? entity.name : entity;
			if (name === 'Retreat') return mockRetreatRepo;
			if (name === 'RetreatParticipant') return mockHistoryRepo;
			if (name === 'Participant') return mockParticipantRepo;
			// Default fallback for any other entities
			return {
				findOne: jest.fn(),
				find: jest.fn(),
				save: jest.fn(),
				create: jest.fn(),
				createQueryBuilder: jest.fn().mockReturnValue({
					where: jest.fn().mockReturnThis(),
					orderBy: jest.fn().mockReturnThis(),
					getOne: jest.fn(),
				}),
			};
		}),
		initialize: jest.fn().mockResolvedValue(undefined),
		isInitialized: true,
		transaction: jest.fn(),
	},
}));

// Mock other services that get imported transitively
jest.mock('../../services/tableMesaService', () => ({
	rebalanceTablesForRetreat: jest.fn(),
	assignLeaderToTable: jest.fn(),
}));

jest.mock('../../services/emailService', () => ({
	EmailService: jest.fn().mockImplementation(() => ({
		sendEmail: jest.fn(),
	})),
}));

jest.mock('../../services/retreatParticipantService', () => ({
	createHistoryEntry: jest.fn(),
	autoSetPrimaryRetreat: jest.fn(),
	syncRetreatFields: jest.fn(),
}));

jest.mock('../../utils/bedQueryUtils', () => ({
	BedQueryUtils: jest.fn().mockImplementation(() => ({})),
}));

import { validateParticipant } from '../../services/participantService';
import type { CreateParticipant } from '@repo/types';

const baseParticipantData: CreateParticipant = {
	email: 'test@example.com',
	firstName: 'Juan',
	lastName: 'Pérez',
	retreatId: 'retreat-1',
	type: 'walker',
	birthDate: new Date('1990-01-15'),
	maritalStatus: 'S',
	street: 'Calle 1',
	houseNumber: '10',
	postalCode: '06600',
	neighborhood: 'Centro',
	city: 'CDMX',
	state: 'CDMX',
	country: 'MX',
	cellPhone: '5551234567',
	sacraments: ['baptism'],
	emergencyContact1Name: 'María',
	emergencyContact1Relation: 'Madre',
	emergencyContact1CellPhone: '5559876543',
};

describe('validateParticipant service', () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	it('should return error when retreatId is missing', async () => {
		const data = { ...baseParticipantData, retreatId: '' };
		const result = await validateParticipant(data);

		expect(result.valid).toBe(false);
		expect(result.error).toBe('retreatId es requerido');
	});

	it('should return error when retreat is not found', async () => {
		mockFindOne.mockResolvedValue(null);

		const result = await validateParticipant(baseParticipantData);

		expect(result.valid).toBe(false);
		expect(result.error).toBe('Retiro no encontrado');
	});

	it('should return error when retreat is not public', async () => {
		mockFindOne.mockResolvedValue({ id: 'retreat-1', isPublic: false });

		const result = await validateParticipant(baseParticipantData);

		expect(result.valid).toBe(false);
		expect(result.error).toBe('El retiro no está abierto para registro público');
	});

	it('should return valid with no warnings for new email in open retreat', async () => {
		mockFindOne.mockResolvedValue({
			id: 'retreat-1',
			isPublic: true,
			max_walkers: 30,
		});
		mockGetOne.mockResolvedValue(null); // no existing participant
		mockCount.mockResolvedValue(10); // well below capacity

		const result = await validateParticipant(baseParticipantData);

		expect(result.valid).toBe(true);
		expect(result.error).toBeUndefined();
		expect(result.warnings).toHaveLength(0);
	});

	it('should warn when email already exists', async () => {
		mockFindOne.mockResolvedValue({
			id: 'retreat-1',
			isPublic: true,
			max_walkers: 30,
		});
		mockGetOne.mockResolvedValue({
			firstName: 'Juan',
			lastName: 'Pérez',
			email: 'test@example.com',
		});
		mockCount.mockResolvedValue(10);

		const result = await validateParticipant(baseParticipantData);

		expect(result.valid).toBe(true);
		expect(result.warnings.length).toBeGreaterThanOrEqual(1);
		expect(result.warnings[0]).toContain('Ya existe un participante');
		expect(result.warnings[0]).toContain('Juan Pérez');
	});

	it('should warn when walker capacity is reached', async () => {
		mockFindOne.mockResolvedValue({
			id: 'retreat-1',
			isPublic: true,
			max_walkers: 30,
		});
		mockGetOne.mockResolvedValue(null);
		mockCount.mockResolvedValue(30); // at capacity

		const result = await validateParticipant(baseParticipantData);

		expect(result.valid).toBe(true);
		expect(result.warnings.some((w) => w.includes('capacidad máxima de caminantes'))).toBe(true);
	});

	it('should warn when server capacity is reached', async () => {
		mockFindOne.mockResolvedValue({
			id: 'retreat-1',
			isPublic: true,
			max_servers: 20,
		});
		mockGetOne.mockResolvedValue(null);
		mockCount.mockResolvedValue(20); // at capacity

		const serverData = { ...baseParticipantData, type: 'server' as const };
		const result = await validateParticipant(serverData);

		expect(result.valid).toBe(true);
		expect(result.warnings.some((w) => w.includes('capacidad máxima de servidores'))).toBe(true);
	});

	it('should not check walker capacity for server type', async () => {
		mockFindOne.mockResolvedValue({
			id: 'retreat-1',
			isPublic: true,
			max_walkers: 5,
			max_servers: null,
		});
		mockGetOne.mockResolvedValue(null);
		// Don't even need to mock count for walkers since it shouldn't be checked

		const serverData = { ...baseParticipantData, type: 'server' as const };
		const result = await validateParticipant(serverData);

		expect(result.valid).toBe(true);
		expect(result.warnings).toHaveLength(0);
	});

	it('should skip capacity check when max_walkers is null', async () => {
		mockFindOne.mockResolvedValue({
			id: 'retreat-1',
			isPublic: true,
			max_walkers: null,
		});
		mockGetOne.mockResolvedValue(null);

		const result = await validateParticipant(baseParticipantData);

		expect(result.valid).toBe(true);
		expect(result.warnings).toHaveLength(0);
		// count should not have been called since max_walkers is null
		expect(mockCount).not.toHaveBeenCalled();
	});

	it('should combine multiple warnings (duplicate email + capacity)', async () => {
		mockFindOne.mockResolvedValue({
			id: 'retreat-1',
			isPublic: true,
			max_walkers: 25,
		});
		mockGetOne.mockResolvedValue({
			firstName: 'Ana',
			lastName: 'García',
			email: 'test@example.com',
		});
		mockCount.mockResolvedValue(25); // at capacity

		const result = await validateParticipant(baseParticipantData);

		expect(result.valid).toBe(true);
		expect(result.warnings).toHaveLength(2);
		expect(result.warnings[0]).toContain('Ya existe');
		expect(result.warnings[1]).toContain('capacidad máxima');
	});

	it('should handle partial_server type for capacity check', async () => {
		mockFindOne.mockResolvedValue({
			id: 'retreat-1',
			isPublic: true,
			max_servers: 15,
		});
		mockGetOne.mockResolvedValue(null);
		mockCount.mockResolvedValue(15);

		const data = { ...baseParticipantData, type: 'partial_server' as const };
		const result = await validateParticipant(data);

		expect(result.valid).toBe(true);
		expect(result.warnings.some((w) => w.includes('capacidad máxima de servidores'))).toBe(true);
	});
});
