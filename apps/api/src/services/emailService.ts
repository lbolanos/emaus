import { AppDataSource } from '../data-source';
import { MessageTemplate } from '../entities/messageTemplate.entity';
import { Participant } from '../entities/participant.entity';
import { Retreat } from '../entities/retreat.entity';
import * as nodemailer from 'nodemailer';
import { replaceAllVariables, convertHtmlToEmail } from '@repo/utils';

const retreatRepository = AppDataSource.getRepository(Retreat);
const messageTemplateRepository = AppDataSource.getRepository(MessageTemplate);

export interface EmailData {
	to: string;
	subject: string;
	html: string;
	text?: string;
	cc?: string[];
	bcc?: string[];
}

export interface ParticipantEmailData {
	to: string;
	subject?: string;
	participant: Participant;
	retreat: Retreat;
	templateId?: string;
	templateName?: string;
	messageContent: string;
}

export class EmailService {
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

	async sendEmail(emailData: EmailData): Promise<boolean> {
		try {
			if (!this.isSmtpConfigured()) {
				throw new Error('SMTP configuration is not complete');
			}

			const mailOptions: nodemailer.SendMailOptions = {
				from: process.env.SMTP_FROM || 'noreply@emaus.com',
				to: emailData.to,
				subject: emailData.subject,
				html: emailData.html,
				text: emailData.text,
				cc: emailData.cc,
				bcc: emailData.bcc,
			};

			await this.transporter.sendMail(mailOptions);
			return true;
		} catch (error) {
			console.error('Error sending email:', error);
			throw error;
		}
	}

	async sendParticipantEmail(data: ParticipantEmailData): Promise<boolean> {
		try {
			const subject =
				data.subject || `Mensaje para ${data.participant.firstName} ${data.participant.lastName}`;

			// Use enhanced email formatting with convertHtmlToEmail
			const enhancedHtml = convertHtmlToEmail(data.messageContent, {
				format: 'enhanced',
				skipTemplate: false,
			});

			return await this.sendEmail({
				to: data.to,
				subject,
				html: enhancedHtml,
				text: this.htmlToText(data.messageContent),
			});
		} catch (error) {
			console.error('Error sending participant email:', error);
			throw error;
		}
	}

	async sendTestEmail(to: string): Promise<boolean> {
		try {
			const testEmailContent = `
				<!DOCTYPE html>
				<html>
				<head>
					<meta charset="utf-8">
					<title>Correo de Prueba</title>
				</head>
				<body style="font-family: Arial, sans-serif; line-height: 1.6; margin: 0; padding: 20px; background-color: #f5f5f5;">
					<div style="max-width: 600px; margin: 0 auto; background-color: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
						<h1 style="color: #333; text-align: center;">Correo de Prueba</h1>
						<p style="color: #666;">Este es un correo de prueba para verificar la configuración SMTP del sistema Emaus.</p>
						<p style="color: #666;">Si recibes este correo, significa que la configuración SMTP está funcionando correctamente.</p>
						<hr style="border: none; border-top: 1px solid #e0e0e0; margin: 20px 0;">
						<p style="color: #999; font-size: 12px; text-align: center;">
							Enviado desde el sistema Emaus - ${new Date().toLocaleString('es-ES')}
						</p>
					</div>
				</body>
				</html>
			`;

			return await this.sendEmail({
				to,
				subject: 'Correo de Prueba - Sistema Emaus',
				html: testEmailContent,
				text: 'Este es un correo de prueba para verificar la configuración SMTP del sistema Emaus.',
			});
		} catch (error) {
			console.error('Error sending test email:', error);
			throw error;
		}
	}

	async verifyConnection(): Promise<{ success: boolean; message: string }> {
		try {
			if (!this.isSmtpConfigured()) {
				return {
					success: false,
					message:
						'Configuración SMTP incompleta. Verifica las variables de entorno SMTP_HOST, SMTP_USER, y SMTP_PASS.',
				};
			}

			await this.transporter.verify();
			return {
				success: true,
				message: 'Conexión SMTP verificada correctamente',
			};
		} catch (error) {
			console.error('SMTP connection verification failed:', error);
			return {
				success: false,
				message: `Error de conexión SMTP: ${error instanceof Error ? error.message : 'Error desconocido'}`,
			};
		}
	}

	getSmtpConfigStatus(): { configured: boolean; host: string | null; user: string | null } {
		return {
			configured: this.isSmtpConfigured(),
			host: process.env.SMTP_HOST || null,
			user: process.env.SMTP_USER || null,
		};
	}

	private isSmtpConfigured(): boolean {
		return !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
	}

	private htmlToText(html: string): string {
		return html
			.replace(/<[^>]*>/g, ' ')
			.replace(/\s+/g, ' ')
			.replace(/&nbsp;/g, ' ')
			.replace(/&amp;/g, '&')
			.replace(/&lt;/g, '<')
			.replace(/&gt;/g, '>')
			.replace(/&quot;/g, '"')
			.trim();
	}

	async sendEmailWithTemplate(
		to: string,
		templateId: string,
		retreatId: string,
		data: Record<string, any>,
	): Promise<boolean> {
		try {
			const template = await messageTemplateRepository.findOne({
				where: { id: templateId, retreatId },
			});

			if (!template) {
				throw new Error('Plantilla no encontrada');
			}

			const processedMessage = this.processTemplate(template.message, data);

			// Use enhanced email formatting with convertHtmlToEmail
			const enhancedHtml = convertHtmlToEmail(processedMessage, {
				format: 'enhanced',
				skipTemplate: false,
			});

			return await this.sendEmail({
				to,
				subject: template.name,
				html: enhancedHtml,
				text: this.htmlToText(processedMessage),
			});
		} catch (error) {
			console.error('Error sending email with template:', error);
			throw error;
		}
	}

	private processTemplate(template: string, data: Record<string, any>): string {
		return replaceAllVariables(template, data.participant, data.retreat).replace(/\n/g, '<br>');
	}
}
