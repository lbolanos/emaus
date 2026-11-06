import { Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { AppDataSource } from '../data-source';
import { Payment } from '../entities/payment.entity';
import { Participant } from '../entities/participant.entity';
import { Retreat } from '../entities/retreat.entity';
import { User } from '../entities/user.entity';
import { Between, LessThanOrEqual, MoreThanOrEqual } from 'typeorm';
import { domainAuditService } from '../services/domainAuditService';
import { findAllParticipants } from '../services/participantService';
import { imageService, FlyerAssetError } from '../services/imageService';
import { s3Service } from '../services/s3Service';
import { avatarStorageService } from '../services/avatarStorageService';
import {
	ensureRetreatAccess,
	filterByRetreatAccess,
	authorizationService,
} from '../middleware/authorization';

interface WhereClause {
	retreatId?: string;
	participantId?: string;
	paymentMethod?: 'cash' | 'transfer' | 'check' | 'card' | 'other';
	paymentDate?: any;
}

interface ParticipantPaymentData {
	participant: Participant;
	payments: Payment[];
	totalPaid: number;
	lastPaymentDate: string | null;
}

/**
 * Prepares payments for the client: presigns `receiptUrl` and strips the
 * internal `receiptS3Key` (same concealment as community member photos).
 *
 * `presignPrivateUrl` is idempotent — data-URIs from the base64 storage mode
 * pass through unchanged, and the signed URLs are cached per process — so
 * running it on every read path is cheap. Audit snapshots and idempotency
 * replays never contain the raw data-URL because the audit `fields` whitelist
 * excludes the receipt columns and the idempotency middleware stores only the
 * response (which carries the signed URL, not the payload).
 */
export async function presignPaymentReceipts(payments: Payment[]): Promise<Payment[]> {
	return Promise.all(
		payments.map(async (payment) => ({
			...payment,
			receiptUrl: await s3Service.presignPrivateUrl(payment.receiptUrl),
			receiptS3Key: undefined,
		})),
	);
}

/**
 * Raw-body read of the optional `receiptPhoto` (paymentRoutes validates the
 * body but does not assign the parsed result, so the controller sees the raw
 * value). `undefined` = untouched, `''` = clear the receipt (PUT), otherwise a
 * data-URL to process.
 */
function readReceiptPhoto(body: Record<string, unknown>): string | undefined {
	const value = body.receiptPhoto;
	return typeof value === 'string' ? value : undefined;
}

/**
 * Validates and processes a receipt data-URL into a WebP photo (1600px fit,
 * never cropped — receipts must stay legible). Throws nothing: returns the
 * processed image, or null after answering 400 when the payload is not a
 * usable image.
 */
async function processReceiptPhoto(
	res: Response,
	receiptPhoto: string,
): Promise<{ buffer: Buffer; contentType: string } | null> {
	try {
		const { buffer, contentType } = imageService.base64ToBuffer(receiptPhoto);
		return await imageService.processPhoto(buffer, contentType);
	} catch (error) {
		if (error instanceof FlyerAssetError) {
			res.status(400).json({ message: `Comprobante inválido: ${error.message}` });
			return null;
		}
		throw error;
	}
}

export class PaymentController {
	// Create a new payment
	async createPayment(req: Request, res: Response) {
		try {
			const {
				participantId,
				amount,
				paymentDate,
				paymentMethod,
				referenceNumber,
				notes,
				retreatId: bodyRetreatId,
			} = req.body;
			const receiptPhoto = readReceiptPhoto(req.body);
			const userId = (req.user as any).id;

			if (!userId) {
				return res.status(401).json({ message: 'No autorizado' });
			}

			// Get repositories
			const paymentRepository = AppDataSource.getRepository(Payment);
			const participantRepository = AppDataSource.getRepository(Participant);

			// Validate participant exists
			const participant = await participantRepository.findOne({
				where: { id: participantId },
				relations: ['retreat'],
			});

			if (!participant) {
				return res.status(404).json({ message: 'Participante no encontrado' });
			}

			// retreatId from request body wins over participant.retreatId (the
			// "primary" retreat) so payments register against the active retreat
			// in the sidebar, not against whichever retreat happens to be marked
			// as primary on the participant.
			const effectiveRetreatId =
				(typeof bodyRetreatId === 'string' && bodyRetreatId) || participant.retreatId;
			if (!effectiveRetreatId) {
				return res.status(400).json({
					message: 'No se pudo determinar el retiro al que pertenece el pago',
				});
			}

			// El retreatId viene del body/participante, no de la ruta: validar acceso
			// aquí para evitar registrar pagos en retiros ajenos con solo payment:create.
			if (!(await ensureRetreatAccess(req, res, effectiveRetreatId))) return;

			// Receipt photo (optional, specs/payment-receipt-photo/spec.md). Process
			// and upload BEFORE inserting the payment: the idempotency middleware
			// only releases its key on a 5xx, so saving first and failing the upload
			// afterwards would make the device's retry with the same key create a
			// DUPLICATE payment (spec D4). An orphan S3 object from a crash between
			// the two steps is harmless garbage; a duplicated payment is not.
			const paymentId = randomUUID();
			let receiptUrl: string | null = null;
			let receiptS3Key: string | null = null;
			if (receiptPhoto) {
				const processed = await processReceiptPhoto(res, receiptPhoto);
				if (!processed) return;
				if (avatarStorageService.isS3Storage()) {
					const uploaded = await s3Service.uploadPaymentReceipt(
						paymentId,
						processed.buffer,
						processed.contentType,
					);
					receiptUrl = uploaded.url;
					receiptS3Key = uploaded.key;
				} else {
					// Local/base64 storage mode: persist the PROCESSED WebP (the same
					// bytes S3 mode stores), not the raw client payload — smaller rows
					// and identical bytes across both storage modes.
					receiptUrl = `data:image/webp;base64,${processed.buffer.toString('base64')}`;
				}
			}

			// Create payment (id is pre-generated above for the receipt object key;
			// insert() skips save()'s existence SELECT)
			const payment = paymentRepository.create({
				id: paymentId,
				participantId,
				retreatId: effectiveRetreatId,
				amount,
				paymentDate: new Date(paymentDate),
				paymentMethod,
				referenceNumber,
				notes,
				receiptUrl,
				receiptS3Key,
				recordedBy: userId,
			});

			await paymentRepository.insert(payment);

			// Load relations for response
			const savedPayment = await paymentRepository.findOne({
				where: { id: payment.id },
				relations: ['participant', 'retreat', 'recordedByUser'],
			});

			if (!savedPayment) {
				return res.status(500).json({ message: 'Error al crear pago' });
			}

			void domainAuditService.logCreate('payment', payment.id, payment, {
				retreatId: effectiveRetreatId,
				fields: ['participantId', 'amount', 'paymentDate', 'paymentMethod', 'referenceNumber'],
			});

			res.status(201).json((await presignPaymentReceipts([savedPayment]))[0]);
		} catch (error) {
			console.error('Error creating payment:', error);
			res.status(500).json({ message: 'Error al crear pago' });
		}
	}

	// Get all payments
	async getAllPayments(req: Request, res: Response) {
		try {
			const { retreatId, participantId, startDate, endDate, paymentMethod } = req.query;

			const userId = (req.user as any)?.id;
			if (!userId) {
				return res.status(401).json({ message: 'No autorizado' });
			}

			// Scope obligatorio por retiro: sin un retreatId validado, un usuario con
			// `payment:list` (scoped a sus retiros) volcaría los pagos de todo el sistema.
			// Superadmin sí puede listar sin filtro.
			const isSuperadmin = await authorizationService.hasRole(userId, 'superadmin');
			if (!isSuperadmin) {
				if (!retreatId || typeof retreatId !== 'string') {
					return res.status(400).json({ message: 'Se requiere especificar el retiro (retreatId)' });
				}
				if (!(await ensureRetreatAccess(req, res, retreatId))) return;
			}

			const paymentRepository = AppDataSource.getRepository(Payment);

			let where: any = {};

			if (retreatId && typeof retreatId === 'string') {
				where.retreatId = retreatId;
			}

			if (participantId && typeof participantId === 'string') {
				where.participantId = participantId;
			}

			if (paymentMethod && typeof paymentMethod === 'string') {
				// Validate payment method is one of the allowed values
				const validMethods = ['cash', 'transfer', 'check', 'card', 'other'];
				if (validMethods.includes(paymentMethod)) {
					where.paymentMethod = paymentMethod as 'cash' | 'transfer' | 'check' | 'card' | 'other';
				}
			}

			if (startDate && endDate && typeof startDate === 'string' && typeof endDate === 'string') {
				where.paymentDate = Between(new Date(startDate), new Date(endDate));
			} else if (startDate && typeof startDate === 'string') {
				where.paymentDate = MoreThanOrEqual(new Date(startDate));
			} else if (endDate && typeof endDate === 'string') {
				where.paymentDate = LessThanOrEqual(new Date(endDate));
			}

			const payments = await paymentRepository.find({
				where,
				relations: ['participant', 'retreat', 'recordedByUser'],
				order: { paymentDate: 'DESC', createdAt: 'DESC' },
			});

			res.json(await presignPaymentReceipts(payments));
		} catch (error) {
			console.error('Error getting payments:', error);
			res.status(500).json({ message: 'Error al obtener pagos' });
		}
	}

	// Get payment by ID
	async getPaymentById(req: Request, res: Response) {
		try {
			const { id } = req.params;

			const paymentRepository = AppDataSource.getRepository(Payment);

			const payment = await paymentRepository.findOne({
				where: { id },
				relations: ['participant', 'retreat', 'recordedByUser'],
			});

			if (!payment) {
				return res.status(404).json({ message: 'Pago no encontrado' });
			}

			if (!(await ensureRetreatAccess(req, res, payment.retreatId))) return;

			res.json((await presignPaymentReceipts([payment]))[0]);
		} catch (error) {
			console.error('Error getting payment:', error);
			res.status(500).json({ message: 'Error al obtener pago' });
		}
	}

	// Update payment
	async updatePayment(req: Request, res: Response) {
		try {
			const { id } = req.params;
			const { amount, paymentDate, paymentMethod, referenceNumber, notes } = req.body;
			const receiptPhoto = readReceiptPhoto(req.body);

			const paymentRepository = AppDataSource.getRepository(Payment);

			const payment = await paymentRepository.findOne({
				where: { id },
				relations: ['participant', 'retreat', 'recordedByUser'],
			});

			if (!payment) {
				return res.status(404).json({ message: 'Pago no encontrado' });
			}

			if (!(await ensureRetreatAccess(req, res, payment.retreatId))) return;

			const oldSnapshot = { ...payment };
			const hadS3Receipt = !!payment.receiptS3Key;

			// Update fields
			if (amount !== undefined) payment.amount = amount;
			if (paymentDate !== undefined) payment.paymentDate = new Date(paymentDate);
			if (paymentMethod !== undefined) payment.paymentMethod = paymentMethod;
			if (referenceNumber !== undefined) payment.referenceNumber = referenceNumber;
			if (notes !== undefined) payment.notes = notes;

			// Receipt photo: undefined = untouched, '' = clear, otherwise replace
			// (specs/payment-receipt-photo/spec.md R2). Replacement uploads to the
			// SAME fixed key, so it overwrites without leaving orphans. Upload runs
			// BEFORE save so a failed upload (500) leaves the stored photo intact.
			// Residual window, accepted in the spec's Reconcile: if the upload
			// succeeds but the save then fails, the S3 object holds the NEW image
			// while the row keeps the old one — the viewer would show the new
			// receipt for an edit that reported failure.
			if (receiptPhoto === '') {
				payment.receiptUrl = null;
				payment.receiptS3Key = null;
			} else if (receiptPhoto !== undefined) {
				const processed = await processReceiptPhoto(res, receiptPhoto);
				if (!processed) return;
				if (avatarStorageService.isS3Storage()) {
					const uploaded = await s3Service.uploadPaymentReceipt(
						payment.id,
						processed.buffer,
						processed.contentType,
					);
					payment.receiptUrl = uploaded.url;
					payment.receiptS3Key = uploaded.key;
				} else {
					payment.receiptUrl = `data:image/webp;base64,${processed.buffer.toString('base64')}`;
					payment.receiptS3Key = null;
				}
			}

			await paymentRepository.save(payment);

			// Cleanup AFTER saving: a failed delete leaves an orphan object, never a
			// row pointing at a missing object. Fire-and-forget: cleanup must not
			// fail the request.
			if (receiptPhoto === '' && hadS3Receipt && avatarStorageService.isS3Storage()) {
				void s3Service.deletePaymentReceipt(payment.id).catch((error) =>
					console.error('[payment] could not delete receipt object', error),
				);
			}

			void domainAuditService.logUpdate('payment', payment.id, oldSnapshot, payment, {
				retreatId: payment.retreatId,
				fields: ['amount', 'paymentDate', 'paymentMethod', 'referenceNumber', 'notes'],
			});

			res.json((await presignPaymentReceipts([payment]))[0]);
		} catch (error) {
			console.error('Error updating payment:', error);
			res.status(500).json({ message: 'Error al actualizar pago' });
		}
	}

	// Delete payment
	async deletePayment(req: Request, res: Response) {
		try {
			const { id } = req.params;

			const paymentRepository = AppDataSource.getRepository(Payment);

			const payment = await paymentRepository.findOne({ where: { id } });

			if (!payment) {
				return res.status(404).json({ message: 'Pago no encontrado' });
			}

			if (!(await ensureRetreatAccess(req, res, payment.retreatId))) return;

			const deletedSnapshot = { ...payment };

			await paymentRepository.remove(payment);

			// Remove the receipt object too (fire-and-forget; spec D6). Same
			// criterion as community member photos: the row is gone, the object
			// must not linger.
			if (deletedSnapshot.receiptS3Key && avatarStorageService.isS3Storage()) {
				void s3Service.deletePaymentReceipt(id).catch((error) =>
					console.error('[payment] could not delete receipt object', error),
				);
			}

			void domainAuditService.logDelete('payment', id, deletedSnapshot, {
				retreatId: deletedSnapshot.retreatId,
				fields: ['participantId', 'amount', 'paymentDate', 'paymentMethod', 'referenceNumber'],
			});

			res.json({ message: 'Pago eliminado correctamente' });
		} catch (error) {
			console.error('Error deleting payment:', error);
			res.status(500).json({ message: 'Error al eliminar pago' });
		}
	}

	// Get payments by participant
	async getPaymentsByParticipant(req: Request, res: Response) {
		try {
			const { participantId } = req.params;

			const userId = (req.user as any)?.id;
			if (!userId) {
				return res.status(401).json({ message: 'No autorizado' });
			}

			const paymentRepository = AppDataSource.getRepository(Payment);

			const payments = await paymentRepository.find({
				where: { participantId },
				relations: ['retreat', 'recordedByUser'],
				order: { paymentDate: 'DESC', createdAt: 'DESC' },
			});

			// Un participante puede aparecer en varios retiros: devolver solo los pagos
			// de retiros a los que el usuario tiene acceso (evita IDOR cross-retiro).
			const accessible = await filterByRetreatAccess(userId, payments);

			res.json(await presignPaymentReceipts(accessible));
		} catch (error) {
			console.error('Error getting participant payments:', error);
			res.status(500).json({ message: 'Error al obtener pagos del participante' });
		}
	}

	// Get payments by retreat
	async getPaymentsByRetreat(req: Request, res: Response) {
		try {
			const { retreatId } = req.params;

			const paymentRepository = AppDataSource.getRepository(Payment);

			const payments = await paymentRepository.find({
				where: { retreatId },
				relations: ['participant', 'recordedByUser'],
				order: { paymentDate: 'DESC', createdAt: 'DESC' },
			});

			res.json(await presignPaymentReceipts(payments));
		} catch (error) {
			console.error('Error getting retreat payments:', error);
			res.status(500).json({ message: 'Error al obtener pagos del retiro' });
		}
	}

	// Get payment summary by retreat
	async getPaymentSummaryByRetreat(req: Request, res: Response) {
		try {
			const { retreatId } = req.params;

			const paymentRepository = AppDataSource.getRepository(Payment);
			const participantRepository = AppDataSource.getRepository(Participant);

			// Get all payments for the retreat. Presign receipts BEFORE building the
			// per-participant grouping so the nested payments share the signed URLs.
			const payments = await presignPaymentReceipts(
				await paymentRepository.find({
					where: { retreatId },
					relations: ['participant'],
				}),
			);

			// Calculate summary statistics
			const totalPaid = payments.reduce(
				(sum: number, payment: Payment) => sum + Number(payment.amount),
				0,
			);
			const totalPayments = payments.length;

			// Group by participant
			const participantPayments = new Map<string, ParticipantPaymentData>();
			payments.forEach((payment: Payment) => {
				if (!participantPayments.has(payment.participantId)) {
					participantPayments.set(payment.participantId, {
						participant: payment.participant,
						payments: [],
						totalPaid: 0,
					});
				}
				const participantData = participantPayments.get(payment.participantId)!;
				participantData.payments.push(payment);
				participantData.totalPaid += Number(payment.amount);
			});

			// Get all participants in retreat (overlaid + with payments/debts) so the
			// computed getters (expected/balance/paz y salvo) reflect the new model.
			const participants = await findAllParticipants(
				retreatId,
				undefined,
				undefined,
				[],
				true,
			);

			let totalExpected = 0;
			let totalRemaining = 0;
			let pazYSalvoCount = 0;
			for (const p of participants) {
				if (p.isCancelled) continue;
				const breakdown = p.chargeBreakdown;
				totalExpected += breakdown.expected;
				totalRemaining += breakdown.balance;
				if (breakdown.balance <= 0) pazYSalvoCount += 1;
			}

			const summary = {
				retreatId,
				totalPaid,
				totalPayments,
				participantsWithPayments: participantPayments.size,
				totalParticipants: participants.length,
				totalExpected,
				totalRemaining,
				pazYSalvoCount,
				participantPayments: Array.from(participantPayments.values()),
			};

			res.json(summary);
		} catch (error) {
			console.error('Error getting payment summary:', error);
			res.status(500).json({ message: 'Error al obtener resumen de pagos' });
		}
	}
}
