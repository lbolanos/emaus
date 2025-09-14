import { Request, Response } from 'express';
import { GlobalMessageTemplateService } from '../services/globalMessageTemplateService';
import { AppDataSource } from '../data-source';
import { authorizationService } from '../middleware/authorization';

const hasPermission = (user: any, resource: string, operation: string): boolean => {
	// For now, we'll implement a simple permission check
	// This should be replaced with proper permission checking logic
	if (!user) return false;

	// Check if user has superadmin role
	if (user.roles && user.roles.includes('superadmin')) {
		return true;
	}

	// For read operations, allow all authenticated users
	if (operation === 'read' || operation === 'list') {
		return true;
	}

	return false;
};

export class GlobalMessageTemplateController {
	private globalMessageTemplateService: GlobalMessageTemplateService;

	constructor() {
		this.globalMessageTemplateService = new GlobalMessageTemplateService();
	}

	async getAll(req: Request, res: Response) {
		try {
			// Check if user has read permission for global message templates
			if (!hasPermission(req.user as any, 'globalMessageTemplate', 'read')) {
				return res.status(403).json({
					error: 'You do not have permission to read global message templates',
				});
			}

			const templates = await this.globalMessageTemplateService.getAll();
			return res.json(templates);
		} catch (error) {
			console.error('Error in getAll:', error);
			return res.status(500).json({
				error: 'Internal server error',
			});
		}
	}

	async getById(req: Request, res: Response) {
		try {
			// Check if user has read permission for global message templates
			if (!hasPermission(req.user as any, 'globalMessageTemplate', 'read')) {
				return res.status(403).json({
					error: 'You do not have permission to read global message templates',
				});
			}

			const { id } = req.params;
			const template = await this.globalMessageTemplateService.getById(id);

			if (!template) {
				return res.status(404).json({
					error: 'Global message template not found',
				});
			}

			return res.json(template);
		} catch (error) {
			console.error('Error in getById:', error);
			return res.status(500).json({
				error: 'Internal server error',
			});
		}
	}

	async create(req: Request, res: Response) {
		try {
			// Check if user has create permission for global message templates
			if (!hasPermission(req.user as any, 'globalMessageTemplate', 'create')) {
				return res.status(403).json({
					error: 'You do not have permission to create global message templates',
				});
			}

			const { name, type, message } = req.body;

			if (!name || !type || !message) {
				return res.status(400).json({
					error: 'Name, type, and message are required',
				});
			}

			// Check if template name already exists
			const existingTemplate = await AppDataSource.getRepository('GlobalMessageTemplate').findOne({
				where: { name },
			});
			if (existingTemplate) {
				return res.status(400).json({
					error: 'Template with this name already exists',
				});
			}

			const template = await this.globalMessageTemplateService.create({
				name,
				type,
				message,
				isActive: true,
			});

			return res.status(201).json({
				message: 'Global message template created successfully',
				template,
			});
		} catch (error) {
			console.error('Error in create:', error);
			return res.status(500).json({
				error: 'Internal server error',
			});
		}
	}

	async update(req: Request, res: Response) {
		try {
			// Check if user has update permission for global message templates
			if (!hasPermission(req.user as any, 'globalMessageTemplate', 'update')) {
				return res.status(403).json({
					error: 'You do not have permission to update global message templates',
				});
			}

			const { id } = req.params;
			const { name, type, message, isActive } = req.body;

			const template = await this.globalMessageTemplateService.update(id, {
				name,
				type,
				message,
				isActive,
			});

			if (!template) {
				return res.status(404).json({
					error: 'Global message template not found',
				});
			}

			return res.json({
				message: 'Global message template updated successfully',
				template,
			});
		} catch (error) {
			console.error('Error in update:', error);
			return res.status(500).json({
				error: 'Internal server error',
			});
		}
	}

	async delete(req: Request, res: Response) {
		try {
			// Check if user has delete permission for global message templates
			if (!hasPermission(req.user as any, 'globalMessageTemplate', 'delete')) {
				return res.status(403).json({
					error: 'You do not have permission to delete global message templates',
				});
			}

			const { id } = req.params;
			const deleted = await this.globalMessageTemplateService.delete(id);

			if (!deleted) {
				return res.status(404).json({
					error: 'Global message template not found',
				});
			}

			return res.json({
				message: 'Global message template deleted successfully',
			});
		} catch (error) {
			console.error('Error in delete:', error);
			return res.status(500).json({
				error: 'Internal server error',
			});
		}
	}

	async toggleActive(req: Request, res: Response) {
		try {
			// Check if user has update permission for global message templates
			if (!hasPermission(req.user as any, 'globalMessageTemplate', 'update')) {
				return res.status(403).json({
					error: 'You do not have permission to update global message templates',
				});
			}

			const { id } = req.params;
			const template = await this.globalMessageTemplateService.toggleActive(id);

			if (!template) {
				return res.status(404).json({
					error: 'Global message template not found',
				});
			}

			return res.json({
				message: `Global message template ${template.isActive ? 'activated' : 'deactivated'} successfully`,
				template,
			});
		} catch (error) {
			console.error('Error in toggleActive:', error);
			return res.status(500).json({
				error: 'Internal server error',
			});
		}
	}

	async copyToRetreat(req: Request, res: Response) {
		try {
			// Check if user has read permission for global message templates
			if (!hasPermission(req.user as any, 'globalMessageTemplate', 'read')) {
				return res.status(403).json({
					error: 'You do not have permission to read global message templates',
				});
			}

			const { id: globalTemplateId } = req.params;
			const { retreatId } = req.body;

			if (!retreatId) {
				return res.status(400).json({
					error: 'Retreat ID is required',
				});
			}

			const template = await this.globalMessageTemplateService.copyToRetreat(
				globalTemplateId,
				retreatId,
			);

			if (!template) {
				return res.status(404).json({
					error: 'Global message template not found',
				});
			}

			return res.json({
				message: 'Global message template copied to retreat successfully',
				template,
			});
		} catch (error) {
			console.error('Error in copyToRetreat:', error);
			return res.status(500).json({
				error: 'Internal server error',
			});
		}
	}
}
