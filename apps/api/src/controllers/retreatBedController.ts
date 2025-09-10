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

		const retreatBedRepository = AppDataSource.getRepository(RetreatBed);
		const participantRepository = AppDataSource.getRepository(Participant);

		const bed = await retreatBedRepository.findOneBy({ id: bedId });
		if (!bed) {
			return res.status(404).json({ message: 'Bed not found' });
		}

		// If unassigning
		if (participantId === null) {
			bed.participant = null;
			bed.participantId = null;
			await retreatBedRepository.save(bed);
			return res.json(bed);
		}

		// If assigning
		const participant = await participantRepository.findOneBy({ id: participantId });
		if (!participant) {
			return res.status(404).json({ message: 'Participant not found' });
		}

		// Check if participant is already assigned to another bed
		const existingBed = await retreatBedRepository.findOne({ where: { participantId } });
		if (existingBed && existingBed.id !== bedId) {
			// Unassign from old bed
			existingBed.participant = null;
			existingBed.participantId = null;
			await retreatBedRepository.save(existingBed);
		}

		bed.participant = participant;
		await retreatBedRepository.save(bed);
		res.json(bed);
	} catch (error) {
		next(error);
	}
};
