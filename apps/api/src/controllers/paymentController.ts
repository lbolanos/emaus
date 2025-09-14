import { Request, Response } from 'express';
import { AppDataSource } from '../index';
import { Payment } from '../entities/payment.entity';
import { Participant } from '../entities/participant.entity';
import { Retreat } from '../entities/retreat.entity';
import { User } from '../entities/user.entity';
import { Between, LessThanOrEqual, MoreThanOrEqual } from 'typeorm';

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
}

export class PaymentController {
	// Create a new payment
	async createPayment(req: Request, res: Response) {
		try {
			const { participantId, amount, paymentDate, paymentMethod, referenceNumber, notes } =
				req.body;
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

			// Create payment
			const payment = paymentRepository.create({
				participantId,
				retreatId: participant.retreatId,
				amount,
				paymentDate: new Date(paymentDate),
				paymentMethod,
				referenceNumber,
				notes,
				recordedBy: userId,
			});

			await paymentRepository.save(payment);

			// Load relations for response
			const savedPayment = await paymentRepository.findOne({
				where: { id: payment.id },
				relations: ['participant', 'retreat', 'recordedByUser'],
			});

			res.status(201).json(savedPayment);
		} catch (error) {
			console.error('Error creating payment:', error);
			res.status(500).json({ message: 'Error al crear pago' });
		}
	}

	// Get all payments
	async getAllPayments(req: Request, res: Response) {
		try {
			const { retreatId, participantId, startDate, endDate, paymentMethod } = req.query;

			const paymentRepository = AppDataSource.getRepository(Payment);

			let where: WhereClause = {};

			if (retreatId) {
				where.retreatId = retreatId as string;
			}

			if (participantId) {
				where.participantId = participantId as string;
			}

			if (paymentMethod) {
				where.paymentMethod = paymentMethod as 'cash' | 'transfer' | 'check' | 'card' | 'other';
			}

			if (startDate && endDate) {
				where.paymentDate = Between(new Date(startDate as string), new Date(endDate as string));
			} else if (startDate) {
				where.paymentDate = MoreThanOrEqual(new Date(startDate as string));
			} else if (endDate) {
				where.paymentDate = LessThanOrEqual(new Date(endDate as string));
			}

			const payments = await paymentRepository.find({
				where,
				relations: ['participant', 'retreat', 'recordedByUser'],
				order: { paymentDate: 'DESC', createdAt: 'DESC' },
			});

			res.json(payments);
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

			res.json(payment);
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

			const paymentRepository = AppDataSource.getRepository(Payment);

			const payment = await paymentRepository.findOne({
				where: { id },
				relations: ['participant', 'retreat', 'recordedByUser'],
			});

			if (!payment) {
				return res.status(404).json({ message: 'Pago no encontrado' });
			}

			// Update fields
			if (amount !== undefined) payment.amount = amount;
			if (paymentDate !== undefined) payment.paymentDate = new Date(paymentDate);
			if (paymentMethod !== undefined) payment.paymentMethod = paymentMethod;
			if (referenceNumber !== undefined) payment.referenceNumber = referenceNumber;
			if (notes !== undefined) payment.notes = notes;

			await paymentRepository.save(payment);

			res.json(payment);
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

			await paymentRepository.remove(payment);

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

			const paymentRepository = AppDataSource.getRepository(Payment);

			const payments = await paymentRepository.find({
				where: { participantId },
				relations: ['retreat', 'recordedByUser'],
				order: { paymentDate: 'DESC', createdAt: 'DESC' },
			});

			res.json(payments);
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

			res.json(payments);
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

			// Get all payments for the retreat
			const payments = await paymentRepository.find({
				where: { retreatId },
				relations: ['participant'],
			});

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

			// Get all participants in retreat for comparison
			const participants = await participantRepository.find({
				where: { retreatId },
			});

			const summary = {
				retreatId,
				totalPaid,
				totalPayments,
				participantsWithPayments: participantPayments.size,
				totalParticipants: participants.length,
				participantPayments: Array.from(participantPayments.values()),
			};

			res.json(summary);
		} catch (error) {
			console.error('Error getting payment summary:', error);
			res.status(500).json({ message: 'Error al obtener resumen de pagos' });
		}
	}
}
