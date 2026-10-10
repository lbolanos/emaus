import { AppDataSource } from '../data-source';
import { MessageTemplate } from '../entities/messageTemplate.entity';
import { CreateMessageTemplate, UpdateMessageTemplate } from '@repo/types';
import { domainAuditService, DomainAuditAction } from './domainAuditService';

/**
 * Auditoría de plantillas: el cuerpo del mensaje NO va al diff (HTML grande que
 * inflaría `domain_audit_log`); se registra si cambió y su longitud.
 */
const TEMPLATE_AUDIT_FIELDS = ['name', 'type', 'scope', 'isDefault'];

function templateAuditMetadata(
	previous: MessageTemplate | null,
	current: Pick<MessageTemplate, 'message'>,
): Record<string, unknown> {
	return {
		messageChanged: previous ? previous.message !== current.message : true,
		messageChars: current.message.length,
	};
}

/**
 * M6: how the system picks the template of a type when nothing pins one — the
 * retreat's "predeterminada" first, else the oldest (the historical fallback).
 * Shared by the sequence engine, the seed and the global-sequence import.
 */
export const DEFAULT_TEMPLATE_ORDER = { isDefault: 'DESC', createdAt: 'ASC' } as const;

/** Template used for `type` in a retreat when nothing pins one. */
export function findDefaultTemplateForType(retreatId: string, type: string): Promise<MessageTemplate | null> {
	return AppDataSource.getRepository(MessageTemplate).findOne({
		where: { retreatId, type: type as MessageTemplate['type'] },
		order: DEFAULT_TEMPLATE_ORDER,
	});
}

export class MessageTemplateService {
	private messageTemplateRepository = AppDataSource.getRepository(MessageTemplate);

	/**
	 * M6: a single default per (retreat, type). Saving one as default clears
	 * the flag from its siblings; community/global templates are not affected.
	 */
	private async clearOtherDefaults(saved: MessageTemplate | null): Promise<void> {
		if (!saved?.isDefault || !saved.retreatId) return;
		await this.messageTemplateRepository
			.createQueryBuilder()
			.update(MessageTemplate)
			.set({ isDefault: false })
			.where('retreatId = :retreatId AND type = :type AND id != :id', {
				retreatId: saved.retreatId,
				type: saved.type,
				id: saved.id,
			})
			.execute();
	}

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
		const saved = await this.messageTemplateRepository.save(newMessageTemplate);
		await this.clearOtherDefaults(saved);
		this.auditCreate(saved);
		return saved;
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
		const saved = await this.messageTemplateRepository.save(newMessageTemplate);
		await this.clearOtherDefaults(saved);
		this.auditCreate(saved);
		return saved;
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
		const saved = await this.messageTemplateRepository.save(newMessageTemplate);
		this.auditCreate(saved);
		return saved;
	}

	async update(id: string, data: UpdateMessageTemplate['body']): Promise<MessageTemplate | null> {
		const previous = await this.findById(id);
		const result = await this.messageTemplateRepository.update(id, data);
		if (result.affected === null || result.affected === undefined || result.affected === 0) {
			return null;
		}
		const updated = await this.findById(id);
		await this.clearOtherDefaults(updated);
		if (updated && previous) {
			void domainAuditService.logUpdate('message_template', id, previous, updated, {
				retreatId: updated.retreatId ?? null,
				fields: TEMPLATE_AUDIT_FIELDS,
				metadata: {
					...templateAuditMetadata(previous, updated),
					...(updated.communityId ? { communityId: updated.communityId } : {}),
				},
			});
		}
		return updated;
	}

	async remove(id: string): Promise<boolean> {
		const existing = await this.findById(id);
		const result = await this.messageTemplateRepository.delete(id);
		const deleted = result.affected !== null && result.affected !== undefined && result.affected > 0;
		if (deleted && existing) {
			void domainAuditService.logDelete('message_template', id, existing, {
				retreatId: existing.retreatId ?? null,
				fields: TEMPLATE_AUDIT_FIELDS,
				metadata: {
					...templateAuditMetadata(null, existing),
					...(existing.communityId ? { communityId: existing.communityId } : {}),
				},
			});
		}
		return deleted;
	}

	/** Traza de auditoría de una plantilla creada (scope retreat o community). */
	private auditCreate(saved: MessageTemplate): void {
		void domainAuditService.logCreate('message_template', saved.id, saved, {
			retreatId: saved.retreatId ?? null,
			fields: TEMPLATE_AUDIT_FIELDS,
			metadata: {
				...templateAuditMetadata(null, saved),
				...(saved.communityId ? { communityId: saved.communityId } : {}),
			},
		});
	}
}
