import { Request, Response, NextFunction } from 'express';
import * as tagService from '../services/tagService';

export const getAllTags = async (req: Request, res: Response, next: NextFunction) => {
	try {
		const retreatId = req.query.retreatId as string | undefined;
		const tags = await tagService.getAllTags(retreatId);
		res.json(tags);
	} catch (error: any) {
		next(error);
	}
};

export const getTag = async (req: Request, res: Response, next: NextFunction) => {
	try {
		const tag = await tagService.getAllTags().then((tags) => tags.find((t) => t.id === req.params.id));
		if (!tag) {
			return res.status(404).json({ message: 'Tag not found' });
		}
		res.json(tag);
	} catch (error: any) {
		next(error);
	}
};

export const createTag = async (req: Request, res: Response, next: NextFunction) => {
	try {
		const { retreatId, ...tagData } = req.body;
		if (!retreatId) {
			return res.status(400).json({ message: 'retreatId is required' });
		}
		const tag = await tagService.createTag(tagData, retreatId);
		res.status(201).json(tag);
	} catch (error: any) {
		next(error);
	}
};

export const updateTag = async (req: Request, res: Response, next: NextFunction) => {
	try {
		const { retreatId, ...tagData } = req.body;
		if (!retreatId) {
			return res.status(400).json({ message: 'retreatId is required' });
		}
		const updatedTag = await tagService.updateTag(req.params.id, tagData, retreatId);
		res.json(updatedTag);
	} catch (error: any) {
		next(error);
	}
};

export const deleteTag = async (req: Request, res: Response, next: NextFunction) => {
	try {
		const retreatId = req.query.retreatId as string;
		if (!retreatId) {
			return res.status(400).json({ message: 'retreatId is required' });
		}
		await tagService.deleteTag(req.params.id, retreatId);
		res.status(204).send();
	} catch (error: any) {
		next(error);
	}
};

export const getParticipantTags = async (req: Request, res: Response, next: NextFunction) => {
	try {
		const { participantId } = req.params;
		const tags = await tagService.getParticipantTags(participantId);
		res.json(tags);
	} catch (error: any) {
		next(error);
	}
};

export const assignTagToParticipant = async (req: Request, res: Response, next: NextFunction) => {
	try {
		const { participantId, tagId } = req.params;
		const result = await tagService.assignTagToParticipant(participantId, tagId);
		res.status(201).json(result);
	} catch (error: any) {
		next(error);
	}
};

export const removeTagFromParticipant = async (req: Request, res: Response, next: NextFunction) => {
	try {
		const { participantId, tagId } = req.params;
		await tagService.removeTagFromParticipant(participantId, tagId);
		res.status(204).send();
	} catch (error: any) {
		next(error);
	}
};

export const checkTagConflict = async (req: Request, res: Response, next: NextFunction) => {
	try {
		const { leaderIds, walkerIds } = req.body;
		const result = await tagService.checkTableTagConflict(leaderIds, walkerIds);
		res.json(result);
	} catch (error: any) {
		next(error);
	}
};
