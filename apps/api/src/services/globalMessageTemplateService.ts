import { AppDataSource } from '../data-source';
import {
	GlobalMessageTemplate,
	GlobalMessageTemplateType,
} from '../entities/globalMessageTemplate.entity';
import { MessageTemplate } from '../entities/messageTemplate.entity';
import { Retreat } from '../entities/retreat.entity';
import { User } from '../entities/user.entity';
import { v4 as uuidv4 } from 'uuid';

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

		// Don't copy system templates (SYS_ prefixed) to retreats
		if (globalTemplate.type.startsWith('SYS_')) {
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
			requestDate: new Date().toLocaleString('es-ES'),
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
			approvalDate: new Date().toLocaleString('es-ES'),
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
