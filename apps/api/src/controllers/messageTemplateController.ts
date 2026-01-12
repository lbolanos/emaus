import { Request, Response } from 'express';
import { MessageTemplateService } from '../services/messageTemplateService';
import { authorizationService, requireCommunityAccess } from '../middleware/authorization';
import { CommunityAdmin } from '../entities/communityAdmin.entity';
import { AppDataSource } from '../data-source';

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

// Helper function to check community access
const checkCommunityAccess = async (req: Request, communityId: string): Promise<boolean> => {
	if (!req.user) {
		return false;
	}
	const userId = (req.user as any)?.id;
	if (!userId) {
		return false;
	}
	// Check if user is an active admin of this community
	const adminRecord = await AppDataSource.getRepository(CommunityAdmin).findOne({
		where: {
			communityId,
			userId,
			status: 'active',
		},
	});
	return !!adminRecord;
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

	// Check access based on scope
	let hasAccess = false;
	if (template.scope === 'retreat' && template.retreatId) {
		hasAccess = await checkRetreatAccess(req, template.retreatId);
	} else if (template.scope === 'community' && template.communityId) {
		hasAccess = await checkCommunityAccess(req, template.communityId);
	}

	if (!hasAccess) {
		return res.status(403).json({ message: 'Forbidden - No access to this template' });
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

	// Check access based on scope
	let hasAccess = false;
	if (updatedTemplate.scope === 'retreat' && updatedTemplate.retreatId) {
		hasAccess = await checkRetreatAccess(req, updatedTemplate.retreatId);
	} else if (updatedTemplate.scope === 'community' && updatedTemplate.communityId) {
		hasAccess = await checkCommunityAccess(req, updatedTemplate.communityId);
	}

	if (!hasAccess) {
		return res.status(403).json({ message: 'Forbidden - No access to this template' });
	}

	res.json(updatedTemplate);
};

export const deleteMessageTemplate = async (req: Request, res: Response) => {
	// Get the template first to check access
	const template = await messageTemplateService.findById(req.params.id);
	if (!template) {
		return res.status(404).json({ message: 'Template not found' });
	}

	// Check access based on scope
	let hasAccess = false;
	if (template.scope === 'retreat' && template.retreatId) {
		hasAccess = await checkRetreatAccess(req, template.retreatId);
	} else if (template.scope === 'community' && template.communityId) {
		hasAccess = await checkCommunityAccess(req, template.communityId);
	}

	if (!hasAccess) {
		return res.status(403).json({ message: 'Forbidden - No access to this template' });
	}

	const success = await messageTemplateService.remove(req.params.id);
	if (!success) {
		return res.status(404).json({ message: 'Template not found' });
	}
	res.status(204).send();
};

// ============================================
// Community-specific endpoints
// ============================================

export const getCommunityMessageTemplates = async (req: Request, res: Response) => {
	const { communityId } = req.params;

	if (!communityId) {
		return res.status(400).json({ message: 'communityId is required' });
	}

	// Check community access
	const hasAccess = await checkCommunityAccess(req, communityId);
	if (!hasAccess) {
		return res.status(403).json({ message: 'Forbidden - No access to this community' });
	}

	const templates = await messageTemplateService.findByCommunity(communityId);
	res.json(templates);
};

export const createCommunityMessageTemplate = async (req: Request, res: Response) => {
	const { communityId } = req.params;

	if (!communityId) {
		return res.status(400).json({ message: 'communityId is required' });
	}

	// Check community access
	const hasAccess = await checkCommunityAccess(req, communityId);
	if (!hasAccess) {
		return res.status(403).json({ message: 'Forbidden - No access to this community' });
	}

	// Extract template data from body
	const { name, type, message } = req.body;

	if (!name || !type || !message) {
		return res.status(400).json({ message: 'name, type, and message are required' });
	}

	const newTemplate = await messageTemplateService.createForCommunity(communityId, {
		name,
		type,
		message,
	});
	res.status(201).json(newTemplate);
};

export const updateCommunityMessageTemplate = async (req: Request, res: Response) => {
	const { communityId, id } = req.params;

	if (!communityId) {
		return res.status(400).json({ message: 'communityId is required' });
	}

	// Check community access
	const hasAccess = await checkCommunityAccess(req, communityId);
	if (!hasAccess) {
		return res.status(403).json({ message: 'Forbidden - No access to this community' });
	}

	// Verify template belongs to this community
	const template = await messageTemplateService.findById(id);
	if (!template) {
		return res.status(404).json({ message: 'Template not found' });
	}

	if (template.scope !== 'community' || template.communityId !== communityId) {
		return res.status(400).json({ message: 'Template does not belong to this community' });
	}

	const updatedTemplate = await messageTemplateService.update(id, req.body);
	res.json(updatedTemplate);
};

export const deleteCommunityMessageTemplate = async (req: Request, res: Response) => {
	const { communityId, id } = req.params;

	if (!communityId) {
		return res.status(400).json({ message: 'communityId is required' });
	}

	// Check community access
	const hasAccess = await checkCommunityAccess(req, communityId);
	if (!hasAccess) {
		return res.status(403).json({ message: 'Forbidden - No access to this community' });
	}

	// Verify template belongs to this community
	const template = await messageTemplateService.findById(id);
	if (!template) {
		return res.status(404).json({ message: 'Template not found' });
	}

	if (template.scope !== 'community' || template.communityId !== communityId) {
		return res.status(400).json({ message: 'Template does not belong to this community' });
	}

	const success = await messageTemplateService.remove(id);
	if (!success) {
		return res.status(404).json({ message: 'Template not found' });
	}
	res.status(204).send();
};
