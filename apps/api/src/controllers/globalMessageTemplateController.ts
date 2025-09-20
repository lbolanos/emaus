import { Request, Response } from 'express';
import { GlobalMessageTemplateService } from '../services/globalMessageTemplateService';


export class GlobalMessageTemplateController {
	private globalMessageTemplateService: GlobalMessageTemplateService;

	constructor() {
		this.globalMessageTemplateService = new GlobalMessageTemplateService();
	}

	async getAll(req: Request, res: Response) {
		try {
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
			const { name, type, message } = req.body;

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
			const { id } = req.params;
			const updateData = req.body;

			const template = await this.globalMessageTemplateService.update(id, updateData);

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
			const { id: globalTemplateId } = req.params;
			const { retreatId } = req.body;

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
