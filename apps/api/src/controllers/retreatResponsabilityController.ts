import { Request, Response } from 'express';
import { AppDataSource } from '../data-source';
import { Responsability, ResponsabilityType } from '../entities/responsability.entity';
import { Retreat } from '../entities/retreat.entity';
import { Participant } from '../entities/participant.entity';

interface WhereClause {
	retreatId?: string;
	participantId?: string;
	responsabilityType?: string;
	isActive?: boolean;
	isLeadership?: boolean;
}

interface ResponsabilityTypeData {
	responsabilityType: string;
	total: number;
	assigned: number;
	responsibilities: Responsability[];
}

export class RetreatResponsabilityController {
	// Create a new responsability/role
	async createResponsability(req: Request, res: Response) {
		try {
			const { name, description, responsabilityType, isLeadership, priority, retreatId } = req.body;
			const userId = (req.user as any).id;

			if (!userId) {
				return res.status(401).json({ message: 'No autorizado' });
			}

			const responsabilityRepository = AppDataSource.getRepository(Responsability);
			const retreatRepository = AppDataSource.getRepository(Retreat);

			// Validate retreat exists
			const retreat = await retreatRepository.findOne({ where: { id: retreatId } });
			if (!retreat) {
				return res.status(404).json({ message: 'Retiro no encontrado' });
			}

			// Create responsability
			const responsability = responsabilityRepository.create({
				name,
				description,
				responsabilityType: responsabilityType || ResponsabilityType.OTRO,
				isLeadership: isLeadership || false,
				priority: priority || 0,
				isActive: true,
				retreatId,
			});

			await responsabilityRepository.save(responsability);

			// Load relations for response
			const savedResponsability = await responsabilityRepository.findOne({
				where: { id: responsability.id },
				relations: ['retreat', 'participant'],
			});

			res.status(201).json(savedResponsability);
		} catch (error) {
			console.error('Error creating responsability:', error);
			res.status(500).json({ message: 'Error al crear responsabilidad' });
		}
	}

	// Get all responsibilities with filtering
	async getAllResponsibilities(req: Request, res: Response) {
		try {
			const { retreatId, participantId, responsabilityType, isActive, isLeadership } = req.query;

			const responsabilityRepository = AppDataSource.getRepository(Responsability);

			let where: WhereClause = {};

			if (retreatId) {
				where.retreatId = retreatId as string;
			}

			if (participantId) {
				where.participantId = participantId as string;
			}

			if (responsabilityType) {
				where.responsabilityType = responsabilityType as string;
			}

			if (isActive !== undefined) {
				where.isActive = isActive === 'true';
			}

			if (isLeadership !== undefined) {
				where.isLeadership = isLeadership === 'true';
			}

			const responsibilities = await responsabilityRepository.find({
				where,
				relations: ['retreat', 'participant'],
				order: { priority: 'ASC', name: 'ASC' },
			});

			res.json(responsibilities);
		} catch (error) {
			console.error('Error getting responsibilities:', error);
			res.status(500).json({ message: 'Error al obtener responsabilidades' });
		}
	}

	// Get responsability by ID
	async getResponsabilityById(req: Request, res: Response) {
		try {
			const { id } = req.params;

			const responsabilityRepository = AppDataSource.getRepository(Responsability);

			const responsability = await responsabilityRepository.findOne({
				where: { id },
				relations: ['retreat', 'participant'],
			});

			if (!responsability) {
				return res.status(404).json({ message: 'Responsabilidad no encontrada' });
			}

			res.json(responsability);
		} catch (error) {
			console.error('Error getting responsability:', error);
			res.status(500).json({ message: 'Error al obtener responsabilidad' });
		}
	}

	// Update responsability
	async updateResponsability(req: Request, res: Response) {
		try {
			const { id } = req.params;
			const {
				name,
				description,
				responsabilityType,
				isLeadership,
				priority,
				isActive,
				participantId,
			} = req.body;

			const responsabilityRepository = AppDataSource.getRepository(Responsability);

			const responsability = await responsabilityRepository.findOne({
				where: { id },
				relations: ['retreat', 'participant'],
			});

			if (!responsability) {
				return res.status(404).json({ message: 'Responsibilidad no encontrada' });
			}

			// Update fields
			if (name !== undefined) responsability.name = name;
			if (description !== undefined) responsability.description = description;
			if (responsabilityType !== undefined) responsability.responsabilityType = responsabilityType;
			if (isLeadership !== undefined) responsability.isLeadership = isLeadership;
			if (priority !== undefined) responsability.priority = priority;
			if (isActive !== undefined) responsability.isActive = isActive;
			if (participantId !== undefined) responsability.participantId = participantId;

			await responsabilityRepository.save(responsability);

			res.json(responsability);
		} catch (error) {
			console.error('Error updating responsability:', error);
			res.status(500).json({ message: 'Error al actualizar responsabilidad' });
		}
	}

	// Delete responsability (soft delete by setting isActive to false)
	async deleteResponsability(req: Request, res: Response) {
		try {
			const { id } = req.params;

			const responsabilityRepository = AppDataSource.getRepository(Responsability);

			const responsability = await responsabilityRepository.findOne({ where: { id } });

			if (!responsability) {
				return res.status(404).json({ message: 'Responsibilidad no encontrada' });
			}

			// Soft delete
			responsability.isActive = false;
			responsability.participantId = undefined; // Unassign from participant

			await responsabilityRepository.save(responsability);

			res.json({ message: 'Responsibilidad eliminada correctamente' });
		} catch (error) {
			console.error('Error deleting responsability:', error);
			res.status(500).json({ message: 'Error al eliminar responsabilidad' });
		}
	}

	// Assign responsability to participant
	async assignResponsabilityToParticipant(req: Request, res: Response) {
		try {
			const { id } = req.params;
			const { participantId } = req.body;

			const responsabilityRepository = AppDataSource.getRepository(Responsability);
			const participantRepository = AppDataSource.getRepository(Participant);

			const responsability = await responsabilityRepository.findOne({ where: { id } });
			const participant = await participantRepository.findOne({ where: { id: participantId } });

			if (!responsability) {
				return res.status(404).json({ message: 'Responsibilidad no encontrada' });
			}

			if (!participant) {
				return res.status(404).json({ message: 'Participante no encontrado' });
			}

			// Check if participant is in the same retreat
			if (participant.retreatId !== responsability.retreatId) {
				return res.status(400).json({ message: 'El participante no pertenece a este retiro' });
			}

			responsability.participantId = participantId;
			await responsabilityRepository.save(responsability);

			const updatedResponsability = await responsabilityRepository.findOne({
				where: { id: responsability.id },
				relations: ['retreat', 'participant'],
			});

			res.json(updatedResponsability);
		} catch (error) {
			console.error('Error assigning responsability to participant:', error);
			res.status(500).json({ message: 'Error al asignar responsabilidad a participante' });
		}
	}

	// Remove responsability from participant
	async removeResponsabilityFromParticipant(req: Request, res: Response) {
		try {
			const { id } = req.params;

			const responsabilityRepository = AppDataSource.getRepository(Responsability);

			const responsability = await responsabilityRepository.findOne({ where: { id } });

			if (!responsability) {
				return res.status(404).json({ message: 'Responsibilidad no encontrada' });
			}

			responsability.participantId = undefined;
			await responsabilityRepository.save(responsability);

			res.json({ message: 'Responsibilidad removida del participante correctamente' });
		} catch (error) {
			console.error('Error removing responsability from participant:', error);
			res.status(500).json({ message: 'Error al remover responsabilidad del participante' });
		}
	}

	// Get available responsibilities for a retreat (unassigned)
	async getAvailableResponsibilities(req: Request, res: Response) {
		try {
			const { retreatId } = req.params;

			const responsabilityRepository = AppDataSource.getRepository(Responsability);

			const responsibilities = await responsabilityRepository.find({
				where: {
					retreatId,
					participantId: undefined,
					isActive: true,
				},
				order: { priority: 'ASC', name: 'ASC' },
			});

			res.json(responsibilities);
		} catch (error) {
			console.error('Error getting available responsibilities:', error);
			res.status(500).json({ message: 'Error al obtener responsabilidades disponibles' });
		}
	}

	// Get responsibilities summary by retreat
	async getResponsibilitiesSummaryByRetreat(req: Request, res: Response) {
		try {
			const { retreatId } = req.params;

			const responsabilityRepository = AppDataSource.getRepository(Responsability);
			const participantRepository = AppDataSource.getRepository(Participant);

			// Get all responsibilities for the retreat
			const responsibilities = await responsabilityRepository.find({
				where: { retreatId, isActive: true },
				relations: ['participant'],
			});

			// Calculate summary statistics
			const totalResponsibilities = responsibilities.length;
			const assignedResponsibilities = responsibilities.filter(
				(responsability) => responsability.participantId,
			).length;
			const leadershipResponsibilities = responsibilities.filter(
				(responsability) => responsability.isLeadership,
			).length;
			const assignedLeadershipResponsibilities = responsibilities.filter(
				(responsability) => responsability.isLeadership && responsability.participantId,
			).length;

			// Group by responsability type
			const responsibilitiesByType = new Map<string, ResponsabilityTypeData>();
			responsibilities.forEach((responsability: Responsability) => {
				if (!responsibilitiesByType.has(responsability.responsabilityType)) {
					responsibilitiesByType.set(responsability.responsabilityType, {
						responsabilityType: responsability.responsabilityType,
						total: 0,
						assigned: 0,
						responsibilities: [],
					});
				}
				const typeData = responsibilitiesByType.get(responsability.responsabilityType)!;
				typeData.total++;
				if (responsability.participantId) {
					typeData.assigned++;
				}
				typeData.responsibilities.push(responsability);
			});

			// Get all participants in retreat
			const participants = await participantRepository.find({
				where: { retreatId },
			});

			const summary = {
				retreatId,
				totalResponsibilities,
				assignedResponsibilities,
				unassignedResponsibilities: totalResponsibilities - assignedResponsibilities,
				leadershipResponsibilities,
				assignedLeadershipResponsibilities,
				unassignedLeadershipResponsibilities:
					leadershipResponsibilities - assignedLeadershipResponsibilities,
				totalParticipants: participants.length,
				participantsWithResponsibilities: new Set(
					responsibilities
						.filter((responsability) => responsability.participantId)
						.map((responsability) => responsability.participantId),
				).size,
				responsibilitiesByType: Array.from(responsibilitiesByType.values()),
			};

			res.json(summary);
		} catch (error) {
			console.error('Error getting responsibilities summary:', error);
			res.status(500).json({ message: 'Error al obtener resumen de responsabilidades' });
		}
	}
}
