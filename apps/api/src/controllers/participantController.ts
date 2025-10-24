import { Request, Response, NextFunction } from 'express';
import * as participantService from '../services/participantService';

export const getAllParticipants = async (req: Request, res: Response, next: NextFunction) => {
	try {
		const { retreatId, type, isCancelled: isCancelled, includePayments } = req.query;
		const participants = await participantService.findAllParticipants(
			retreatId as string | undefined,
			type as 'walker' | 'server' | 'waiting' | undefined,
			isCancelled === 'true',
			['tableMesa', 'retreatBed'], // Include table and bed relations
			includePayments === 'true', // Include payment details when requested
		);
		res.json(participants);
	} catch (error) {
		next(error);
	}
};

export const getParticipantById = async (req: Request, res: Response, next: NextFunction) => {
	try {
		const { includePayments } = req.query;
		const participant = await participantService.findParticipantById(
			req.params.id,
			includePayments === 'true'
		);
		if (participant) {
			res.json(participant);
		} else {
			res.status(404).json({ message: 'Participant not found' });
		}
	} catch (error) {
		next(error);
	}
};

export const createParticipant = async (req: Request, res: Response, next: NextFunction) => {
	try {
		const newParticipant = await participantService.createParticipant(req.body);
		res.status(201).json(newParticipant);
	} catch (error) {
		if (error instanceof Error) {
			if (error.message.includes('already exists')) {
				return res.status(409).json({ message: error.message });
			}
		}
		next(error);
	}
};

export const updateParticipant = async (req: Request, res: Response, next: NextFunction) => {
	try {
		const updatedParticipant = await participantService.updateParticipant(req.params.id, req.body);
		if (updatedParticipant) {
			res.json(updatedParticipant);
		} else {
			res.status(404).json({ message: 'Participant not found' });
		}
	} catch (error) {
		next(error);
	}
};

export const deleteParticipant = async (req: Request, res: Response, next: NextFunction) => {
	try {
		await participantService.deleteParticipant(req.params.id);
		res.status(204).send();
	} catch (error) {
		next(error);
	}
};

export const importParticipants = async (req: Request, res: Response, next: NextFunction) => {
	try {
		const { retreatId } = req.params;
		const { participants } = req.body;
		const user = req.user as any;

		const result = await participantService.importParticipants(retreatId, participants, user);

		res.status(200).json(result);
	} catch (error) {
		next(error);
	}
};
