import { AppDataSource } from '../data-source';
import { MessageTemplate } from '../entities/messageTemplate.entity';
import { CreateMessageTemplate, UpdateMessageTemplate } from '@repo/types';

export class MessageTemplateService {
	private messageTemplateRepository = AppDataSource.getRepository(MessageTemplate);

	async findAll(retreatId: string): Promise<MessageTemplate[]> {
		return this.messageTemplateRepository.find({ where: { retreatId, scope: 'retreat' } });
	}

	async findByCommunity(communityId: string): Promise<MessageTemplate[]> {
		return this.messageTemplateRepository.find({ where: { communityId, scope: 'community' } });
	}

	async findByCommunityAndType(communityId: string, type: string): Promise<MessageTemplate | null> {
		return this.messageTemplateRepository.findOne({
			where: { communityId, type, scope: 'community' },
		});
	}

	async findById(id: string): Promise<MessageTemplate | null> {
		return this.messageTemplateRepository.findOneBy({ id });
	}

	async create(data: CreateMessageTemplate['body']): Promise<MessageTemplate> {
		const newMessageTemplate = this.messageTemplateRepository.create(data);
		return this.messageTemplateRepository.save(newMessageTemplate);
	}

	async createForRetreat(
		retreatId: string,
		data: Omit<CreateMessageTemplate['body'], 'retreatId' | 'scope'>,
	): Promise<MessageTemplate> {
		const newMessageTemplate = this.messageTemplateRepository.create({
			...data,
			retreatId,
			scope: 'retreat',
		});
		return this.messageTemplateRepository.save(newMessageTemplate);
	}

	async createForCommunity(
		communityId: string,
		data: Omit<CreateMessageTemplate['body'], 'communityId' | 'scope'>,
	): Promise<MessageTemplate> {
		const newMessageTemplate = this.messageTemplateRepository.create({
			...data,
			communityId,
			scope: 'community',
		});
		return this.messageTemplateRepository.save(newMessageTemplate);
	}

	async update(id: string, data: UpdateMessageTemplate['body']): Promise<MessageTemplate | null> {
		const result = await this.messageTemplateRepository.update(id, data);
		if (result.affected === null || result.affected === undefined || result.affected === 0) {
			return null;
		}
		return this.findById(id);
	}

	async remove(id: string): Promise<boolean> {
		const result = await this.messageTemplateRepository.delete(id);
		return result.affected !== null && result.affected !== undefined && result.affected > 0;
	}
}
