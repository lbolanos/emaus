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
		findTableRetreatId: jest.fn(),
		updateTable: jest.fn(),
	};
});

jest.mock('../../middleware/authorization', () => ({
	...jest.requireActual('../../middleware/authorization'),
	ensureRetreatAccess: jest.fn(),
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
});
