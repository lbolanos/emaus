/**
 * Mock Database Utilities
 *
 * Provides utilities for creating TypeORM mock repositories and test data.
 * Designed to work with in-memory SQLite for fast, isolated tests.
 */

import { Repository, DataSource } from 'typeorm';
import { vi } from 'vitest';

/**
 * Create a mock repository with common methods
 */
export function createMockRepository<T extends { id: string }>() {
	const mockRepo = {
		create: vi.fn(),
		save: vi.fn(),
		find: vi.fn(),
		findOne: vi.fn(),
		findBy: vi.fn(),
		update: vi.fn(),
		delete: vi.fn(),
		count: vi.fn(),
		query: vi.fn(),
	};

	// Setup default return values
	mockRepo.create.mockImplementation((data: Partial<T>) => ({ id: 'mock-id', ...data }) as T);
	mockRepo.save.mockImplementation(async (entity: T) => entity);
	mockRepo.find.mockResolvedValue([]);
	mockRepo.findOne.mockResolvedValue(null);
	mockRepo.findBy.mockResolvedValue([]);
	mockRepo.update.mockResolvedValue({ affected: 1 });
	mockRepo.delete.mockResolvedValue({ affected: 1 });
	mockRepo.count.mockResolvedValue(0);

	return mockRepo as unknown as Repository<T>;
}

/**
 * Create mock DataSource with repository getters
 */
export function createMockDataSource() {
	const mockDataSource = {
		isInitialized: false,
		initialize: vi.fn(async () => {
			(mockDataSource as any).isInitialized = true;
		}),
		destroy: vi.fn(async () => {
			(mockDataSource as any).isInitialized = false;
		}),
		getRepository: vi.fn(),
		runMigrations: vi.fn(),
		query: vi.fn(),
		entityMetadatas: [],
	};

	return mockDataSource as unknown as DataSource;
}

/**
 * Setup mock data source with entity repositories
 */
export function setupMockDataSourceWithEntities(entities: any[]) {
	const mockDataSource = createMockDataSource();
	const repositories = new Map();

	entities.forEach((entity) => {
		const mockRepo = createMockRepository();
		const entityName = entity.name || entity.constructor.name;
		repositories.set(entityName, mockRepo);

		(mockDataSource.getRepository as any).mockImplementation((entity: any) => {
			const name = typeof entity === 'string' ? entity : entity.name;
			return repositories.get(name) || createMockRepository();
		});
	});

	(mockDataSource as any).entityMetadatas = entities.map((entity) => ({
		tableName: entity.tableName || entity.name?.toLowerCase() || 'unknown',
		name: entity.name || 'unknown',
	}));

	return mockDataSource;
}

/**
 * Create test data with overrides
 */
export function createTestData<T>(defaults: T, overrides: Partial<T> = {}): T {
	return {
		...defaults,
		...overrides,
	};
}

/**
 * Generate a unique test ID
 */
export function generateTestId(prefix: string = 'test'): string {
	return `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Create a mock date in the future or past
 */
export function createMockDate(offsetDays: number = 0): Date {
	const date = new Date();
	date.setDate(date.getDate() + offsetDays);
	return date;
}

/**
 * Mock a paginated result
 */
export function createMockPaginatedResult<T>(
	data: T[],
	total: number = data.length,
	page: number = 1,
	pageSize: number = 10,
) {
	const totalPages = Math.ceil(total / pageSize);
	return {
		data,
		total,
		page,
		pageSize,
		totalPages,
		hasNext: page < totalPages,
		hasPrev: page > 1,
	};
}

/**
 * Wait for async operations (useful for testing delays)
 */
export function delay(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Common mock data generators
 */
export const MockDataGenerators = {
	user: (overrides: any = {}) => ({
		id: generateTestId('user'),
		firstName: 'Test',
		lastName: 'User',
		email: `test-${Date.now()}@example.com`,
		password: 'hashedpassword',
		role: 'admin',
		isActive: true,
		emailVerified: true,
		createdAt: new Date(),
		updatedAt: new Date(),
		...overrides,
	}),

	retreat: (overrides: any = {}) => ({
		id: generateTestId('retreat'),
		name: `Test Retreat ${Date.now()}`,
		startDate: createMockDate(),
		endDate: createMockDate(3),
		isPublic: true,
		max_walkers: 50,
		max_servers: 20,
		houseId: generateTestId('house'),
		notes: 'Test retreat',
		createdAt: new Date(),
		updatedAt: new Date(),
		...overrides,
	}),

	house: (overrides: any = {}) => ({
		id: generateTestId('house'),
		name: 'Test House',
		address: '123 Test Street',
		city: 'Test City',
		state: 'Test State',
		country: 'Test Country',
		maxOccupancy: 100,
		notes: 'Test house notes',
		createdAt: new Date(),
		updatedAt: new Date(),
		...overrides,
	}),

	participant: (overrides: any = {}) => ({
		id: generateTestId('participant'),
		firstName: 'Test',
		lastName: 'Participant',
		email: `participant-${Date.now()}@example.com`,
		phone: '1234567890',
		type: 'walker',
		retreatId: generateTestId('retreat'),
		tableMesaId: null,
		retreatBedId: null,
		isCancelled: false,
		family_friend_color: null,
		snoring: false,
		birthDate: createMockDate(-8000), // ~22 years ago
		createdAt: new Date(),
		updatedAt: new Date(),
		...overrides,
	}),

	table: (overrides: any = {}) => ({
		id: generateTestId('table'),
		name: `Table ${Math.floor(Math.random() * 100)}`,
		retreatId: generateTestId('retreat'),
		maxWalkers: 8,
		liderId: null,
		colider1Id: null,
		colider2Id: null,
		createdAt: new Date(),
		updatedAt: new Date(),
		...overrides,
	}),

	retreatBed: (overrides: any = {}) => ({
		id: generateTestId('bed'),
		roomNumber: '101',
		bedNumber: '1',
		floor: 1,
		type: 'normal',
		defaultUsage: 'caminante',
		retreatId: generateTestId('retreat'),
		houseId: generateTestId('house'),
		participantId: null,
		createdAt: new Date(),
		updatedAt: new Date(),
		...overrides,
	}),
};
