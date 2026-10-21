/**
 * A re-import must not overwrite what the team captured in emaus.cc with a
 * column the file does not carry.
 *
 * The parish export (scripts/convert-parish-registrations.py) has no palancas,
 * scholarship, single-room or meals columns: those are captured here. The
 * importer used to map an absent Y/N column to `false` (and the meals ones to
 * `null`), and the same-retreat update branch only skips `undefined`, so every
 * re-import reset "Palancas solicitadas", the scholarship (and its amount),
 * the single-room request and the meals (angelito count, Friday meal) to
 * "No"/empty for every walker already enrolled — Buen Despacho, seven
 * re-imports between Oct 1 and 8, 2026.
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
	'mealCount',
	'takesFridayMeal',
];

// Shape of a row from convert-parish-registrations.py: no palancaspedidas,
// becado, habitacionindividual, numerocomidas or comidaviernes column at all.
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
				[
					parishRow({
						palancaspedidas: blank,
						becado: blank,
						habitacionindividual: blank,
						numerocomidas: blank,
						comidaviernes: blank,
					}),
				],
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
		// retreat_participants row created by createParticipant. Meals have no
		// "off" default: null is the legitimate "not captured yet" state.
		expect(mockSave).toHaveBeenCalledWith(
			expect.objectContaining({
				retreatId: RETREAT_ID,
				palancasRequested: false,
				isScholarship: false,
				requestsSingleRoom: false,
				mealCount: null,
				takesFridayMeal: null,
			}),
		);
	});

	it('still applies an explicit S or N from a file that does carry the columns', async () => {
		await importParticipants(
			RETREAT_ID,
			[
				parishRow({
					palancaspedidas: 'S',
					becado: 'N',
					habitacionindividual: 'S',
					numerocomidas: '3',
					comidaviernes: 'S',
				}),
			],
			{ id: 'u-1' },
		);

		expect(rpWrite()).toMatchObject({
			palancasRequested: true,
			isScholarship: false,
			requestsSingleRoom: true,
			mealCount: 3,
			takesFridayMeal: true,
		});
	});

	it('a present but unparsable meal count clears it: the cell is there, it is just garbage', async () => {
		await importParticipants(
			RETREAT_ID,
			[parishRow({ numerocomidas: 'abc', comidaviernes: 'N' })],
			{ id: 'u-1' },
		);

		expect(rpWrite()).toMatchObject({
			mealCount: null,
			takesFridayMeal: false,
		});
	});
});

describe('re-import does not store the spreadsheet "no data" marker as text', () => {
	// Same guard as {participant.nickname} in the message engine: free-text
	// columns can arrive with "NA"/"N/A"/"." in cells with no data. Prod
	// carried nicknames like "." (greeted "Hola, .") and 19 emergency-contact
	// names holding a literal "NA". The mapping (strData) turns the marker
	// into `undefined`, so the update branch treats it as "sin dato" instead
	// of writing the marker over a value someone captured manually.
	//
	// NOTE on the mock: `merge` here is Object.assign, which copies
	// `undefined` too — TypeORM's real merge skips it and keeps the stored
	// value (PlainObjectToNewEntityTransformer checks `!== undefined`). So
	// asserting `undefined` on the mutated entity proves the MAPPING dropped
	// the marker; the real skip is TypeORM's, verified here by contract.
	const SAME_RETREAT = () => ({
		id: 'p-same',
		firstName: 'Juan',
		lastName: 'Pérez',
		email: 'juan@example.com',
		retreatId: RETREAT_ID,
	});

	it('maps "NA"/"N/A"/"." in apodo/ocupación/emerg1-2 to undefined', async () => {
		for (const marker of ['NA', 'N/A', 'na', '.', ' . ']) {
			sameRetreatMatch = SAME_RETREAT();
			mockUpdate.mockClear();
			const result = await importParticipants(
				RETREAT_ID,
				[
					parishRow({
						apodo: marker,
						ocupacion: marker,
						emerg1nombre: marker,
						emerg1relacion: marker,
						emerg2nombre: marker,
						emerg2relacion: marker,
					}),
				],
				{ id: 'u-1' },
			);

			expect(result.updatedCount).toBe(1);
			expect(sameRetreatMatch.nickname).toBeUndefined();
			expect(sameRetreatMatch.occupation).toBeUndefined();
			expect(sameRetreatMatch.emergencyContact1Name).toBeUndefined();
			expect(sameRetreatMatch.emergencyContact1Relation).toBeUndefined();
			expect(sameRetreatMatch.emergencyContact2Name).toBeUndefined();
			expect(sameRetreatMatch.emergencyContact2Relation).toBeUndefined();
		}
	});

	it('keeps real values from those same columns intact', async () => {
		sameRetreatMatch = SAME_RETREAT();
		await importParticipants(
			RETREAT_ID,
			[
				parishRow({
					apodo: 'Juanci',
					ocupacion: 'Ingeniero',
					emerg1nombre: 'María García',
					emerg1relacion: 'Esposa',
				}),
			],
			{ id: 'u-1' },
		);

		expect(sameRetreatMatch.nickname).toBe('Juanci');
		expect(sameRetreatMatch.occupation).toBe('Ingeniero');
		expect(sameRetreatMatch.emergencyContact1Name).toBe('María García');
		expect(sameRetreatMatch.emergencyContact1Relation).toBe('Esposa');
	});
});
