/**
 * Guard for §25.3 of the troubleshooting skill: the import used to lose a row
 * whenever a create followed an update.
 *
 * `updateParticipant` fired `void domainAuditService.logUpdate(...)` with no
 * await. That save runs on the shared connection, and while it is still in
 * flight the next row opens its own `AppDataSource.transaction` inside
 * `createParticipant` — SQLite answers "cannot start a transaction within a
 * transaction" and the row dies with nothing but a skippedCount to show for it.
 *
 * The create path already silences its audit during an import
 * (`if (!isImporting && createdParticipant)`); the update path did not.
 *
 * A race cannot be pinned down by a test — it reproduces with the same data but
 * not always. What IS worth fixing in place is the guard itself: during an
 * import, the update path must not audit row by row. That is what this checks.
 */

const mockFindOne = jest.fn();
const mockSave = jest.fn();
const mockFind = jest.fn(async () => []);
const mockUpdate = jest.fn(async () => ({ affected: 0 }));
const mockQuery = jest.fn(async () => []);
const mockRepo = {
	findOne: mockFindOne,
	findOneBy: mockFindOne,
	find: mockFind,
	save: mockSave,
	update: mockUpdate,
	create: (x: any) => x,
	merge: (target: any, source: any) => Object.assign(target, source),
	count: jest.fn(async () => 0),
	delete: jest.fn(async () => ({ affected: 0 })),
	createQueryBuilder: () => ({
		where: () => ({ andWhere: () => ({ getOne: async () => null, getMany: async () => [] }) }),
		andWhere: () => ({ getOne: async () => null, getMany: async () => [] }),
		getOne: async () => null,
		getMany: async () => [],
	}),
};
const mockTransaction = jest.fn(async (cb: any) => cb({ getRepository: () => mockRepo }));

jest.mock('../../data-source', () => ({
	AppDataSource: {
		getRepository: () => mockRepo,
		transaction: mockTransaction,
		query: mockQuery,
	},
}));

const mockLogUpdate = jest.fn();
jest.mock('../../services/domainAuditService', () => ({
	domainAuditService: {
		logUpdate: mockLogUpdate,
		logCreate: jest.fn(),
		logDelete: jest.fn(),
	},
	DomainAuditAction: {},
}));

import { updateParticipant } from '../../services/participantService';

const participant = {
	id: 'p-1',
	firstName: 'Juan',
	lastName: 'Pérez',
	email: 'juan@example.com',
	retreatId: 'r-1',
	type: 'walker',
};

describe('la importación no audita fila a fila (§25.3)', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		mockFindOne.mockResolvedValue({ ...participant });
		mockSave.mockImplementation(async (entity: any) => entity);
	});

	it('durante un import NO llama a la auditoría', async () => {
		await updateParticipant('p-1', { nickname: 'Juancho' } as any, true, true);

		expect(mockLogUpdate).not.toHaveBeenCalled();
	});

	it('fuera del import SÍ audita, que es el comportamiento normal', async () => {
		await updateParticipant('p-1', { nickname: 'Juancho' } as any, false, false);

		expect(mockLogUpdate).toHaveBeenCalledTimes(1);
	});

	it('por omisión audita: sólo el import se salta la auditoría', async () => {
		// Firma: (id, data, skipRebalance, isImporting). Quien llame sin el cuarto
		// argumento —todo el código fuera del import— debe seguir auditando.
		await updateParticipant('p-1', { nickname: 'Juancho' } as any);

		expect(mockLogUpdate).toHaveBeenCalledTimes(1);
	});
});
