import { AppDataSource } from '../data-source';
import { MessageTemplate } from '../entities/messageTemplate.entity';
import { CreateMessageTemplate, UpdateMessageTemplate } from '@repo/types';

export class MessageTemplateService {
	private messageTemplateRepository = AppDataSource.getRepository(MessageTemplate);

	async findAll(retreatId: string): Promise<MessageTemplate[]> {
		return this.messageTemplateRepository.find({ where: { retreatId, scope: 'retreat' } });
	}

	/**
	 * Returns templates the community owner can see:
	 *  - community-specific (communityId = :cid)
	 *  - global fallbacks (communityId IS NULL) so the owner knows what text is
	 *    being sent by default and can override.
	 *
	 * Owners only have write access on community-specific rows; the controller
	 * blocks edit/delete on globals.
	 */
	async findByCommunity(communityId: string): Promise<MessageTemplate[]> {
		return this.messageTemplateRepository
			.createQueryBuilder('t')
			.where('t.scope = :scope', { scope: 'community' })
			.andWhere('(t.communityId = :cid OR t.communityId IS NULL)', { cid: communityId })
			// community-specific first, then globals, so the same `type` shows
			// the override above the inherited row.
			.orderBy('CASE WHEN t.communityId IS NULL THEN 1 ELSE 0 END', 'ASC')
			.addOrderBy('t.name', 'ASC')
			.getMany();
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
