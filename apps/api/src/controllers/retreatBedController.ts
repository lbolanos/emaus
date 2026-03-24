import { AppDataSource } from '../data-source';
import { RetreatBed } from '../entities/retreatBed.entity';
import { Participant } from '../entities/participant.entity';
import { RetreatParticipant } from '../entities/retreatParticipant.entity';
import { autoAssignBedsForRetreat } from '../services/participantService';
import { authorizationService } from '../middleware/authorization';
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
		const userId = (req as any).user?.id;

		// Use TypeORM transaction for atomic operations (auth check inside to prevent TOCTOU)
		await AppDataSource.transaction(async (transactionalEntityManager) => {
			const bedRepo = transactionalEntityManager.getRepository(RetreatBed);
			const participantRepo = transactionalEntityManager.getRepository(Participant);

			// Verify retreat access inside transaction to prevent TOCTOU race
			const bedCheck = await bedRepo.findOne({ where: { id: bedId } });
			if (!bedCheck) {
				throw new Error('Bed not found');
			}
			const hasAccess = await authorizationService.hasRetreatAccess(userId, bedCheck.retreatId);
			if (!hasAccess) {
				throw new Error('No access to this retreat');
			}

			// If unassigning
			if (participantId === null) {
				await bedRepo.update(bedId, { participantId: null });
				return;
			}

			// Validate inputs
			if (!participantId || typeof participantId !== 'string') {
				throw new Error('Invalid participantId provided');
			}

			// Check if participant exists
			const participant = await participantRepo.findOne({ where: { id: participantId } });
			if (!participant) {
				throw new Error('Participant not found');
			}

			// Check if bed is active
			if (bedCheck.isActive === false) {
				throw new Error('Cannot assign participant to a disabled bed');
			}

			// Check if participant is cancelled (isCancelled lives in retreat_participants)
			const rpRepo = transactionalEntityManager.getRepository(RetreatParticipant);
			const rp = await rpRepo.findOne({ where: { participantId, retreatId: bedCheck.retreatId } });
			if (rp?.isCancelled) {
				throw new Error('Cannot assign cancelled participant to bed');
			}

			// Check if participant already has a bed in the same retreat and unassign if necessary
			const existingBed = await bedRepo.findOne({
				where: { participantId, retreatId: bedCheck.retreatId },
			});
			if (existingBed && existingBed.id !== bedId) {
				await bedRepo.update(existingBed.id, { participantId: null });
			}

			// Check if bed is already assigned to someone else
			if (bedCheck.participantId && bedCheck.participantId !== participantId) {
				throw new Error('Bed is already assigned to another participant');
			}

			// Perform the assignment
			await bedRepo.update(bedId, { participantId });
		});

		// Return the updated bed
		const retreatBedRepository = AppDataSource.getRepository(RetreatBed);
		const updatedBed = await retreatBedRepository.findOne({
			where: { id: bedId },
			relations: ['participant'],
		});

		res.json(updatedBed);
	} catch (error: any) {
		// Convert errors to appropriate HTTP responses
		let statusCode = 400;
		let message = error.message || 'Unknown error occurred';

		if (message.includes('No access')) {
			statusCode = 403;
		} else if (message.includes('not found')) {
			statusCode = 404;
		} else if (message.includes('already assigned')) {
			statusCode = 409; // Conflict
		} else if (message.includes('cancelled')) {
			statusCode = 422; // Unprocessable Entity
		}

		res.status(statusCode).json({ message });
	}
};

export const autoAssignBeds = async (req: Request, res: Response, next: NextFunction) => {
	try {
		const { retreatId } = req.params;
		const result = await autoAssignBedsForRetreat(retreatId);
		res.json(result);
	} catch (error) {
		next(error);
	}
};

export const toggleBedActive = async (req: Request, res: Response, next: NextFunction) => {
	try {
		const { bedId } = req.params;
		const { isActive } = req.body;
		const userId = (req as any).user?.id;

		if (typeof isActive !== 'boolean') {
			res.status(400).json({ message: 'isActive must be a boolean' });
			return;
		}

		const retreatBedRepository = AppDataSource.getRepository(RetreatBed);
		const bed = await retreatBedRepository.findOne({ where: { id: bedId } });

		if (!bed) {
			res.status(404).json({ message: 'Bed not found' });
			return;
		}

		// Verify retreat access
		const hasAccess = await authorizationService.hasRetreatAccess(userId, bed.retreatId);
		if (!hasAccess) {
			res.status(403).json({ message: 'No access to this retreat' });
			return;
		}

		// If disabling and bed has a participant, unassign them
		if (!isActive && bed.participantId) {
			await retreatBedRepository.update(bedId, { isActive, participantId: null });
		} else {
			await retreatBedRepository.update(bedId, { isActive });
		}

		const updatedBed = await retreatBedRepository.findOne({
			where: { id: bedId },
			relations: ['participant'],
		});

		res.json(updatedBed);
	} catch (error) {
		next(error);
	}
};

export const clearBedAssignments = async (req: Request, res: Response, next: NextFunction) => {
	try {
		const { retreatId } = req.params;
		const retreatBedRepository = AppDataSource.getRepository(RetreatBed);
		await retreatBedRepository
			.createQueryBuilder()
			.update(RetreatBed)
			.set({ participantId: null })
			.where('retreatId = :retreatId', { retreatId })
			.execute();
		res.json({ message: 'Bed assignments cleared' });
	} catch (error) {
		next(error);
	}
};
