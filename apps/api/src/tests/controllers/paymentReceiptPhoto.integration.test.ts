import { setupTestDatabase, teardownTestDatabase, clearTestData } from '../test-setup';
import { TestDataFactory } from '../test-utils/testDataFactory';
import { AppDataSource } from '@/data-source';
import { Payment } from '@/entities/payment.entity';
import { PaymentController } from '@/controllers/paymentController';
import { authorizationService } from '@/middleware/authorization';
import { avatarStorageService } from '@/services/avatarStorageService';
import { s3Service } from '@/services/s3Service';

/**
 * Receipt photo on payments (specs/payment-receipt-photo/spec.md): create with
 * photo (base64 storage mode stores the data-URI; S3 mode uploads BEFORE the
 * insert, spec D4), invalid/oversized payloads → 400, '' → absent, PUT
 * replace/clear/untouched, DELETE cleans the S3 object, every read strips
 * `receiptS3Key`.
 *
 * Real controller against the test DB, middleware authorization spied open
 * (same approach as payment.authz.integration.test.ts).
 */

// 1×1 transparent PNG — small enough for sharp, real magic bytes.
const TINY_PNG =
	'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

// 1×1 red PNG — a second valid image for the replace flow.
const TINY_PNG_B =
	'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

// Respuesta mínima de Express para invocar el controlador sin levantar el router.
function mockRes() {
	const res: any = { statusCode: 200, body: undefined };
	res.status = (code: number) => {
		res.statusCode = code;
		return res;
	};
	res.json = (body: any) => {
		res.body = body;
		return res;
	};
	return res;
}

describe('PaymentController — receipt photo (comprobante)', () => {
	const controller = new PaymentController();
	let retreat: any;
	let participant: any;
	let actor: any;

	beforeAll(async () => {
		await setupTestDatabase();
	});

	afterAll(async () => {
		await teardownTestDatabase();
	});

	beforeEach(async () => {
		await clearTestData();
		jest.restoreAllMocks();
		actor = await TestDataFactory.createTestUser();
		retreat = await TestDataFactory.createTestRetreat();
		participant = await TestDataFactory.createTestParticipant(retreat.id);
		jest.spyOn(authorizationService, 'hasRetreatAccess').mockResolvedValue(true);
	});

	const paymentBody = (extra: Record<string, unknown> = {}) => ({
		participantId: participant.id,
		amount: 300,
		paymentDate: '2026-06-01',
		paymentMethod: 'transfer',
		retreatId: retreat.id,
		...extra,
	});

	const rowFor = async (id: string) =>
		AppDataSource.getRepository(Payment).findOne({ where: { id } });

	it('createPayment stores the data-URI as receiptUrl in base64 storage mode', async () => {
		const req: any = { body: paymentBody({ receiptPhoto: TINY_PNG }), user: { id: actor.id } };
		const res = mockRes();
		await controller.createPayment(req, res);

		expect(res.statusCode).toBe(201);
		expect(res.body.receiptUrl).toBe(TINY_PNG);
		// The internal S3 key never reaches the client.
		expect(res.body.receiptS3Key).toBeUndefined();
		const row = await rowFor(res.body.id);
		expect(row?.receiptUrl).toBe(TINY_PNG);
		expect(row?.receiptS3Key).toBeNull();
	});

	it('createPayment treats receiptPhoto: "" as absent', async () => {
		const req: any = { body: paymentBody({ receiptPhoto: '' }), user: { id: actor.id } };
		const res = mockRes();
		await controller.createPayment(req, res);

		expect(res.statusCode).toBe(201);
		expect(res.body.receiptUrl).toBeNull();
		expect(await rowFor(res.body.id)).toMatchObject({ receiptUrl: null });
	});

	it('createPayment answers 400 for a non-image data-URL', async () => {
		const req: any = {
			body: paymentBody({ receiptPhoto: 'data:text/html;base64,PGh0bWw+' }),
			user: { id: actor.id },
		};
		const res = mockRes();
		await controller.createPayment(req, res);

		expect(res.statusCode).toBe(400);
		// No payment row must exist for a rejected photo (count for THIS
		// participant: clearTestData does not wipe payments from other tests).
		expect(
			await AppDataSource.getRepository(Payment).count({ where: { participantId: participant.id } }),
		).toBe(0);
	});

	it('createPayment answers 400 when the binary exceeds 2MB', async () => {
		const oversized = `data:image/png;base64,${'A'.repeat(4 * 1024 * 1024)}`;
		const req: any = { body: paymentBody({ receiptPhoto: oversized }), user: { id: actor.id } };
		const res = mockRes();
		await controller.createPayment(req, res);

		expect(res.statusCode).toBe(400);
		expect(
			await AppDataSource.getRepository(Payment).count({ where: { participantId: participant.id } }),
		).toBe(0);
	});

	it('updatePayment replaces the receipt, clears it with "" and leaves it untouched when absent', async () => {
		const req: any = { body: paymentBody({ receiptPhoto: TINY_PNG }), user: { id: actor.id } };
		const res = mockRes();
		await controller.createPayment(req, res);
		const id = res.body.id;

		// Replace with a second photo.
		const photoB = TINY_PNG_B;
		const putReq: any = { params: { id }, body: { receiptPhoto: photoB }, user: { id: actor.id } };
		const putRes = mockRes();
		await controller.updatePayment(putReq, putRes);
		expect(putRes.statusCode).toBe(200);
		expect(putRes.body.receiptUrl).toBe(photoB);

		// Absent receiptPhoto must not touch the stored receipt.
		const put2Req: any = { params: { id }, body: { amount: 250 }, user: { id: actor.id } };
		const put2Res = mockRes();
		await controller.updatePayment(put2Req, put2Res);
		expect((await rowFor(id))?.receiptUrl).toBe(photoB);

		// '' clears the receipt.
		const put3Req: any = { params: { id }, body: { receiptPhoto: '' }, user: { id: actor.id } };
		const put3Res = mockRes();
		await controller.updatePayment(put3Req, put3Res);
		expect(put3Res.statusCode).toBe(200);
		expect(put3Res.body.receiptUrl).toBeNull();
		expect(await rowFor(id)).toMatchObject({ receiptUrl: null, receiptS3Key: null });
	});

	it('updatePayment answers 400 for an invalid photo and keeps the old one', async () => {
		const req: any = { body: paymentBody({ receiptPhoto: TINY_PNG }), user: { id: actor.id } };
		const res = mockRes();
		await controller.createPayment(req, res);
		const id = res.body.id;

		const putReq: any = {
			params: { id },
			body: { receiptPhoto: 'data:image/gif;base64,nope' },
			user: { id: actor.id },
		};
		const putRes = mockRes();
		await controller.updatePayment(putReq, putRes);

		expect(putRes.statusCode).toBe(400);
		expect((await rowFor(id))?.receiptUrl).toBe(TINY_PNG);
	});

	it('getPaymentSummaryByRetreat returns presigned receipts without receiptS3Key', async () => {
		const req: any = { body: paymentBody({ receiptPhoto: TINY_PNG }), user: { id: actor.id } };
		const res = mockRes();
		await controller.createPayment(req, res);

		const summaryReq: any = { params: { retreatId: retreat.id }, user: { id: actor.id } };
		const summaryRes = mockRes();
		await controller.getPaymentSummaryByRetreat(summaryReq, summaryRes);

		expect(summaryRes.statusCode).toBe(200);
		const nested = summaryRes.body.participantPayments[0].payments[0];
		expect(nested.receiptUrl).toBe(TINY_PNG);
		expect(nested.receiptS3Key).toBeUndefined();
	});

	describe('S3 storage mode', () => {
		beforeEach(() => {
			jest.spyOn(avatarStorageService, 'isS3Storage').mockReturnValue(true);
			jest
				.spyOn(s3Service, 'presignPrivateUrl')
				.mockImplementation(async (url: any) => url);
		});

		it('createPayment uploads BEFORE inserting the payment (spec D4)', async () => {
			const uploadSpy = jest
				.spyOn(s3Service, 'uploadPaymentReceipt')
				.mockResolvedValue({
					url: 'https://s3.example/payment-receipts/p1.webp',
					key: 'payment-receipts/p1.webp',
				});
			const repo = AppDataSource.getRepository(Payment);
			const insertSpy = jest
				.spyOn(repo, 'insert')
				// Delegate to manager so the real insert runs without recursing the spy.
				.mockImplementation((async (entity: any) => {
					await AppDataSource.manager.insert(Payment, entity);
					return { identifiers: [entity.id], generatedMaps: [], raw: [] };
				}) as any);

			const req: any = { body: paymentBody({ receiptPhoto: TINY_PNG }), user: { id: actor.id } };
			const res = mockRes();
			await controller.createPayment(req, res);

			expect(res.statusCode).toBe(201);
			expect(uploadSpy).toHaveBeenCalledTimes(1);
			expect(uploadSpy.mock.calls[0][0]).toBe(res.body.id);
			expect(res.body.receiptUrl).toBe('https://s3.example/payment-receipts/p1.webp');
			expect(res.body.receiptS3Key).toBeUndefined();
			expect(uploadSpy.mock.invocationCallOrder[0]).toBeLessThan(
				insertSpy.mock.invocationCallOrder[0],
			);
		});

		it('deletePayment removes the S3 object when the payment had a receipt', async () => {
			jest.spyOn(s3Service, 'uploadPaymentReceipt').mockResolvedValue({
				url: 'https://s3.example/payment-receipts/p1.webp',
				key: 'payment-receipts/p1.webp',
			});
			const deleteSpy = jest
				.spyOn(s3Service, 'deletePaymentReceipt')
				.mockResolvedValue(undefined);

			const req: any = { body: paymentBody({ receiptPhoto: TINY_PNG }), user: { id: actor.id } };
			const res = mockRes();
			await controller.createPayment(req, res);

			const delReq: any = { params: { id: res.body.id }, user: { id: actor.id } };
			const delRes = mockRes();
			await controller.deletePayment(delReq, delRes);

			expect(delRes.statusCode).toBe(200);
			expect(deleteSpy).toHaveBeenCalledWith(res.body.id);
		});

		it('updatePayment with receiptPhoto "" deletes the S3 object', async () => {
			jest.spyOn(s3Service, 'uploadPaymentReceipt').mockResolvedValue({
				url: 'https://s3.example/payment-receipts/p1.webp',
				key: 'payment-receipts/p1.webp',
			});
			const deleteSpy = jest
				.spyOn(s3Service, 'deletePaymentReceipt')
				.mockResolvedValue(undefined);

			const req: any = { body: paymentBody({ receiptPhoto: TINY_PNG }), user: { id: actor.id } };
			const res = mockRes();
			await controller.createPayment(req, res);

			const putReq: any = {
				params: { id: res.body.id },
				body: { receiptPhoto: '' },
				user: { id: actor.id },
			};
			const putRes = mockRes();
			await controller.updatePayment(putReq, putRes);

			expect(putRes.statusCode).toBe(200);
			expect(deleteSpy).toHaveBeenCalledWith(res.body.id);
		});
	});
});
