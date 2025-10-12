import { AppDataSource } from '../data-source';
import { MessageTemplate } from '../entities/messageTemplate.entity';
import { GlobalMessageTemplate } from '../entities/globalMessageTemplate.entity';
import { User } from '../entities/user.entity';
import { Retreat } from '../entities/retreat.entity';
import { Role } from '../entities/role.entity';
import * as nodemailer from 'nodemailer';

export interface EmailTemplateData {
	user: User;
	retreat?: Retreat;
	role?: Role;
	resetToken?: string;
	inviterName?: string;
	shareLink?: string;
}

export class UserManagementMailer {
	private messageTemplateRepository = AppDataSource.getRepository(MessageTemplate);
	private globalMessageTemplateRepository = AppDataSource.getRepository(GlobalMessageTemplate);
	private transporter: nodemailer.Transporter;

	constructor() {
		this.transporter = nodemailer.createTransport({
			host: process.env.SMTP_HOST,
			port: parseInt(process.env.SMTP_PORT || '587'),
			secure: process.env.SMTP_SECURE === 'true',
			auth: {
				user: process.env.SMTP_USER,
				pass: process.env.SMTP_PASS,
			},
		});
	}

	async sendUserInvitation(
		email: string,
		retreatId: string,
		data: EmailTemplateData,
	): Promise<boolean> {
		try {
			let template: MessageTemplate | GlobalMessageTemplate | null =
				await this.messageTemplateRepository.findOne({
					where: { retreatId, type: 'USER_INVITATION' },
				});

			// Fallback to global system template if retreat-specific template not found
			if (!template) {
				template = await this.globalMessageTemplateRepository.findOne({
					where: { type: 'SYS_USER_INVITATION', isActive: true },
				});
			}

			if (!template) {
				throw new Error('USER_INVITATION template not found');
			}

			const subject = `Invitación al Retiro ${data.retreat?.parish || 'Emaús'}`;
			const html = this.processTemplate(template.message, data);

			await this.transporter.sendMail({
				from: process.env.SMTP_FROM,
				to: email,
				subject,
				html,
			});

			return true;
		} catch (error) {
			console.error('Error sending user invitation:', error);
			return false;
		}
	}

	async sendPasswordReset(
		email: string,
		retreatId: string,
		data: EmailTemplateData,
	): Promise<boolean> {
		try {
			let template: MessageTemplate | GlobalMessageTemplate | null =
				await this.messageTemplateRepository.findOne({
					where: { retreatId, type: 'PASSWORD_RESET' },
				});

			// Fallback to global system template if retreat-specific template not found
			if (!template) {
				template = await this.globalMessageTemplateRepository.findOne({
					where: { type: 'SYS_PASSWORD_RESET', isActive: true },
				});
			}

			if (!template) {
				throw new Error('PASSWORD_RESET template not found');
			}

			const subject = 'Restablecer tu contraseña';
			const html = this.processTemplate(template.message, data);

			await this.transporter.sendMail({
				from: process.env.SMTP_FROM,
				to: email,
				subject,
				html,
			});

			return true;
		} catch (error) {
			console.error('Error sending password reset:', error);
			return false;
		}
	}

	async sendRetreatSharedNotification(
		email: string,
		retreatId: string,
		data: EmailTemplateData,
	): Promise<boolean> {
		try {
			let template: MessageTemplate | GlobalMessageTemplate | null =
				await this.messageTemplateRepository.findOne({
					where: { retreatId, type: 'RETREAT_SHARED_NOTIFICATION' },
				});

			// Fallback to global system template if retreat-specific template not found
			if (!template) {
				template = await this.globalMessageTemplateRepository.findOne({
					where: { type: 'SYS_USER_INVITATION', isActive: true }, // Use general invitation as fallback
				});
			}

			if (!template) {
				throw new Error('RETREAT_SHARED_NOTIFICATION template not found');
			}

			const subject = `Retiro compartido: ${data.retreat?.parish || 'Emaús'}`;
			const html = this.processTemplate(template.message, data);

			await this.transporter.sendMail({
				from: process.env.SMTP_FROM,
				to: email,
				subject,
				html,
			});

			return true;
		} catch (error) {
			console.error('Error sending retreat shared notification:', error);
			return false;
		}
	}

	private processTemplate(template: string, data: EmailTemplateData): string {
		let processed = template;

		if (data.user) {
			processed = processed.replace(/{user\.name}/g, data.user.displayName || '');
			processed = processed.replace(/{user\.displayName}/g, data.user.displayName || '');
			processed = processed.replace(/{user\.email}/g, data.user.email || '');
			processed = processed.replace(/{user\.nickname}/g, data.user.displayName || '');
		}

		if (data.retreat) {
			processed = processed.replace(/{retreat\.name}/g, data.retreat.parish || '');
			processed = processed.replace(
				/{retreat\.startDate}/g,
				data.retreat.startDate ? new Date(data.retreat.startDate).toLocaleDateString('es-ES') : '',
			);
			processed = processed.replace(
				/{retreat\.endDate}/g,
				data.retreat.endDate ? new Date(data.retreat.endDate).toLocaleDateString('es-ES') : '',
			);
		}

		if (data.role) {
			processed = processed.replace(/{role\.name}/g, data.role.name || '');
			processed = processed.replace(/{role}/g, data.role.name || '');
		}

		if (data.resetToken) {
			processed = processed.replace(/{resetToken}/g, data.resetToken);
		}

		if (data.inviterName) {
			processed = processed.replace(/{inviterName}/g, data.inviterName);
		}

		if (data.shareLink) {
			processed = processed.replace(/{shareLink}/g, data.shareLink);
		}

		// Handle invitationUrl - use shareLink as fallback for backwards compatibility
		if (data.shareLink) {
			processed = processed.replace(/{invitationUrl}/g, data.shareLink);
		}

		return processed.replace(/\n/g, '<br>');
	}

	async verifyConnection(): Promise<boolean> {
		try {
			await this.transporter.verify();
			return true;
		} catch (error) {
			console.error('SMTP connection verification failed:', error);
			return false;
		}
	}
}
