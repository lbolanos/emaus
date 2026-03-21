import * as tableMesaController from '../../controllers/tableMesaController';

// Mock the service
jest.mock('../../services/tableMesaService', () => ({
	clearAllTablesForRetreat: jest.fn(),
	rebalanceTablesForRetreat: jest.fn(),
	findTablesByRetreatId: jest.fn(),
}));

import * as tableMesaService from '../../services/tableMesaService';

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
});
