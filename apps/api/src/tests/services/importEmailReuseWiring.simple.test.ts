/**
 * Wiring of the name guard inside importParticipants: a row that names someone
 * else must not overwrite the record its email matched — neither via
 * createParticipant (§25.9, email registered outside the retreat) nor via the
 * same-retreat update branch (§25.8, where the role guard only fires when the
 * row declares a conflicting tipousuario).
 *
 * The decision itself is pinned in importEmailReuse.simple.test.ts. The
 * DB-backed import suite cannot call the service (participantService.test.ts,
 * "TypeORM metadata caching issue"), so this mocks the data source like
 * importAuditGuard.simple.test.ts and tells the two email lookups apart by
 * their SQL: the same-retreat one filters by retreatId, the global one doesn't.
 */

let sameRetreatMatch: any = null;
let globalMatch: any = null;
const mockSave = jest.fn(async (entity: any) => entity);
// Chains any builder method; only the terminal ones resolve. The import also
// runs its bed/table pass on this repo, so it needs more than where/getOne.
const queryBuilder = () => {
	let sql = '';
	const terminals: Record<string, () => Promise<any>> = {
		getOne: async () => (sql.includes('retreatId') ? sameRetreatMatch : globalMatch),
		getMany: async () => [],
		getRawMany: async () => [],
		getRawOne: async () => undefined,
		getCount: async () => 0,
		execute: async () => ({ affected: 0 }),
	};
	const qb: any = new Proxy(
		{},
		{
			get: (_target, prop: string) => {
				if (prop in terminals) return terminals[prop];
				if (prop === 'where') {
					return (clause: string) => {
						sql = clause;
						return qb;
					};
				}
				if (prop === 'then') return undefined;
				return () => qb;
			},
		},
	);
	return qb;
};
// createParticipant refuses a retreat that is missing, private or over.
const OPEN_RETREAT = { id: 'retreat-a', isPublic: true, endDate: new Date('2099-01-01') };
const mockRepo = {
	findOne: jest.fn(async (opts: any) => (opts?.where?.id === OPEN_RETREAT.id ? OPEN_RETREAT : null)),
	findOneBy: jest.fn(async () => null),
	find: jest.fn(async () => []),
	save: mockSave,
	update: jest.fn(async () => ({ affected: 0 })),
	create: (x: any) => x,
	merge: (target: any, source: any) => Object.assign(target, source),
	count: jest.fn(async () => 0),
	delete: jest.fn(async () => ({ affected: 0 })),
	createQueryBuilder: queryBuilder,
};
const mockTransaction = jest.fn(async (cb: any) => cb({ getRepository: () => mockRepo }));

jest.mock('../../data-source', () => ({
	AppDataSource: {
		getRepository: () => mockRepo,
		transaction: mockTransaction,
		query: jest.fn(async () => []),
	},
}));

jest.mock('../../services/domainAuditService', () => ({
	domainAuditService: {
		log: jest.fn(),
		logUpdate: jest.fn(),
		logCreate: jest.fn(),
		logDelete: jest.fn(),
	},
	DomainAuditAction: {},
}));

import { importParticipants } from '../../services/participantService';

const RETREAT_ID = 'retreat-a';
const row = (nombre: string, apellidos: string) => ({
	nombre,
	apellidos,
	email: 'compartido@example.com',
	tipousuario: '3',
	medicinacual: 'Ninguna',
	emerg1nombre: 'Contacto de la fila',
});

describe('import over an email registered outside the retreat (§25.9)', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		sameRetreatMatch = null;
		globalMatch = {
			id: 'p-other',
			firstName: 'Juan',
			lastName: 'Pérez',
			email: 'compartido@example.com',
			retreatId: 'retreat-b',
			medicationDetails: 'Losartán 50 mg',
			emergencyContact1Name: 'Rosa Pérez',
		};
	});

	it('skips a row that names someone else, with a reason naming both, and leaves the record alone', async () => {
		const result = await importParticipants(RETREAT_ID, [row('María', 'López')], { id: 'u-1' });

		expect(result.importedCount).toBe(0);
		expect(result.skippedCount).toBe(1);
		expect(result.skippedDetails).toEqual([
			expect.objectContaining({
				row: 2,
				name: 'María López',
				reason: expect.stringContaining('Juan Pérez'),
			}),
		]);
		expect(result.reusedDetails).toEqual([]);
		// Nothing reached the record: still Juan's data, never saved.
		expect(globalMatch.medicationDetails).toBe('Losartán 50 mg');
		expect(globalMatch.emergencyContact1Name).toBe('Rosa Pérez');
		expect(globalMatch.retreatId).toBe('retreat-b');
		expect(mockSave).not.toHaveBeenCalledWith(expect.objectContaining({ id: 'p-other' }));
	});

	it('imports the same person and reports the row, so updating their record is not silent', async () => {
		const result = await importParticipants(RETREAT_ID, [row('JUAN carlos', 'Perez Gómez')], {
			id: 'u-1',
		});

		expect(result.skippedDetails).toEqual([]);
		expect(result.importedCount).toBe(1);
		expect(result.reusedDetails).toEqual([{ row: 2, name: 'JUAN carlos Perez Gómez' }]);
	});

	it('imports a brand-new email without reporting it as reused', async () => {
		globalMatch = null;
		const result = await importParticipants(RETREAT_ID, [row('María', 'López')], { id: 'u-1' });

		expect(result.skippedDetails).toEqual([]);
		expect(result.importedCount).toBe(1);
		expect(result.reusedDetails).toEqual([]);
	});
});

describe('import over an email already enrolled in this retreat (§25.8 name guard)', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		globalMatch = null;
		sameRetreatMatch = {
			id: 'p-same',
			firstName: 'Juan',
			lastName: 'Pérez',
			email: 'compartido@example.com',
			retreatId: 'retreat-a',
			medicationDetails: 'Losartán 50 mg',
			emergencyContact1Name: 'Rosa Pérez',
		};
	});

	it('skips a row that names someone else even without a role conflict, and leaves the record alone', async () => {
		const result = await importParticipants(RETREAT_ID, [row('María', 'López')], { id: 'u-1' });

		expect(result.updatedCount).toBe(0);
		expect(result.skippedCount).toBe(1);
		expect(result.skippedDetails).toEqual([
			expect.objectContaining({
				row: 2,
				name: 'María López',
				reason: expect.stringContaining('Juan Pérez'),
			}),
		]);
		// The reason says where the matched record lives: in this retreat.
		expect(result.skippedDetails[0].reason).toContain('inscrito en este retiro');
		// Nothing reached the record: still Juan's data, never saved.
		expect(sameRetreatMatch.medicationDetails).toBe('Losartán 50 mg');
		expect(sameRetreatMatch.emergencyContact1Name).toBe('Rosa Pérez');
		expect(mockSave).not.toHaveBeenCalledWith(expect.objectContaining({ id: 'p-same' }));
	});

	it('updates the same person; a middle name only on the row is not a conflict', async () => {
		const result = await importParticipants(RETREAT_ID, [row('JUAN carlos', 'Perez Gómez')], {
			id: 'u-1',
		});

		expect(result.skippedDetails).toEqual([]);
		expect(result.updatedCount).toBe(1);
	});
});
