/**
 * A re-import must not overwrite what the team captured in emaus.cc with a
 * column the file does not carry.
 *
 * The parish export (scripts/convert-parish-registrations.py) has no palancas,
 * scholarship or single-room columns: those are captured here. The importer
 * used to map an absent Y/N column to `false`, and the same-retreat update
 * branch only skips `undefined`, so every re-import reset "Palancas
 * solicitadas", the scholarship (and its amount) and the single-room request
 * to "No" for every walker already enrolled — Buen Despacho, seven re-imports
 * between Oct 1 and 8, 2026.
 *
 * Goes through importParticipants with the data source mocked (same harness as
 * importEmailReuseWiring.simple.test.ts), so the real column mapping is the one
 * under test, not a copy of it.
 */

let sameRetreatMatch: any = null;
const mockSave = jest.fn(async (entity: any) => entity);
const mockUpdate = jest.fn(async (..._args: any[]) => ({ affected: 1 }));
const queryBuilder = () => {
	let sql = '';
	const terminals: Record<string, () => Promise<any>> = {
		getOne: async () => (sql.includes('retreatId') ? sameRetreatMatch : null),
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
const OPEN_RETREAT = { id: 'retreat-a', isPublic: true, endDate: new Date('2099-01-01') };
const mockRepo = {
	findOne: jest.fn(async (opts: any) => (opts?.where?.id === OPEN_RETREAT.id ? OPEN_RETREAT : null)),
	findOneBy: jest.fn(async ({ id }: any) => (id === sameRetreatMatch?.id ? sameRetreatMatch : null)),
	find: jest.fn(async () => []),
	save: mockSave,
	update: mockUpdate,
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
const INTERNAL_FIELDS = [
	'palancasRequested',
	'isScholarship',
	'scholarshipAmount',
	'requestsSingleRoom',
];

// Shape of a row from convert-parish-registrations.py: no palancaspedidas,
// becado or habitacionindividual column at all.
const parishRow = (extra: Record<string, any> = {}) => ({
	tipousuario: '3',
	nombre: 'Juan',
	apellidos: 'Pérez',
	email: 'juan@example.com',
	ronca: 'N',
	cancelado: 'N',
	...extra,
});

// The retreat_participants write for the enrolled walker (syncRetreatFields).
const rpWrite = (): Record<string, any> => {
	const call = mockUpdate.mock.calls.find(
		([where]) => where?.participantId === 'p-same' && where?.retreatId === RETREAT_ID,
	);
	expect(call).toBeDefined();
	return call![1];
};

describe('re-import keeps the fields captured in emaus.cc', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		sameRetreatMatch = {
			id: 'p-same',
			firstName: 'Juan',
			lastName: 'Pérez',
			email: 'juan@example.com',
			retreatId: RETREAT_ID,
		};
	});

	it('leaves palancas, scholarship and single room alone when the file has no such columns', async () => {
		const result = await importParticipants(RETREAT_ID, [parishRow()], { id: 'u-1' });

		expect(result.updatedCount).toBe(1);
		const written = rpWrite();
		for (const field of INTERNAL_FIELDS) expect(written).not.toHaveProperty(field);
		// The row still updates what it does carry.
		expect(written).toHaveProperty('isCancelled', false);
	});

	it('treats a blank cell as no data: empty string (xlsx) and null (CSV parser)', async () => {
		for (const blank of ['', null, '  ']) {
			mockUpdate.mockClear();
			await importParticipants(
				RETREAT_ID,
				[parishRow({ palancaspedidas: blank, becado: blank, habitacionindividual: blank })],
				{ id: 'u-1' },
			);

			const written = rpWrite();
			for (const field of INTERNAL_FIELDS) expect(written).not.toHaveProperty(field);
		}
	});

	it('a new enrollment from a file without the columns still starts at No', async () => {
		sameRetreatMatch = null;
		const result = await importParticipants(RETREAT_ID, [parishRow()], { id: 'u-1' });

		expect(result.importedCount).toBe(1);
		// retreat_participants row created by createParticipant.
		expect(mockSave).toHaveBeenCalledWith(
			expect.objectContaining({
				retreatId: RETREAT_ID,
				palancasRequested: false,
				isScholarship: false,
				requestsSingleRoom: false,
			}),
		);
	});

	it('still applies an explicit S or N from a file that does carry the columns', async () => {
		await importParticipants(
			RETREAT_ID,
			[parishRow({ palancaspedidas: 'S', becado: 'N', habitacionindividual: 'S' })],
			{ id: 'u-1' },
		);

		expect(rpWrite()).toMatchObject({
			palancasRequested: true,
			isScholarship: false,
			requestsSingleRoom: true,
		});
	});
});
