import { AppDataSource } from '../data-source';
import {
	GlobalMessageTemplate,
	GlobalMessageTemplateType,
} from '../entities/globalMessageTemplate.entity';
import { MessageTemplate } from '../entities/messageTemplate.entity';
import { Retreat } from '../entities/retreat.entity';
import { v4 as uuidv4 } from 'uuid';

export class GlobalMessageTemplateService {
	private globalMessageTemplateRepository = AppDataSource.getRepository(GlobalMessageTemplate);
	private messageTemplateRepository = AppDataSource.getRepository(MessageTemplate);

	async getAll(): Promise<GlobalMessageTemplate[]> {
		return this.globalMessageTemplateRepository.find({
			order: { name: 'ASC' },
		});
	}

	async getById(id: string): Promise<GlobalMessageTemplate | null> {
		return this.globalMessageTemplateRepository.findOne({ where: { id } });
	}

	async getByType(type: GlobalMessageTemplateType): Promise<GlobalMessageTemplate[]> {
		return this.globalMessageTemplateRepository.find({
			where: { type, isActive: true },
			order: { name: 'ASC' },
		});
	}

	async create(templateData: Partial<GlobalMessageTemplate>): Promise<GlobalMessageTemplate> {
		const template = this.globalMessageTemplateRepository.create({
			...templateData,
			id: uuidv4(),
		});
		return this.globalMessageTemplateRepository.save(template);
	}

	async update(
		id: string,
		templateData: Partial<GlobalMessageTemplate>,
	): Promise<GlobalMessageTemplate | null> {
		const template = await this.globalMessageTemplateRepository.findOne({ where: { id } });
		if (!template) {
			return null;
		}

		Object.assign(template, templateData);
		return this.globalMessageTemplateRepository.save(template);
	}

	async delete(id: string): Promise<boolean> {
		const result = await this.globalMessageTemplateRepository.delete(id);
		return result.affected ? result.affected > 0 : false;
	}

	async toggleActive(id: string): Promise<GlobalMessageTemplate | null> {
		const template = await this.globalMessageTemplateRepository.findOne({ where: { id } });
		if (!template) {
			return null;
		}

		template.isActive = !template.isActive;
		return this.globalMessageTemplateRepository.save(template);
	}

	async copyToRetreat(
		globalTemplateId: string,
		retreatId: string,
	): Promise<MessageTemplate | null> {
		const globalTemplate = await this.globalMessageTemplateRepository.findOne({
			where: { id: globalTemplateId },
		});

		if (!globalTemplate) {
			return null;
		}

		// Check if a template with the same type already exists for this retreat
		const existingRetreatTemplate = await this.messageTemplateRepository.findOne({
			where: { retreatId, type: globalTemplate.type },
		});

		if (existingRetreatTemplate) {
			// Update existing template
			existingRetreatTemplate.message = globalTemplate.message;
			return this.messageTemplateRepository.save(existingRetreatTemplate);
		}

		// Create new template
		const newTemplate = this.messageTemplateRepository.create({
			id: uuidv4(),
			name: globalTemplate.name,
			type: globalTemplate.type,
			message: globalTemplate.message,
			retreatId,
		});

		return this.messageTemplateRepository.save(newTemplate);
	}

	async copyAllActiveTemplatesToRetreat(retreat: Retreat): Promise<MessageTemplate[]> {
		const activeGlobalTemplates = await this.globalMessageTemplateRepository.find({
			where: { isActive: true },
		});

		const newTemplates: MessageTemplate[] = [];

		for (const globalTemplate of activeGlobalTemplates) {
			const copiedTemplate = await this.copyToRetreat(globalTemplate.id, retreat.id);
			if (copiedTemplate) {
				newTemplates.push(copiedTemplate);
			}
		}

		return newTemplates;
	}
}
