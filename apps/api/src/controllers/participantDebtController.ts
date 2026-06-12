import { Request, Response } from 'express';
import { AppDataSource } from '../data-source';
import { ParticipantDebt } from '../entities/participantDebt.entity';
import { Participant } from '../entities/participant.entity';
import { RetreatParticipant } from '../entities/retreatParticipant.entity';
import { domainAuditService } from '../services/domainAuditService';
import { ensureRetreatAccess } from '../middleware/authorization';

/**
 * CRUD de deudas manuales (espejo de PaymentController). Las deudas solo aplican a
 * servidores y angelitos (type = 'server' | 'partial_server'); el tipo vive en
 * retreat_participants, así que se valida contra el retiro efectivo de la deuda.
 *
 * El retreatId viene del body o se deriva del participante/registro, así que el
 * middleware de ruta no alcanza: cada mutación valida acceso al retiro aquí
 * (`ensureRetreatAccess`) para evitar escrituras cross-retiro con solo `payment:*`.
 */
export class ParticipantDebtController {
	private async resolveTypeForRetreat(
		participantId: string,
		retreatId: string,
	): Promise<string | null> {
		const rp = await AppDataSource.getRepository(RetreatParticipant).findOne({
			where: { participantId, retreatId },
			select: ['id', 'type'],
		});
		return rp?.type ?? null;
	}

	// Create a new debt
	async createDebt(req: Request, res: Response) {
		try {
			const { participantId, amount, description, retreatId: bodyRetreatId } = req.body;
			const userId = (req.user as any)?.id;

			if (!userId) {
				return res.status(401).json({ message: 'No autorizado' });
			}

			// El concepto es obligatorio.
			if (typeof description !== 'string' || description.trim() === '') {
				return res.status(400).json({ message: 'El concepto es obligatorio' });
			}

			const participantRepository = AppDataSource.getRepository(Participant);
			const participant = await participantRepository.findOne({
				where: { id: participantId },
			});
			if (!participant) {
				return res.status(404).json({ message: 'Participante no encontrado' });
			}

			const effectiveRetreatId =
				(typeof bodyRetreatId === 'string' && bodyRetreatId) || participant.retreatId;
			if (!effectiveRetreatId) {
				return res.status(400).json({
					message: 'No se pudo determinar el retiro al que pertenece la deuda',
				});
			}

			if (!(await ensureRetreatAccess(req, res, effectiveRetreatId))) return;

			// Las deudas solo aplican a servidores y angelitos.
			const type = await this.resolveTypeForRetreat(participantId, effectiveRetreatId);
			if (type !== 'server' && type !== 'partial_server') {
				return res.status(400).json({
					message: 'Solo se pueden agregar deudas a servidores o angelitos',
				});
			}

			const debtRepository = AppDataSource.getRepository(ParticipantDebt);
			const debt = debtRepository.create({
				participantId,
				retreatId: effectiveRetreatId,
				amount,
				description: description.trim(),
				recordedBy: userId,
			});
			await debtRepository.save(debt);

			const savedDebt = await debtRepository.findOne({
				where: { id: debt.id },
				relations: ['participant', 'retreat', 'recordedByUser'],
			});

			void domainAuditService.logCreate('participant_debt', debt.id, debt, {
				retreatId: effectiveRetreatId,
				fields: ['participantId', 'amount', 'description'],
			});

			res.status(201).json(savedDebt);
		} catch (error) {
			console.error('Error creating debt:', error);
			res.status(500).json({ message: 'Error al crear deuda' });
		}
	}

	// Get debts by participant
	async getDebtsByParticipant(req: Request, res: Response) {
		try {
			const { participantId } = req.params;
			const debtRepository = AppDataSource.getRepository(ParticipantDebt);
			const debts = await debtRepository.find({
				where: { participantId },
				relations: ['recordedByUser'],
				order: { createdAt: 'DESC' },
			});
			res.json(debts);
		} catch (error) {
			console.error('Error getting participant debts:', error);
			res.status(500).json({ message: 'Error al obtener deudas del participante' });
		}
	}

	// Get debts by retreat
	async getDebtsByRetreat(req: Request, res: Response) {
		try {
			const { retreatId } = req.params;
			const debtRepository = AppDataSource.getRepository(ParticipantDebt);
			const debts = await debtRepository.find({
				where: { retreatId },
				relations: ['participant', 'recordedByUser'],
				order: { createdAt: 'DESC' },
			});
			res.json(debts);
		} catch (error) {
			console.error('Error getting retreat debts:', error);
			res.status(500).json({ message: 'Error al obtener deudas del retiro' });
		}
	}

	// Update debt
	async updateDebt(req: Request, res: Response) {
		try {
			const { id } = req.params;
			const { amount, description } = req.body;

			const debtRepository = AppDataSource.getRepository(ParticipantDebt);
			const debt = await debtRepository.findOne({
				where: { id },
				relations: ['participant', 'retreat', 'recordedByUser'],
			});
			if (!debt) {
				return res.status(404).json({ message: 'Deuda no encontrada' });
			}

			if (!(await ensureRetreatAccess(req, res, debt.retreatId))) return;

			// El concepto no puede quedar vacío si se envía en la actualización.
			if (description !== undefined && (typeof description !== 'string' || description.trim() === '')) {
				return res.status(400).json({ message: 'El concepto es obligatorio' });
			}

			const oldSnapshot = { ...debt };
			if (amount !== undefined) debt.amount = amount;
			if (description !== undefined) debt.description = description.trim();
			await debtRepository.save(debt);

			void domainAuditService.logUpdate('participant_debt', debt.id, oldSnapshot, debt, {
				retreatId: debt.retreatId,
				fields: ['amount', 'description'],
			});

			res.json(debt);
		} catch (error) {
			console.error('Error updating debt:', error);
			res.status(500).json({ message: 'Error al actualizar deuda' });
		}
	}

	// Delete debt
	async deleteDebt(req: Request, res: Response) {
		try {
			const { id } = req.params;
			const debtRepository = AppDataSource.getRepository(ParticipantDebt);
			const debt = await debtRepository.findOne({ where: { id } });
			if (!debt) {
				return res.status(404).json({ message: 'Deuda no encontrada' });
			}

			if (!(await ensureRetreatAccess(req, res, debt.retreatId))) return;

			const deletedSnapshot = { ...debt };
			await debtRepository.remove(debt);

			void domainAuditService.logDelete('participant_debt', id, deletedSnapshot, {
				retreatId: deletedSnapshot.retreatId,
				fields: ['participantId', 'amount', 'description'],
			});

			res.json({ message: 'Deuda eliminada correctamente' });
		} catch (error) {
			console.error('Error deleting debt:', error);
			res.status(500).json({ message: 'Error al eliminar deuda' });
		}
	}
}
