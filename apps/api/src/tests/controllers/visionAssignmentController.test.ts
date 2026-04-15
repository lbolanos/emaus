import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import type { Request, Response, NextFunction } from 'express';

// Mock service before importing controller
jest.mock('../../services/visionAssignmentService', () => ({
	analyzeLotteryPhoto: jest.fn(),
	analyzeTablePhoto: jest.fn(),
	executeAssignments: jest.fn(),
}));

import { analyze, analyzeTable, execute } from '../../controllers/visionAssignmentController';
import * as visionService from '../../services/visionAssignmentService';

const mockAnalyzeLotteryPhoto = visionService.analyzeLotteryPhoto as jest.MockedFunction<typeof visionService.analyzeLotteryPhoto>;
const mockAnalyzeTablePhoto = visionService.analyzeTablePhoto as jest.MockedFunction<typeof visionService.analyzeTablePhoto>;
const mockExecuteAssignments = visionService.executeAssignments as jest.MockedFunction<typeof visionService.executeAssignments>;

function makeRes() {
	const res = {
		status: jest.fn().mockReturnThis(),
		json: jest.fn().mockReturnThis(),
		headersSent: false,
	} as unknown as Response;
	return res;
}

const next = jest.fn() as unknown as NextFunction;

const sampleAnalysisResult = {
	proposals: [
		{ idOnRetreat: 1, participantId: 'p-1', participantName: 'Juan Pérez', tableName: 'Mesa 1', tableId: 't-1', valid: true },
		{ idOnRetreat: 99, participantId: null, participantName: null, tableName: 'Mesa 1', tableId: 't-1', valid: false, error: 'ID 99 no encontrado' },
	],
	unreadable: [{ description: 'Tarjeta borrosa en esquina inferior' }],
	notes: 'Foto clara, 2 IDs identificados',
};

describe('visionAssignmentController', () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	// ─── analyze ─────────────────────────────────────────────────────────────

	describe('analyze', () => {
		it('returns 400 when imageBase64 is missing', async () => {
			const req = { body: { contentType: 'image/jpeg', retreatId: 'r-1' } } as Request;
			const res = makeRes();
			await analyze(req, res, next);
			expect((res.status as jest.Mock).mock.calls[0][0]).toBe(400);
		});

		it('returns 400 when contentType is missing', async () => {
			const req = { body: { imageBase64: 'abc', retreatId: 'r-1' } } as Request;
			const res = makeRes();
			await analyze(req, res, next);
			expect((res.status as jest.Mock).mock.calls[0][0]).toBe(400);
		});

		it('returns 400 when retreatId is missing', async () => {
			const req = { body: { imageBase64: 'abc', contentType: 'image/jpeg' } } as Request;
			const res = makeRes();
			await analyze(req, res, next);
			expect((res.status as jest.Mock).mock.calls[0][0]).toBe(400);
		});

		it('returns 400 when image exceeds 10MB', async () => {
			// ~10.5MB after base64 decode: (length * 3 / 4) > 10MB → length > 13.3M chars
			const bigBase64 = 'A'.repeat(14_000_000);
			const req = { body: { imageBase64: bigBase64, contentType: 'image/jpeg', retreatId: 'r-1' } } as Request;
			const res = makeRes();
			await analyze(req, res, next);
			expect((res.status as jest.Mock).mock.calls[0][0]).toBe(400);
		});

		it('calls analyzeLotteryPhoto and returns result', async () => {
			mockAnalyzeLotteryPhoto.mockResolvedValueOnce(sampleAnalysisResult as any);
			const req = { body: { imageBase64: 'validBase64', contentType: 'image/jpeg', retreatId: 'r-1' } } as Request;
			const res = makeRes();
			await analyze(req, res, next);
			expect(mockAnalyzeLotteryPhoto).toHaveBeenCalledWith('validBase64', 'image/jpeg', 'r-1');
			expect((res.json as jest.Mock).mock.calls[0][0]).toEqual(sampleAnalysisResult);
		});

		it('calls next(error) when service throws', async () => {
			const err = new Error('AI error');
			mockAnalyzeLotteryPhoto.mockRejectedValueOnce(err);
			const req = { body: { imageBase64: 'x', contentType: 'image/jpeg', retreatId: 'r-1' } } as Request;
			const res = makeRes();
			await analyze(req, res, next);
			expect(next).toHaveBeenCalledWith(err);
		});
	});

	// ─── analyzeTable ─────────────────────────────────────────────────────────

	describe('analyzeTable', () => {
		it('returns 400 when tableId is missing', async () => {
			const req = { body: { imageBase64: 'abc', contentType: 'image/jpeg', retreatId: 'r-1' } } as Request;
			const res = makeRes();
			await analyzeTable(req, res, next);
			expect((res.status as jest.Mock).mock.calls[0][0]).toBe(400);
		});

		it('returns 400 when image exceeds 10MB', async () => {
			const bigBase64 = 'A'.repeat(14_000_000);
			const req = { body: { imageBase64: bigBase64, contentType: 'image/png', retreatId: 'r-1', tableId: 't-1' } } as Request;
			const res = makeRes();
			await analyzeTable(req, res, next);
			expect((res.status as jest.Mock).mock.calls[0][0]).toBe(400);
		});

		it('calls analyzeTablePhoto and returns result', async () => {
			mockAnalyzeTablePhoto.mockResolvedValueOnce(sampleAnalysisResult as any);
			const req = { body: { imageBase64: 'b64', contentType: 'image/webp', retreatId: 'r-1', tableId: 't-1' } } as Request;
			const res = makeRes();
			await analyzeTable(req, res, next);
			expect(mockAnalyzeTablePhoto).toHaveBeenCalledWith('b64', 'image/webp', 'r-1', 't-1');
			expect((res.json as jest.Mock).mock.calls[0][0]).toEqual(sampleAnalysisResult);
		});

		it('calls next(error) when service throws', async () => {
			const err = new Error('Table not found');
			mockAnalyzeTablePhoto.mockRejectedValueOnce(err);
			const req = { body: { imageBase64: 'x', contentType: 'image/jpeg', retreatId: 'r-1', tableId: 't-1' } } as Request;
			const res = makeRes();
			await analyzeTable(req, res, next);
			expect(next).toHaveBeenCalledWith(err);
		});
	});

	// ─── execute ─────────────────────────────────────────────────────────────

	describe('execute', () => {
		const validAssignments = [
			{ participantId: 'p-1', tableId: 't-1', idOnRetreat: 1, participantName: 'Juan Pérez', tableName: 'Mesa 1' },
		];

		it('returns 400 when retreatId is missing', async () => {
			const req = { body: { assignments: validAssignments } } as Request;
			const res = makeRes();
			await execute(req, res, next);
			expect((res.status as jest.Mock).mock.calls[0][0]).toBe(400);
		});

		it('returns 400 when assignments is empty', async () => {
			const req = { body: { retreatId: 'r-1', assignments: [] } } as Request;
			const res = makeRes();
			await execute(req, res, next);
			expect((res.status as jest.Mock).mock.calls[0][0]).toBe(400);
		});

		it('calls executeAssignments and wraps result in { results }', async () => {
			const execResult = [{ idOnRetreat: 1, participantName: 'Juan Pérez', tableName: 'Mesa 1', success: true }];
			mockExecuteAssignments.mockResolvedValueOnce(execResult as any);
			const req = { body: { retreatId: 'r-1', assignments: validAssignments } } as Request;
			const res = makeRes();
			await execute(req, res, next);
			expect(mockExecuteAssignments).toHaveBeenCalledWith('r-1', validAssignments);
			expect((res.json as jest.Mock).mock.calls[0][0]).toEqual({ results: execResult });
		});

		it('calls next(error) when service throws', async () => {
			const err = new Error('DB error');
			mockExecuteAssignments.mockRejectedValueOnce(err);
			const req = { body: { retreatId: 'r-1', assignments: validAssignments } } as Request;
			const res = makeRes();
			await execute(req, res, next);
			expect(next).toHaveBeenCalledWith(err);
		});
	});
});
