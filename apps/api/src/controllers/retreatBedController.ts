import { AppDataSource } from '../data-source';
import { RetreatBed } from '../entities/retreatBed.entity';
import { Participant } from '../entities/participant.entity';
import type { Request, Response, NextFunction } from 'express';

export const getRetreatBeds = async (req: Request, res: Response, next: NextFunction) => {
	try {
		const { retreatId } = req.params;
		const retreatBedRepository = AppDataSource.getRepository(RetreatBed);
		const beds = await retreatBedRepository.find({
			where: { retreatId: retreatId },
			relations: ['participant'],
			order: { floor: 'ASC', roomNumber: 'ASC', bedNumber: 'ASC' },
		});
		res.json(beds);
	} catch (error) {
		next(error);
	}
};

export const assignParticipantToBed = async (req: Request, res: Response, next: NextFunction) => {
	try {
		const { bedId } = req.params;
		const { participantId } = req.body; // participantId can be null to unassign

		// Use TypeORM transaction for atomic operations
		await AppDataSource.transaction(async (transactionalEntityManager) => {
			const bedRepo = transactionalEntityManager.getRepository(RetreatBed);
			const participantRepo = transactionalEntityManager.getRepository(Participant);

			// If unassigning
			if (participantId === null) {
				const bed = await bedRepo.findOne({ where: { id: bedId } });
				if (!bed) {
					throw new Error('Bed not found');
				}

				await bedRepo.update(bedId, { participantId: null });
				console.log(`✅ Unassigned participant from bed ${bedId}`);
				return;
			}

			// Validate inputs
			if (!participantId || typeof participantId !== 'string') {
				throw new Error('Invalid participantId provided');
			}

			// Check if participant exists and is not cancelled
			const participant = await participantRepo.findOne({ where: { id: participantId } });
			if (!participant) {
				throw new Error('Participant not found');
			}
			if (participant.isCancelled) {
				throw new Error('Cannot assign cancelled participant to bed');
			}

			// Check if bed exists
			const bed = await bedRepo.findOne({ where: { id: bedId } });
			if (!bed) {
				throw new Error('Bed not found');
			}

			// Check if bed is already assigned to someone else
			if (bed.participantId && bed.participantId !== participantId) {
				throw new Error('Bed is already assigned to another participant');
			}

			// Check if participant already has a bed (optional business rule)
			const existingBed = await bedRepo.findOne({ where: { participantId } });
			if (existingBed && existingBed.id !== bedId) {
				throw new Error('Participant already has another bed assigned');
			}

			// Perform the assignment
			await bedRepo.update(bedId, { participantId });
			console.log(`✅ Assigned participant ${participantId} to bed ${bedId}`);
		});

		// Return the updated bed
		const retreatBedRepository = AppDataSource.getRepository(RetreatBed);
		const updatedBed = await retreatBedRepository.findOne({
			where: { id: bedId },
			relations: ['participant'],
		});

		res.json(updatedBed);
	} catch (error: any) {
		console.error('❌ Error in assignParticipantToBed:', error.message);

		// Convert errors to appropriate HTTP responses
		let statusCode = 400;
		let message = error.message || 'Unknown error occurred';

		if (message.includes('not found')) {
			statusCode = 404;
		} else if (message.includes('already assigned')) {
			statusCode = 409; // Conflict
		} else if (message.includes('cancelled')) {
			statusCode = 422; // Unprocessable Entity
		}

		res.status(statusCode).json({ message });
	}
};
