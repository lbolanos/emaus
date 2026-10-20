import * as tableMesaController from '../../controllers/tableMesaController';

// Mock the service (the pure name helpers and the error class stay real)
jest.mock('../../services/tableMesaService', () => {
	const actual = jest.requireActual('../../services/tableMesaService');
	return {
		normalizeTableName: actual.normalizeTableName,
		MAX_TABLE_NAME_LENGTH: actual.MAX_TABLE_NAME_LENGTH,
		DuplicateTableNameError: actual.DuplicateTableNameError,
		clearAllTablesForRetreat: jest.fn(),
		deleteEmptyTablesForRetreat: jest.fn(),
		rebalanceTablesForRetreat: jest.fn(),
		findTablesByRetreatId: jest.fn(),
		findTableById: jest.fn(),
		findTableRetreatId: jest.fn(),
		createTable: jest.fn(),
		updateTable: jest.fn(),
		setTablePhoto: jest.fn(),
		removeTablePhoto: jest.fn(),
		deleteTable: jest.fn(),
		assignLeaderToTable: jest.fn(),
		unassignLeaderFromTable: jest.fn(),
		assignWalkerToTable: jest.fn(),
		unassignWalkerFromTable: jest.fn(),
	};
});

jest.mock('../../middleware/authorization', () => ({
	...jest.requireActual('../../middleware/authorization'),
	ensureRetreatAccess: jest.fn(),
}));

// The handlers under test shape their payload with canViewHealthData; the guard
// wiring is what we assert here, so health data is always allowed.
jest.mock('../../controllers/participantController', () => ({
	...jest.requireActual('../../controllers/participantController'),
	canViewHealthData: jest.fn().mockResolvedValue(true),
}));

import * as tableMesaService from '../../services/tableMesaService';
import { ensureRetreatAccess } from '../../middleware/authorization';

describe('Table Mesa Controller', () => {
	const createMockRequest = (overrides: any = {}) => ({
		params: {},
		body: {},
		query: {},
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

	const mockNext = jest.fn();

	beforeEach(() => {
		jest.clearAllMocks();
	});

	describe('clearAllTables', () => {
		test('should return 200 on success', async () => {
			(tableMesaService.clearAllTablesForRetreat as jest.Mock).mockResolvedValue(undefined);

			const req = createMockRequest({ params: { retreatId: 'test-retreat-id' } });
			const res = createMockResponse();

			await tableMesaController.clearAllTables(req as any, res as any, mockNext);

			expect(tableMesaService.clearAllTablesForRetreat).toHaveBeenCalledWith('test-retreat-id');
			expect(res.status).toHaveBeenCalledWith(200);
			expect(res.json).toHaveBeenCalledWith({ message: 'All tables cleared successfully' });
		});

		test('should call next with error on failure', async () => {
			const error = new Error('Database error');
			(tableMesaService.clearAllTablesForRetreat as jest.Mock).mockRejectedValue(error);

			const req = createMockRequest({ params: { retreatId: 'test-retreat-id' } });
			const res = createMockResponse();

			await tableMesaController.clearAllTables(req as any, res as any, mockNext);

			expect(mockNext).toHaveBeenCalledWith(error);
			expect(res.status).not.toHaveBeenCalled();
		});

		test('should pass retreatId from params to service', async () => {
			(tableMesaService.clearAllTablesForRetreat as jest.Mock).mockResolvedValue(undefined);

			const retreatId = '4082eb4b-10ba-4e9b-806b-eeca32a0f61a';
			const req = createMockRequest({ params: { retreatId } });
			const res = createMockResponse();

			await tableMesaController.clearAllTables(req as any, res as any, mockNext);

			expect(tableMesaService.clearAllTablesForRetreat).toHaveBeenCalledWith(retreatId);
		});
	});

	describe('deleteEmptyTables', () => {
		test('should return 200 with the deletion summary', async () => {
			(tableMesaService.deleteEmptyTablesForRetreat as jest.Mock).mockResolvedValue({
				deletedCount: 2,
				deletedNames: ['Mesa 4', 'Mesa 5'],
			});

			const req = createMockRequest({ params: { retreatId: 'test-retreat-id' } });
			const res = createMockResponse();

			await tableMesaController.deleteEmptyTables(req as any, res as any, mockNext);

			expect(tableMesaService.deleteEmptyTablesForRetreat).toHaveBeenCalledWith('test-retreat-id');
			expect(res.status).toHaveBeenCalledWith(200);
			expect(res.json).toHaveBeenCalledWith({
				deletedCount: 2,
				deletedNames: ['Mesa 4', 'Mesa 5'],
			});
		});

		test('should call next with error on failure', async () => {
			const error = new Error('Delete error');
			(tableMesaService.deleteEmptyTablesForRetreat as jest.Mock).mockRejectedValue(error);

			const req = createMockRequest({ params: { retreatId: 'test-retreat-id' } });
			const res = createMockResponse();

			await tableMesaController.deleteEmptyTables(req as any, res as any, mockNext);

			expect(mockNext).toHaveBeenCalledWith(error);
			expect(res.status).not.toHaveBeenCalled();
		});
	});

	describe('rebalanceTables', () => {
		test('should return 200 on success', async () => {
			(tableMesaService.rebalanceTablesForRetreat as jest.Mock).mockResolvedValue(undefined);

			const req = createMockRequest({ params: { retreatId: 'test-retreat-id' } });
			const res = createMockResponse();

			await tableMesaController.rebalanceTables(req as any, res as any, mockNext);

			expect(tableMesaService.rebalanceTablesForRetreat).toHaveBeenCalledWith('test-retreat-id');
			expect(res.status).toHaveBeenCalledWith(200);
			expect(res.json).toHaveBeenCalledWith({ message: 'Tables rebalanced successfully' });
		});

		test('should call next with error on failure', async () => {
			const error = new Error('Rebalance error');
			(tableMesaService.rebalanceTablesForRetreat as jest.Mock).mockRejectedValue(error);

			const req = createMockRequest({ params: { retreatId: 'test-retreat-id' } });
			const res = createMockResponse();

			await tableMesaController.rebalanceTables(req as any, res as any, mockNext);

			expect(mockNext).toHaveBeenCalledWith(error);
		});
	});

	describe('updateTable (rename)', () => {
		const tableId = 'table-1';
		const retreatId = 'retreat-1';

		beforeEach(() => {
			(tableMesaService.findTableRetreatId as jest.Mock).mockResolvedValue(retreatId);
			(ensureRetreatAccess as jest.Mock).mockResolvedValue(true);
		});

		test('should pass only the normalized name to the service', async () => {
			(tableMesaService.updateTable as jest.Mock).mockResolvedValue({ id: tableId, name: 'Mesa 12' });
			const req = createMockRequest({
				params: { id: tableId },
				body: { name: '  Mesa   12 ', retreatId: 'other-retreat', liderId: 'someone' },
			});
			const res = createMockResponse();

			await tableMesaController.updateTable(req as any, res as any, mockNext);

			expect(ensureRetreatAccess).toHaveBeenCalledWith(req, res, retreatId);
			expect(tableMesaService.updateTable).toHaveBeenCalledWith(tableId, { name: 'Mesa 12' });
			expect(res.json).toHaveBeenCalledWith({ id: tableId, name: 'Mesa 12' });
		});

		test.each([
			['missing', {}],
			['blank', { name: '   ' }],
			['not a string', { name: 12 }],
			['too long', { name: 'M'.repeat(61) }],
		])('should return 400 when the name is %s', async (_label, body) => {
			const req = createMockRequest({ params: { id: tableId }, body });
			const res = createMockResponse();

			await tableMesaController.updateTable(req as any, res as any, mockNext);

			expect(res.status).toHaveBeenCalledWith(400);
			expect(tableMesaService.updateTable).not.toHaveBeenCalled();
		});

		test('should return 404 when the table does not exist', async () => {
			(tableMesaService.findTableRetreatId as jest.Mock).mockResolvedValue(null);
			const req = createMockRequest({ params: { id: tableId }, body: { name: 'Mesa 2' } });
			const res = createMockResponse();

			await tableMesaController.updateTable(req as any, res as any, mockNext);

			expect(res.status).toHaveBeenCalledWith(404);
			expect(tableMesaService.updateTable).not.toHaveBeenCalled();
		});

		test('should not rename when the user has no access to the table retreat', async () => {
			// ensureRetreatAccess already answered 403 and returns false.
			(ensureRetreatAccess as jest.Mock).mockResolvedValue(false);
			const req = createMockRequest({ params: { id: tableId }, body: { name: 'Mesa 2' } });
			const res = createMockResponse();

			await tableMesaController.updateTable(req as any, res as any, mockNext);

			expect(tableMesaService.updateTable).not.toHaveBeenCalled();
			expect(res.json).not.toHaveBeenCalled();
		});

		test('should return 409 when another table of the retreat already uses the name', async () => {
			(tableMesaService.updateTable as jest.Mock).mockRejectedValue(
				new tableMesaService.DuplicateTableNameError('Mesa 2'),
			);
			const req = createMockRequest({ params: { id: tableId }, body: { name: 'Mesa 2' } });
			const res = createMockResponse();

			await tableMesaController.updateTable(req as any, res as any, mockNext);

			expect(res.status).toHaveBeenCalledWith(409);
			expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ name: 'Mesa 2' }));
			expect(mockNext).not.toHaveBeenCalled();
		});
	});

	describe('setTablePhoto', () => {
		const tableId = 'table-1';
		const retreatId = 'retreat-1';
		const photoData = 'data:image/jpeg;base64,abc123';
		const table = { id: tableId, name: 'Mesa 1', retreatId, photoUrl: photoData };

		beforeEach(() => {
			(tableMesaService.findTableRetreatId as jest.Mock).mockResolvedValue(retreatId);
			(ensureRetreatAccess as jest.Mock).mockResolvedValue(true);
		});

		test('should upload via the service and answer the table', async () => {
			(tableMesaService.setTablePhoto as jest.Mock).mockResolvedValue(table);
			const req = createMockRequest({ params: { id: tableId }, body: { photoData } });
			const res = createMockResponse();

			await tableMesaController.setTablePhoto(req as any, res as any, mockNext);

			expect(ensureRetreatAccess).toHaveBeenCalledWith(req, res, retreatId);
			expect(tableMesaService.setTablePhoto).toHaveBeenCalledWith(tableId, photoData);
			expect(res.json).toHaveBeenCalledWith(table);
		});

		test.each([
			['missing', {}],
			['not an image data URI', { photoData: 'https://example.com/x.jpg' }],
			['too large', { photoData: `data:image/png;base64,${'a'.repeat(4_000_001)}` }],
		])('should return 400 when the body is %s', async (_label, body) => {
			const req = createMockRequest({ params: { id: tableId }, body });
			const res = createMockResponse();

			await tableMesaController.setTablePhoto(req as any, res as any, mockNext);

			expect(res.status).toHaveBeenCalledWith(400);
			expect(tableMesaService.setTablePhoto).not.toHaveBeenCalled();
		});

		test('should return 404 when the table does not exist', async () => {
			(tableMesaService.findTableRetreatId as jest.Mock).mockResolvedValue(null);
			const req = createMockRequest({ params: { id: tableId }, body: { photoData } });
			const res = createMockResponse();

			await tableMesaController.setTablePhoto(req as any, res as any, mockNext);

			expect(res.status).toHaveBeenCalledWith(404);
			expect(tableMesaService.setTablePhoto).not.toHaveBeenCalled();
		});

		test('should not upload when the user has no access to the table retreat', async () => {
			(ensureRetreatAccess as jest.Mock).mockResolvedValue(false);
			const req = createMockRequest({ params: { id: tableId }, body: { photoData } });
			const res = createMockResponse();

			await tableMesaController.setTablePhoto(req as any, res as any, mockNext);

			expect(tableMesaService.setTablePhoto).not.toHaveBeenCalled();
			expect(res.json).not.toHaveBeenCalled();
		});
	});

	describe('removeTablePhoto', () => {
		const tableId = 'table-1';
		const retreatId = 'retreat-1';

		beforeEach(() => {
			(tableMesaService.findTableRetreatId as jest.Mock).mockResolvedValue(retreatId);
			(ensureRetreatAccess as jest.Mock).mockResolvedValue(true);
		});

		test('should remove via the service and answer the table', async () => {
			const table = { id: tableId, name: 'Mesa 1', retreatId, photoUrl: null };
			(tableMesaService.removeTablePhoto as jest.Mock).mockResolvedValue(table);
			const req = createMockRequest({ params: { id: tableId } });
			const res = createMockResponse();

			await tableMesaController.removeTablePhoto(req as any, res as any, mockNext);

			expect(ensureRetreatAccess).toHaveBeenCalledWith(req, res, retreatId);
			expect(tableMesaService.removeTablePhoto).toHaveBeenCalledWith(tableId);
			expect(res.json).toHaveBeenCalledWith(table);
		});

		test('should return 404 when the table does not exist', async () => {
			(tableMesaService.findTableRetreatId as jest.Mock).mockResolvedValue(null);
			const req = createMockRequest({ params: { id: tableId } });
			const res = createMockResponse();

			await tableMesaController.removeTablePhoto(req as any, res as any, mockNext);

			expect(res.status).toHaveBeenCalledWith(404);
			expect(tableMesaService.removeTablePhoto).not.toHaveBeenCalled();
		});

		test('should not remove when the user has no access to the table retreat', async () => {
			(ensureRetreatAccess as jest.Mock).mockResolvedValue(false);
			const req = createMockRequest({ params: { id: tableId } });
			const res = createMockResponse();

			await tableMesaController.removeTablePhoto(req as any, res as any, mockNext);

			expect(tableMesaService.removeTablePhoto).not.toHaveBeenCalled();
			expect(res.json).not.toHaveBeenCalled();
		});
	});

	describe('getTable', () => {
		const table = { id: 'table-1', name: 'Mesa 1', retreatId: 'retreat-1' };

		test('should return 404 when the table does not exist', async () => {
			(tableMesaService.findTableById as jest.Mock).mockResolvedValue(null);
			const req = createMockRequest({ params: { id: 'table-1' } });
			const res = createMockResponse();

			await tableMesaController.getTable(req as any, res as any, mockNext);

			expect(res.status).toHaveBeenCalledWith(404);
			expect(ensureRetreatAccess).not.toHaveBeenCalled();
		});

		test('should check access to the table retreat before answering', async () => {
			(tableMesaService.findTableById as jest.Mock).mockResolvedValue(table);
			(ensureRetreatAccess as jest.Mock).mockResolvedValue(false);
			const req = createMockRequest({ params: { id: 'table-1' } });
			const res = createMockResponse();

			await tableMesaController.getTable(req as any, res as any, mockNext);

			expect(ensureRetreatAccess).toHaveBeenCalledWith(req, res, 'retreat-1');
			expect(res.json).not.toHaveBeenCalled();
		});

		test('should return the table when the user has access', async () => {
			(tableMesaService.findTableById as jest.Mock).mockResolvedValue(table);
			(ensureRetreatAccess as jest.Mock).mockResolvedValue(true);
			const req = createMockRequest({ params: { id: 'table-1' } });
			const res = createMockResponse();

			await tableMesaController.getTable(req as any, res as any, mockNext);

			expect(res.json).toHaveBeenCalledWith(table);
		});
	});

	describe('createTable', () => {
		// D5 (spec tables-second-cycle) validates the body with zod: retreatId
		// must be a real uuid and only retreatId/name reach the service.
		const retreatId = '11111111-1111-4111-8111-111111111111';

		test('should return 400 when retreatId is missing', async () => {
			const req = createMockRequest({ body: {} });
			const res = createMockResponse();

			await tableMesaController.createTable(req as any, res as any, mockNext);

			expect(res.status).toHaveBeenCalledWith(400);
			expect(res.json).toHaveBeenCalledWith(
				expect.objectContaining({ message: 'Validation error' }),
			);
			expect(tableMesaService.createTable).not.toHaveBeenCalled();
		});

		test.each([
			['not a uuid', { retreatId: 'retreat-1' }],
			['blank name', { retreatId, name: '   ' }],
			['name too long', { retreatId, name: 'M'.repeat(61) }],
		])('should return 400 when the body is %s, before any access check', async (_label, body) => {
			const req = createMockRequest({ body });
			const res = createMockResponse();

			await tableMesaController.createTable(req as any, res as any, mockNext);

			expect(res.status).toHaveBeenCalledWith(400);
			expect(ensureRetreatAccess).not.toHaveBeenCalled();
			expect(tableMesaService.createTable).not.toHaveBeenCalled();
		});

		test('should check access to the target retreat before creating', async () => {
			(ensureRetreatAccess as jest.Mock).mockResolvedValue(false);
			const req = createMockRequest({ body: { retreatId } });
			const res = createMockResponse();

			await tableMesaController.createTable(req as any, res as any, mockNext);

			expect(ensureRetreatAccess).toHaveBeenCalledWith(req, res, retreatId);
			expect(tableMesaService.createTable).not.toHaveBeenCalled();
			expect(res.json).not.toHaveBeenCalled();
		});

		test('should create the table and return 201 when the user has access', async () => {
			(ensureRetreatAccess as jest.Mock).mockResolvedValue(true);
			(tableMesaService.createTable as jest.Mock).mockResolvedValue({
				id: 'table-2',
				name: 'Mesa 2',
			});
			const req = createMockRequest({ body: { retreatId } });
			const res = createMockResponse();

			await tableMesaController.createTable(req as any, res as any, mockNext);

			expect(tableMesaService.createTable).toHaveBeenCalledWith({ retreatId });
			expect(res.status).toHaveBeenCalledWith(201);
			expect(res.json).toHaveBeenCalledWith({ id: 'table-2', name: 'Mesa 2' });
		});

		test('strips unknown fields: mass-assignment keys never reach the service', async () => {
			(ensureRetreatAccess as jest.Mock).mockResolvedValue(true);
			(tableMesaService.createTable as jest.Mock).mockResolvedValue({
				id: 'table-2',
				name: 'Mesa 2',
			});
			const req = createMockRequest({
				body: { retreatId, photoUrl: 'https://evil/x.webp', liderId: 'p-1', sortOrder: 99 },
			});
			const res = createMockResponse();

			await tableMesaController.createTable(req as any, res as any, mockNext);

			// Deep equality: any key the schema failed to strip fails this.
			expect(tableMesaService.createTable).toHaveBeenCalledWith({ retreatId });
			expect(res.status).toHaveBeenCalledWith(201);
		});

		test('normalizes a provided name before it reaches the service', async () => {
			(ensureRetreatAccess as jest.Mock).mockResolvedValue(true);
			(tableMesaService.createTable as jest.Mock).mockResolvedValue({
				id: 'table-2',
				name: 'Mesa 5',
			});
			const req = createMockRequest({ body: { retreatId, name: '  Mesa   5 ' } });
			const res = createMockResponse();

			await tableMesaController.createTable(req as any, res as any, mockNext);

			expect(tableMesaService.createTable).toHaveBeenCalledWith({ retreatId, name: 'Mesa 5' });
		});
	});

	describe('deleteTable', () => {
		test('should return 404 when the table does not exist', async () => {
			(tableMesaService.findTableRetreatId as jest.Mock).mockResolvedValue(null);
			const req = createMockRequest({ params: { id: 'table-1' } });
			const res = createMockResponse();

			await tableMesaController.deleteTable(req as any, res as any, mockNext);

			expect(res.status).toHaveBeenCalledWith(404);
			expect(tableMesaService.deleteTable).not.toHaveBeenCalled();
		});

		test('should check access before deleting', async () => {
			(tableMesaService.findTableRetreatId as jest.Mock).mockResolvedValue('retreat-1');
			(ensureRetreatAccess as jest.Mock).mockResolvedValue(false);
			const req = createMockRequest({ params: { id: 'table-1' } });
			const res = createMockResponse();

			await tableMesaController.deleteTable(req as any, res as any, mockNext);

			expect(ensureRetreatAccess).toHaveBeenCalledWith(req, res, 'retreat-1');
			expect(tableMesaService.deleteTable).not.toHaveBeenCalled();
		});

		test('should delete and return 204 when the user has access', async () => {
			(tableMesaService.findTableRetreatId as jest.Mock).mockResolvedValue('retreat-1');
			(ensureRetreatAccess as jest.Mock).mockResolvedValue(true);
			(tableMesaService.deleteTable as jest.Mock).mockResolvedValue(undefined);
			const req = createMockRequest({ params: { id: 'table-1' } });
			const res = createMockResponse();

			await tableMesaController.deleteTable(req as any, res as any, mockNext);

			expect(tableMesaService.deleteTable).toHaveBeenCalledWith('table-1');
			expect(res.status).toHaveBeenCalledWith(204);
		});
	});

	describe('assign/unassign handlers check the table retreat', () => {
		const tableId = '1b6f9c2e-9d3b-4a2c-b1e0-7f2a5c8d9e01';
		const retreatId = 'retreat-1';
		const updatedTable = { id: tableId, name: 'Mesa 1', retreatId };

		const cases = [
			['assignLeader', 'assignLeaderToTable', { id: tableId, role: 'lider' }, { participantId: 'p-1' }],
			['unassignLeader', 'unassignLeaderFromTable', { id: tableId, role: 'colider1' }, {}],
			['assignWalker', 'assignWalkerToTable', { id: tableId }, { participantId: 'p-1' }],
			['unassignWalker', 'unassignWalkerFromTable', { id: tableId, walkerId: 'w-1' }, {}],
		] as [string, string, any, any][];

		test.each(cases)('%s: 404 when the table does not exist', async (handler, serviceFn, params, body) => {
			(tableMesaService.findTableRetreatId as jest.Mock).mockResolvedValue(null);
			const req = createMockRequest({ params, body });
			const res = createMockResponse();

			await (tableMesaController as any)[handler](req as any, res as any, mockNext);

			expect(res.status).toHaveBeenCalledWith(404);
			expect((tableMesaService as any)[serviceFn]).not.toHaveBeenCalled();
		});

		test.each(cases)(
			'%s: does not touch the service without retreat access',
			async (handler, serviceFn, params, body) => {
				(tableMesaService.findTableRetreatId as jest.Mock).mockResolvedValue(retreatId);
				(ensureRetreatAccess as jest.Mock).mockResolvedValue(false);
				const req = createMockRequest({ params, body });
				const res = createMockResponse();

				await (tableMesaController as any)[handler](req as any, res as any, mockNext);

				expect(tableMesaService.findTableRetreatId).toHaveBeenCalledWith(tableId);
				expect(ensureRetreatAccess).toHaveBeenCalledWith(req, res, retreatId);
				expect((tableMesaService as any)[serviceFn]).not.toHaveBeenCalled();
				expect(res.json).not.toHaveBeenCalled();
			},
		);

		test.each(cases)('%s: proceeds when the user has access', async (handler, serviceFn, params, body) => {
			(tableMesaService.findTableRetreatId as jest.Mock).mockResolvedValue(retreatId);
			(ensureRetreatAccess as jest.Mock).mockResolvedValue(true);
			((tableMesaService as any)[serviceFn] as jest.Mock).mockResolvedValue(updatedTable);
			const req = createMockRequest({ params, body });
			const res = createMockResponse();

			await (tableMesaController as any)[handler](req as any, res as any, mockNext);

			expect((tableMesaService as any)[serviceFn]).toHaveBeenCalled();
			expect(res.json).toHaveBeenCalledWith(updatedTable);
		});
	});
});
