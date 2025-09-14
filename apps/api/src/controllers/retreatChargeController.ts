import { Request, Response } from 'express';
import { AppDataSource } from '../index';
import { Charge, ChargeType } from '../entities/charge.entity';
import { Retreat } from '../entities/retreat.entity';
import { Participant } from '../entities/participant.entity';

interface WhereClause {
	retreatId?: string;
	participantId?: string;
	chargeType?: string;
	isActive?: boolean;
	isLeadership?: boolean;
}

interface ChargeTypeData {
	chargeType: string;
	total: number;
	assigned: number;
	charges: Charge[];
}

export class RetreatChargeController {
	// Create a new charge/role
	async createCharge(req: Request, res: Response) {
		try {
			const { name, description, chargeType, isLeadership, priority, retreatId } = req.body;
			const userId = (req.user as any).id;

			if (!userId) {
				return res.status(401).json({ message: 'No autorizado' });
			}

			const chargeRepository = AppDataSource.getRepository(Charge);
			const retreatRepository = AppDataSource.getRepository(Retreat);

			// Validate retreat exists
			const retreat = await retreatRepository.findOne({ where: { id: retreatId } });
			if (!retreat) {
				return res.status(404).json({ message: 'Retiro no encontrado' });
			}

			// Create charge
			const charge = chargeRepository.create({
				name,
				description,
				chargeType: chargeType || ChargeType.OTRO,
				isLeadership: isLeadership || false,
				priority: priority || 0,
				isActive: true,
				retreatId,
			});

			await chargeRepository.save(charge);

			// Load relations for response
			const savedCharge = await chargeRepository.findOne({
				where: { id: charge.id },
				relations: ['retreat', 'participant'],
			});

			res.status(201).json(savedCharge);
		} catch (error) {
			console.error('Error creating charge:', error);
			res.status(500).json({ message: 'Error al crear responsabilidad' });
		}
	}

	// Get all charges with filtering
	async getAllCharges(req: Request, res: Response) {
		try {
			const { retreatId, participantId, chargeType, isActive, isLeadership } = req.query;

			const chargeRepository = AppDataSource.getRepository(Charge);

			let where: WhereClause = {};

			if (retreatId) {
				where.retreatId = retreatId as string;
			}

			if (participantId) {
				where.participantId = participantId as string;
			}

			if (chargeType) {
				where.chargeType = chargeType as string;
			}

			if (isActive !== undefined) {
				where.isActive = isActive === 'true';
			}

			if (isLeadership !== undefined) {
				where.isLeadership = isLeadership === 'true';
			}

			const charges = await chargeRepository.find({
				where,
				relations: ['retreat', 'participant'],
				order: { priority: 'ASC', name: 'ASC' },
			});

			res.json(charges);
		} catch (error) {
			console.error('Error getting charges:', error);
			res.status(500).json({ message: 'Error al obtener responsabilidades' });
		}
	}

	// Get charge by ID
	async getChargeById(req: Request, res: Response) {
		try {
			const { id } = req.params;

			const chargeRepository = AppDataSource.getRepository(Charge);

			const charge = await chargeRepository.findOne({
				where: { id },
				relations: ['retreat', 'participant'],
			});

			if (!charge) {
				return res.status(404).json({ message: 'Responsabilidad no encontrada' });
			}

			res.json(charge);
		} catch (error) {
			console.error('Error getting charge:', error);
			res.status(500).json({ message: 'Error al obtener responsabilidad' });
		}
	}

	// Update charge
	async updateCharge(req: Request, res: Response) {
		try {
			const { id } = req.params;
			const { name, description, chargeType, isLeadership, priority, isActive, participantId } =
				req.body;

			const chargeRepository = AppDataSource.getRepository(Charge);

			const charge = await chargeRepository.findOne({
				where: { id },
				relations: ['retreat', 'participant'],
			});

			if (!charge) {
				return res.status(404).json({ message: 'Responsibilidad no encontrada' });
			}

			// Update fields
			if (name !== undefined) charge.name = name;
			if (description !== undefined) charge.description = description;
			if (chargeType !== undefined) charge.chargeType = chargeType;
			if (isLeadership !== undefined) charge.isLeadership = isLeadership;
			if (priority !== undefined) charge.priority = priority;
			if (isActive !== undefined) charge.isActive = isActive;
			if (participantId !== undefined) charge.participantId = participantId;

			await chargeRepository.save(charge);

			res.json(charge);
		} catch (error) {
			console.error('Error updating charge:', error);
			res.status(500).json({ message: 'Error al actualizar responsabilidad' });
		}
	}

	// Delete charge (soft delete by setting isActive to false)
	async deleteCharge(req: Request, res: Response) {
		try {
			const { id } = req.params;

			const chargeRepository = AppDataSource.getRepository(Charge);

			const charge = await chargeRepository.findOne({ where: { id } });

			if (!charge) {
				return res.status(404).json({ message: 'Responsibilidad no encontrada' });
			}

			// Soft delete
			charge.isActive = false;
			charge.participantId = undefined; // Unassign from participant

			await chargeRepository.save(charge);

			res.json({ message: 'Responsibilidad eliminada correctamente' });
		} catch (error) {
			console.error('Error deleting charge:', error);
			res.status(500).json({ message: 'Error al eliminar responsabilidad' });
		}
	}

	// Assign charge to participant
	async assignChargeToParticipant(req: Request, res: Response) {
		try {
			const { id } = req.params;
			const { participantId } = req.body;

			const chargeRepository = AppDataSource.getRepository(Charge);
			const participantRepository = AppDataSource.getRepository(Participant);

			const charge = await chargeRepository.findOne({ where: { id } });
			const participant = await participantRepository.findOne({ where: { id: participantId } });

			if (!charge) {
				return res.status(404).json({ message: 'Responsibilidad no encontrada' });
			}

			if (!participant) {
				return res.status(404).json({ message: 'Participante no encontrado' });
			}

			// Check if participant is in the same retreat
			if (participant.retreatId !== charge.retreatId) {
				return res.status(400).json({ message: 'El participante no pertenece a este retiro' });
			}

			charge.participantId = participantId;
			await chargeRepository.save(charge);

			const updatedCharge = await chargeRepository.findOne({
				where: { id: charge.id },
				relations: ['retreat', 'participant'],
			});

			res.json(updatedCharge);
		} catch (error) {
			console.error('Error assigning charge to participant:', error);
			res.status(500).json({ message: 'Error al asignar responsabilidad a participante' });
		}
	}

	// Remove charge from participant
	async removeChargeFromParticipant(req: Request, res: Response) {
		try {
			const { id } = req.params;

			const chargeRepository = AppDataSource.getRepository(Charge);

			const charge = await chargeRepository.findOne({ where: { id } });

			if (!charge) {
				return res.status(404).json({ message: 'Responsibilidad no encontrada' });
			}

			charge.participantId = undefined;
			await chargeRepository.save(charge);

			res.json({ message: 'Responsibilidad removida del participante correctamente' });
		} catch (error) {
			console.error('Error removing charge from participant:', error);
			res.status(500).json({ message: 'Error al remover responsabilidad del participante' });
		}
	}

	// Get available charges for a retreat (unassigned)
	async getAvailableCharges(req: Request, res: Response) {
		try {
			const { retreatId } = req.params;

			const chargeRepository = AppDataSource.getRepository(Charge);

			const charges = await chargeRepository.find({
				where: {
					retreatId,
					participantId: undefined,
					isActive: true,
				},
				order: { priority: 'ASC', name: 'ASC' },
			});

			res.json(charges);
		} catch (error) {
			console.error('Error getting available charges:', error);
			res.status(500).json({ message: 'Error al obtener responsabilidades disponibles' });
		}
	}

	// Get charges summary by retreat
	async getChargesSummaryByRetreat(req: Request, res: Response) {
		try {
			const { retreatId } = req.params;

			const chargeRepository = AppDataSource.getRepository(Charge);
			const participantRepository = AppDataSource.getRepository(Participant);

			// Get all charges for the retreat
			const charges = await chargeRepository.find({
				where: { retreatId, isActive: true },
				relations: ['participant'],
			});

			// Calculate summary statistics
			const totalCharges = charges.length;
			const assignedCharges = charges.filter((charge) => charge.participantId).length;
			const leadershipCharges = charges.filter((charge) => charge.isLeadership).length;
			const assignedLeadershipCharges = charges.filter(
				(charge) => charge.isLeadership && charge.participantId,
			).length;

			// Group by charge type
			const chargesByType = new Map<string, ChargeTypeData>();
			charges.forEach((charge: Charge) => {
				if (!chargesByType.has(charge.chargeType)) {
					chargesByType.set(charge.chargeType, {
						chargeType: charge.chargeType,
						total: 0,
						assigned: 0,
						charges: [],
					});
				}
				const typeData = chargesByType.get(charge.chargeType)!;
				typeData.total++;
				if (charge.participantId) {
					typeData.assigned++;
				}
				typeData.charges.push(charge);
			});

			// Get all participants in retreat
			const participants = await participantRepository.find({
				where: { retreatId },
			});

			const summary = {
				retreatId,
				totalCharges,
				assignedCharges,
				unassignedCharges: totalCharges - assignedCharges,
				leadershipCharges,
				assignedLeadershipCharges,
				unassignedLeadershipCharges: leadershipCharges - assignedLeadershipCharges,
				totalParticipants: participants.length,
				participantsWithCharges: new Set(
					charges.filter((charge) => charge.participantId).map((charge) => charge.participantId),
				).size,
				chargesByType: Array.from(chargesByType.values()),
			};

			res.json(summary);
		} catch (error) {
			console.error('Error getting charges summary:', error);
			res.status(500).json({ message: 'Error al obtener resumen de responsabilidades' });
		}
	}
}
