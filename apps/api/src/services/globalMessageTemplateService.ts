import { DataSource } from 'typeorm';
import { AppDataSource } from '../data-source';
import {
	GlobalMessageTemplate,
	GlobalMessageTemplateType,
} from '../entities/globalMessageTemplate.entity';
import { MessageTemplate } from '../entities/messageTemplate.entity';
import { Retreat } from '../entities/retreat.entity';
import { Community } from '../entities/community.entity';
import { User } from '../entities/user.entity';
import { getRepositories } from '../utils/repositoryHelpers';
import { v4 as uuidv4 } from 'uuid';
import { domainAuditService, DomainAuditAction } from './domainAuditService';

/** Campos con traza de auditoría de una plantilla global de mensaje. */
const GLOBAL_TEMPLATE_AUDIT_FIELDS = ['name', 'type', 'isActive'];

/** Metadata estándar: el cuerpo no va al diff, se registra si cambió y su tamaño. */
function templateBodyMetadata(
	previous: { message: string } | null,
	current: { message: string },
): Record<string, unknown> {
	return {
		messageChanged: previous ? previous.message !== current.message : true,
		messageChars: current.message.length,
	};
}

export interface TemplateVariables {
	user?: {
		displayName: string;
		email: string;
	};
	resetUrl?: string;
	invitationUrl?: string;
	verificationUrl?: string;
	inviterName?: string;
	roleName?: string;
	retreatName?: string;
	requestDate?: string;
	approvalDate?: string;
	rejectionReason?: string;
	[key: string]: any;
}

export class GlobalMessageTemplateService {
	private dataSource: DataSource;

	constructor(dataSource?: DataSource) {
		this.dataSource = dataSource || AppDataSource;
	}

	private get globalMessageTemplateRepository() {
		return getRepositories(this.dataSource).globalMessageTemplate;
	}

	private get messageTemplateRepository() {
		return getRepositories(this.dataSource).messageTemplate;
	}

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
		const saved = await this.globalMessageTemplateRepository.save(template);
		void domainAuditService.logCreate('global_message_template', saved.id, saved, {
			fields: GLOBAL_TEMPLATE_AUDIT_FIELDS,
			metadata: templateBodyMetadata(null, saved),
		});
		return saved;
	}

	async update(
		id: string,
		templateData: Partial<GlobalMessageTemplate>,
	): Promise<GlobalMessageTemplate | null> {
		const template = await this.globalMessageTemplateRepository.findOne({ where: { id } });
		if (!template) {
			return null;
		}

		const beforeAudit = {
			name: template.name,
			type: template.type,
			isActive: template.isActive,
		};
		const beforeMessage = template.message;
		Object.assign(template, templateData);
		const saved = await this.globalMessageTemplateRepository.save(template);
		void domainAuditService.logUpdate('global_message_template', id, beforeAudit, saved, {
			fields: GLOBAL_TEMPLATE_AUDIT_FIELDS,
			metadata: templateBodyMetadata({ message: beforeMessage }, saved),
		});
		return saved;
	}

	async delete(id: string): Promise<boolean> {
		const existing = await this.globalMessageTemplateRepository.findOne({ where: { id } });
		if (!existing) return false;
		const result = await this.globalMessageTemplateRepository.delete(id);
		const deleted = result.affected ? result.affected > 0 : false;
		if (deleted) {
			void domainAuditService.logDelete('global_message_template', id, existing, {
				fields: GLOBAL_TEMPLATE_AUDIT_FIELDS,
				metadata: templateBodyMetadata(null, existing),
			});
		}
		return deleted;
	}

	async toggleActive(id: string): Promise<GlobalMessageTemplate | null> {
		const template = await this.globalMessageTemplateRepository.findOne({ where: { id } });
		if (!template) {
			return null;
		}

		const wasActive = template.isActive;
		template.isActive = !template.isActive;
		const saved = await this.globalMessageTemplateRepository.save(template);
		void domainAuditService.logUpdate(
			'global_message_template',
			id,
			{ isActive: wasActive },
			{ isActive: saved.isActive },
			{
				fields: ['isActive'],
				action: DomainAuditAction.GLOBAL_MESSAGE_TEMPLATE_TOGGLE_ACTIVE,
			},
		);
		return saved;
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

		// Don't copy system templates (SYS_ prefixed) to retreats
		if (globalTemplate.type.startsWith('SYS_')) {
			return null;
		}

		// Check if a template with the same type already exists for this retreat
		const existingRetreatTemplate = await this.messageTemplateRepository.findOne({
			where: { retreatId, type: globalTemplate.type },
		});

		let saved: MessageTemplate;
		if (existingRetreatTemplate) {
			// Update existing template
			existingRetreatTemplate.message = globalTemplate.message;
			saved = await this.messageTemplateRepository.save(existingRetreatTemplate);
		} else {
			// Create new template
			const newTemplate = this.messageTemplateRepository.create({
				name: globalTemplate.name,
				type: globalTemplate.type,
				message: globalTemplate.message,
				scope: 'retreat',
				retreatId,
			});
			saved = await this.messageTemplateRepository.save(newTemplate);
		}
		// La copia escribe `message_templates` por repo directo (no pasa por
		// messageTemplateService): un solo evento de copia, sin doble registro.
		void domainAuditService.log({
			action: DomainAuditAction.GLOBAL_MESSAGE_TEMPLATE_COPY_TO_RETREAT,
			resourceType: 'global_message_template',
			resourceId: globalTemplateId,
			retreatId,
			metadata: {
				targetTemplateId: saved.id,
				updatedExisting: Boolean(existingRetreatTemplate),
				name: globalTemplate.name,
			},
		});
		return saved;
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

	async copyToCommunity(
		globalTemplateId: string,
		communityId: string,
	): Promise<MessageTemplate | null> {
		const globalTemplate = await this.globalMessageTemplateRepository.findOne({
			where: { id: globalTemplateId },
		});

		if (!globalTemplate) {
			return null;
		}

		// Don't copy system templates (SYS_ prefixed) to communities
		if (globalTemplate.type.startsWith('SYS_')) {
			return null;
		}

		// Check if a template with the same type already exists for this community
		const existingCommunityTemplate = await this.messageTemplateRepository.findOne({
			where: { communityId, type: globalTemplate.type, scope: 'community' },
		});

		let saved: MessageTemplate;
		if (existingCommunityTemplate) {
			// Update existing template
			existingCommunityTemplate.message = globalTemplate.message;
			saved = await this.messageTemplateRepository.save(existingCommunityTemplate);
		} else {
			// Create new template
			const newTemplate = this.messageTemplateRepository.create({
				name: globalTemplate.name,
				type: globalTemplate.type,
				message: globalTemplate.message,
				communityId,
				scope: 'community',
			});
			saved = await this.messageTemplateRepository.save(newTemplate);
		}
		void domainAuditService.log({
			action: DomainAuditAction.GLOBAL_MESSAGE_TEMPLATE_COPY_TO_COMMUNITY,
			resourceType: 'global_message_template',
			resourceId: globalTemplateId,
			metadata: {
				communityId,
				targetTemplateId: saved.id,
				updatedExisting: Boolean(existingCommunityTemplate),
				name: globalTemplate.name,
			},
		});
		return saved;
	}

	async copyAllActiveTemplatesToCommunity(communityId: string): Promise<MessageTemplate[]> {
		const activeGlobalTemplates = await this.globalMessageTemplateRepository.find({
			where: { isActive: true },
		});

		const newTemplates: MessageTemplate[] = [];

		for (const globalTemplate of activeGlobalTemplates) {
			const copiedTemplate = await this.copyToCommunity(globalTemplate.id, communityId);
			if (copiedTemplate) {
				newTemplates.push(copiedTemplate);
			}
		}

		return newTemplates;
	}

	async copyRetreatTemplateToCommunity(
		retreatTemplateId: string,
		communityId: string,
	): Promise<MessageTemplate | null> {
		const retreatTemplate = await this.messageTemplateRepository.findOne({
			where: { id: retreatTemplateId, scope: 'retreat' },
		});

		if (!retreatTemplate) {
			return null;
		}

		// Check if a template with the same type already exists for this community
		const existingCommunityTemplate = await this.messageTemplateRepository.findOne({
			where: { communityId, type: retreatTemplate.type, scope: 'community' },
		});

		let saved: MessageTemplate;
		if (existingCommunityTemplate) {
			// Update existing template
			existingCommunityTemplate.message = retreatTemplate.message;
			saved = await this.messageTemplateRepository.save(existingCommunityTemplate);
		} else {
			// Create new template
			const newTemplate = this.messageTemplateRepository.create({
				name: retreatTemplate.name,
				type: retreatTemplate.type,
				message: retreatTemplate.message,
				communityId,
				scope: 'community',
			});
			saved = await this.messageTemplateRepository.save(newTemplate);
		}
		void domainAuditService.log({
			action: DomainAuditAction.GLOBAL_MESSAGE_TEMPLATE_COPY_FROM_RETREAT,
			resourceType: 'global_message_template',
			// El recurso copiado es la plantilla del RETIRO (origen); la comunidad
			// va en metadata porque la columna retreatId no aplica.
			resourceId: retreatTemplateId,
			retreatId: retreatTemplate.retreatId ?? null,
			metadata: {
				communityId,
				targetTemplateId: saved.id,
				updatedExisting: Boolean(existingCommunityTemplate),
				name: retreatTemplate.name,
			},
		});
		return saved;
	}

	// System template methods

	/**
	 * Get a single template by type
	 */
	async getTemplate(type: GlobalMessageTemplateType): Promise<GlobalMessageTemplate | null> {
		return await this.globalMessageTemplateRepository.findOne({
			where: { type, isActive: true },
		});
	}

	/**
	 * Get system templates (SYS_ prefixed)
	 */
	async getSystemTemplates(): Promise<GlobalMessageTemplate[]> {
		return await this.globalMessageTemplateRepository
			.createQueryBuilder('template')
			.where('template.type LIKE :prefix', { prefix: 'SYS_%' })
			.andWhere('template.isActive = :isActive', { isActive: true })
			.orderBy('template.type', 'ASC')
			.getMany();
	}

	/**
	 * Process template with variable replacement
	 */
	async processTemplate(
		type: GlobalMessageTemplateType,
		variables: TemplateVariables,
	): Promise<{ subject: string; html: string; text: string }> {
		const template = await this.getTemplate(type);

		if (!template) {
			throw new Error(`Template not found: ${type}`);
		}

		// Extract subject from first <h1> or <h2> tag, or use template name
		const subjectMatch = template.message.match(/<h[12][^>]*>(.*?)<\/h[12]>/);
		const subject = subjectMatch ? subjectMatch[1].replace(/<[^>]*>/g, '').trim() : template.name;

		// Process variables in the message
		let processedMessage = template.message;

		// Replace user variables
		if (variables.user) {
			processedMessage = processedMessage.replace(
				/\{user\.displayName\}/g,
				variables.user.displayName,
			);
			processedMessage = processedMessage.replace(/\{user\.email\}/g, variables.user.email);
			processedMessage = processedMessage.replace(/\{user\.name\}/g, variables.user.displayName);
		}

		// Replace other variables
		Object.entries(variables).forEach(([key, value]) => {
			if (key !== 'user' && value !== undefined) {
				const regex = new RegExp(`\\{${key}\\}`, 'g');
				processedMessage = processedMessage.replace(regex, String(value));
			}
		});

		// Convert HTML to text
		const text = this.htmlToText(processedMessage);

		return {
			subject,
			html: processedMessage,
			text,
		};
	}

	/**
	 * Send system email using template
	 */
	async sendSystemEmail(
		type: GlobalMessageTemplateType,
		toEmail: string,
		variables: TemplateVariables,
	): Promise<{ success: boolean; error?: string }> {
		try {
			const { subject, html, text } = await this.processTemplate(type, variables);

			// Import EmailService here to avoid circular dependencies
			const { EmailService } = await import('./emailService');
			const emailService = new EmailService();

			await emailService.sendEmail({
				to: toEmail,
				subject,
				html,
				text,
			});

			// Log the communication (optional)
			console.log(`System email sent: ${type} to ${toEmail}`);

			return { success: true };
		} catch (error) {
			console.error(`Error sending system email (${type}):`, error);
			return {
				success: false,
				error: error instanceof Error ? error.message : 'Unknown error',
			};
		}
	}

	/**
	 * Send password reset email
	 */
	async sendPasswordResetEmail(
		user: User,
		resetUrl: string,
	): Promise<{ success: boolean; error?: string }> {
		return await this.sendSystemEmail(GlobalMessageTemplateType.SYS_PASSWORD_RESET, user.email, {
			user: {
				displayName: user.displayName,
				email: user.email,
			},
			resetUrl,
		});
	}

	/**
	 * Send user invitation email
	 */
	async sendUserInvitationEmail(
		user: User,
		invitationUrl: string,
		inviterName: string,
	): Promise<{ success: boolean; error?: string }> {
		return await this.sendSystemEmail(GlobalMessageTemplateType.SYS_USER_INVITATION, user.email, {
			user: {
				displayName: user.displayName,
				email: user.email,
			},
			invitationUrl,
			inviterName,
		});
	}

	/**
	 * Send registration confirmation email
	 */
	async sendRegistrationConfirmationEmail(
		user: User,
	): Promise<{ success: boolean; error?: string }> {
		return await this.sendSystemEmail(
			GlobalMessageTemplateType.SYS_REGISTRATION_CONFIRMATION,
			user.email,
			{
				user: {
					displayName: user.displayName,
					email: user.email,
				},
			},
		);
	}

	/**
	 * Send email verification email
	 */
	async sendEmailVerificationEmail(
		user: User,
		verificationUrl: string,
	): Promise<{ success: boolean; error?: string }> {
		return await this.sendSystemEmail(
			GlobalMessageTemplateType.SYS_EMAIL_VERIFICATION,
			user.email,
			{
				user: {
					displayName: user.displayName,
					email: user.email,
				},
				verificationUrl,
			},
		);
	}

	/**
	 * Send account locked email
	 */
	async sendAccountLockedEmail(user: User): Promise<{ success: boolean; error?: string }> {
		return await this.sendSystemEmail(GlobalMessageTemplateType.SYS_ACCOUNT_LOCKED, user.email, {
			user: {
				displayName: user.displayName,
				email: user.email,
			},
		});
	}

	/**
	 * Send account unlocked email
	 */
	async sendAccountUnlockedEmail(user: User): Promise<{ success: boolean; error?: string }> {
		return await this.sendSystemEmail(GlobalMessageTemplateType.SYS_ACCOUNT_UNLOCKED, user.email, {
			user: {
				displayName: user.displayName,
				email: user.email,
			},
		});
	}

	/**
	 * Send role requested email
	 */
	async sendRoleRequestedEmail(
		user: User,
		roleName: string,
		retreatName: string,
	): Promise<{ success: boolean; error?: string }> {
		return await this.sendSystemEmail(GlobalMessageTemplateType.SYS_ROLE_REQUESTED, user.email, {
			user: {
				displayName: user.displayName,
				email: user.email,
			},
			roleName,
			retreatName,
			requestDate: new Date().toLocaleString('es-ES', { timeZone: 'America/Mexico_City' }),
		});
	}

	/**
	 * Send role approved email
	 */
	async sendRoleApprovedEmail(
		user: User,
		roleName: string,
		retreatName: string,
	): Promise<{ success: boolean; error?: string }> {
		return await this.sendSystemEmail(GlobalMessageTemplateType.SYS_ROLE_APPROVED, user.email, {
			user: {
				displayName: user.displayName,
				email: user.email,
			},
			roleName,
			retreatName,
			approvalDate: new Date().toLocaleString('es-ES', { timeZone: 'America/Mexico_City' }),
		});
	}

	/**
	 * Send role rejected email
	 */
	async sendRoleRejectedEmail(
		user: User,
		roleName: string,
		retreatName: string,
		rejectionReason: string,
	): Promise<{ success: boolean; error?: string }> {
		return await this.sendSystemEmail(GlobalMessageTemplateType.SYS_ROLE_REJECTED, user.email, {
			user: {
				displayName: user.displayName,
				email: user.email,
			},
			roleName,
			retreatName,
			rejectionReason,
		});
	}

	/**
	 * Convert HTML to plain text
	 */
	private htmlToText(html: string): string {
		return html
			.replace(/<h[1-6][^>]*>/g, '\n\n')
			.replace(/<\/h[1-6]>/g, '\n')
			.replace(/<p[^>]*>/g, '')
			.replace(/<\/p>/g, '\n\n')
			.replace(/<br[^>]*>/g, '\n')
			.replace(/<li[^>]*>/g, '• ')
			.replace(/<\/li>/g, '\n')
			.replace(/<[^>]*>/g, ' ')
			.replace(/&nbsp;/g, ' ')
			.replace(/&amp;/g, '&')
			.replace(/&lt;/g, '<')
			.replace(/&gt;/g, '>')
			.replace(/&quot;/g, '"')
			.replace(/\s+/g, ' ')
			.trim();
	}
}
