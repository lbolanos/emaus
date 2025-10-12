import { Request, Response } from 'express';
import { MessageTemplateService } from '../services/messageTemplateService';
import { authorizationService } from '../middleware/authorization';

const messageTemplateService = new MessageTemplateService();

// Helper function to check retreat access
const checkRetreatAccess = async (req: Request, retreatId: string): Promise<boolean> => {
	if (!req.user) {
		return false;
	}
	const userId = (req.user as any)?.id;
	if (!userId) {
		return false;
	}
	return await authorizationService.hasRetreatAccess(userId, retreatId);
};

export const getMessageTemplates = async (req: Request, res: Response) => {
	const { retreatId } = req.query;

	if (!retreatId) {
		return res.status(400).json({ message: 'retreatId is required' });
	}

	// Check retreat access
	const hasAccess = await checkRetreatAccess(req, retreatId as string);
	if (!hasAccess) {
		return res.status(403).json({ message: 'Forbidden - No access to this retreat' });
	}

	const templates = await messageTemplateService.findAll(retreatId as string);
	res.json(templates);
};

export const getMessageTemplateById = async (req: Request, res: Response) => {
	const template = await messageTemplateService.findById(req.params.id);
	if (!template) {
		return res.status(404).json({ message: 'Template not found' });
	}

	// Check retreat access
	const hasAccess = await checkRetreatAccess(req, template.retreatId);
	if (!hasAccess) {
		return res.status(403).json({ message: 'Forbidden - No access to this retreat' });
	}

	res.json(template);
};

export const createMessageTemplate = async (req: Request, res: Response) => {
	const { retreatId } = req.body;

	// Check retreat access
	const hasAccess = await checkRetreatAccess(req, retreatId);
	if (!hasAccess) {
		return res.status(403).json({ message: 'Forbidden - No access to this retreat' });
	}

	const newTemplate = await messageTemplateService.create(req.body);
	res.status(201).json(newTemplate);
};

export const updateMessageTemplate = async (req: Request, res: Response) => {
	const updatedTemplate = await messageTemplateService.update(req.params.id, req.body);
	if (!updatedTemplate) {
		return res.status(404).json({ message: 'Template not found' });
	}

	// Check retreat access
	const hasAccess = await checkRetreatAccess(req, updatedTemplate.retreatId);
	if (!hasAccess) {
		return res.status(403).json({ message: 'Forbidden - No access to this retreat' });
	}

	res.json(updatedTemplate);
};

export const deleteMessageTemplate = async (req: Request, res: Response) => {
	// Get the template first to check retreat access
	const template = await messageTemplateService.findById(req.params.id);
	if (!template) {
		return res.status(404).json({ message: 'Template not found' });
	}

	// Check retreat access
	const hasAccess = await checkRetreatAccess(req, template.retreatId);
	if (!hasAccess) {
		return res.status(403).json({ message: 'Forbidden - No access to this retreat' });
	}

	const success = await messageTemplateService.remove(req.params.id);
	if (!success) {
		return res.status(404).json({ message: 'Template not found' });
	}
	res.status(204).send();
};
