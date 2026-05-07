import { Request, Response } from 'express';
import { AppDataSource } from '../data-source';
import { ParticipantCommunication, MessageType } from '../entities/participantCommunication.entity';
import { MessageTemplate } from '../entities/messageTemplate.entity';
import { Participant } from '../entities/participant.entity';
import { DeepPartial } from 'typeorm';
import { EmailService, ParticipantEmailData } from '../services/emailService';
import { authorizationService } from '../middleware/authorization';

class CreateCommunicationDTO {
	participantId!: string;
	retreatId!: string;
	communityId?: string;
	messageType!: 'whatsapp' | 'email';
	recipientContact!: string;
	messageContent!: string;
	templateId?: string;
	templateName?: string;
	subject?: string;
}

// Returns true when the caller is a superadmin OR has access to the
// retreat (admin/coordinator). Use to gate every retreat-scoped endpoint
// in this controller — `requirePermission('participant:update')` is a
// global permission and does NOT restrict to the user's own retreats,
// which is too coarse for write/SMTP endpoints.
async function callerHasRetreatAccess(req: Request, retreatId: string): Promise<boolean> {
	const userId = (req.user as any)?.id;
	if (!userId || !retreatId) {
		return false;
	}
	return authorizationService.hasRetreatAccess(userId, retreatId);
}

export class ParticipantCommunicationController {
	private communicationRepository = AppDataSource.getRepository(ParticipantCommunication);
	private templateRepository = AppDataSource.getRepository(MessageTemplate);
	private participantRepository = AppDataSource.getRepository(Participant);
	private emailService = new EmailService();

	// Get all communications for a participant
	getParticipantCommunications = async (req: Request, res: Response) => {
		try {
			const { participantId } = req.params;
			const { retreatId, limit = 50, offset = 0 } = req.query;

			// Authorization: caller must have access to the retreat. We
			// accept the retreat from `?retreatId=` (frontend always sends
			// it) and fall back to the participant's stored retreatId.
			let effectiveRetreatId = retreatId as string | undefined;
			if (!effectiveRetreatId) {
				const p = await this.participantRepository.findOne({
					where: { id: participantId },
				});
				if (!p) {
					return res.status(404).json({ error: 'Participante no encontrado' });
				}
				effectiveRetreatId = (p as any).retreatId ?? undefined;
			}
			if (!effectiveRetreatId) {
				return res.status(400).json({ error: 'retreatId requerido' });
			}
			if (!(await callerHasRetreatAccess(req, effectiveRetreatId))) {
				return res.status(403).json({ error: 'Forbidden' });
			}

			const where: any = { participantId };
			if (retreatId) {
				where.retreatId = retreatId;
			}

			const [communications, total] = await this.communicationRepository.findAndCount({
				where,
				relations: ['participant', 'retreat', 'template', 'sender'],
				order: {
					sentAt: 'DESC',
				},
				take: Number(limit),
				skip: Number(offset),
			});

			res.json({
				communications,
				total,
				limit: Number(limit),
				offset: Number(offset),
			});
		} catch (error) {
			console.error('Error fetching participant communications:', error);
			res.status(500).json({
				error: 'Error al obtener las comunicaciones del participante',
			});
		}
	};

	// Get all communications for a retreat
	getRetreatCommunications = async (req: Request, res: Response) => {
		try {
			const { retreatId } = req.params;
			const { participantId, messageType, limit = 50, offset = 0 } = req.query;

			const where: any = { retreatId };
			if (participantId) {
				where.participantId = participantId;
			}
			if (messageType) {
				where.messageType = messageType;
			}

			const [communications, total] = await this.communicationRepository.findAndCount({
				where,
				relations: ['participant', 'retreat', 'template', 'sender'],
				order: {
					sentAt: 'DESC',
				},
				take: Number(limit),
				skip: Number(offset),
			});

			res.json({
				communications,
				total,
				limit: Number(limit),
				offset: Number(offset),
			});
		} catch (error) {
			console.error('Error fetching retreat communications:', error);
			res.status(500).json({
				error: 'Error al obtener las comunicaciones del retiro',
			});
		}
	};

	// Create a new communication record
	createCommunication = async (req: Request, res: Response) => {
		try {
			const dto = { ...req.body } as CreateCommunicationDTO;

			// Basic validation
			if (
				!dto.participantId ||
				!dto.retreatId ||
				!dto.messageType ||
				!dto.recipientContact ||
				!dto.messageContent
			) {
				return res.status(400).json({
					error: 'Datos inválidos',
					details: 'Faltan campos requeridos',
				});
			}

			// Authorization: caller must have access to the target retreat.
			// `participant:update` is global; it doesn't bind the user to
			// their own retreats. Without this check, any user with the
			// permission could create records in retreats they don't own.
			if (!(await callerHasRetreatAccess(req, dto.retreatId))) {
				return res.status(403).json({ error: 'Forbidden' });
			}

			// Verify participant exists
			const participant = await this.participantRepository.findOne({
				where: { id: dto.participantId },
			});

			if (!participant) {
				return res.status(404).json({
					error: 'Participante no encontrado',
				});
			}

			// Defense in depth: participant must belong to the claimed
			// retreat (when its retreatId is populated).
			const participantRetreatId = (participant as any).retreatId;
			if (participantRetreatId && participantRetreatId !== dto.retreatId) {
				return res.status(400).json({
					error: 'El participante no pertenece al retiro indicado',
				});
			}

			// Normalize templateId to avoid empty-string FK violations.
			dto.templateId = dto.templateId || undefined;
			let templateName = dto.templateName || undefined;
			if (dto.templateId) {
				const template = await this.templateRepository.findOne({
					where: { id: dto.templateId },
				});

				if (!template) {
					return res.status(404).json({
						error: 'Plantilla no encontrada',
					});
				}

				templateName = template.name;
			}

			// Create communication record
			const communication = this.communicationRepository.create({
				participantId: dto.participantId,
				scope: dto.communityId ? 'community' : 'retreat',
				retreatId: dto.retreatId,
				communityId: dto.communityId,
				messageType: dto.messageType as MessageType,
				recipientContact: dto.recipientContact,
				messageContent: dto.messageContent,
				templateId: dto.templateId,
				templateName,
				subject: dto.subject,
				sentBy: (req.user as any)?.id,
			} as DeepPartial<ParticipantCommunication>);

			const savedCommunication = await this.communicationRepository.save(communication);

			// Fetch the complete record with relations
			const completeCommunication = await this.communicationRepository.findOne({
				where: { id: (savedCommunication as any).id },
				relations: ['participant', 'retreat', 'template', 'sender'],
			});

			res.status(201).json(completeCommunication);
		} catch (error) {
			console.error('Error creating communication:', error);
			res.status(500).json({
				error: 'Error al crear el registro de comunicación',
			});
		}
	};

	// Get communication statistics for a retreat
	getRetreatCommunicationStats = async (req: Request, res: Response) => {
		try {
			const { retreatId } = req.params;

			// Get counts by message type
			const whatsappCount = await this.communicationRepository.count({
				where: { retreatId, messageType: 'whatsapp' },
			});

			const emailCount = await this.communicationRepository.count({
				where: { retreatId, messageType: 'email' },
			});

			// Get unique participants communicated with
			const uniqueParticipants = await this.communicationRepository
				.createQueryBuilder('communication')
				.select('COUNT(DISTINCT communication.participantId)', 'count')
				.where('communication.retreatId = :retreatId', { retreatId })
				.getRawOne();

			// Get most used templates
			const templateUsage = await this.communicationRepository
				.createQueryBuilder('communication')
				.select('communication.templateName', 'templateName')
				.addSelect('COUNT(communication.id)', 'usageCount')
				.where('communication.retreatId = :retreatId', { retreatId })
				.andWhere('communication.templateName IS NOT NULL')
				.groupBy('communication.templateName')
				.orderBy('usageCount', 'DESC')
				.limit(5)
				.getRawMany();

			// Get communications by date (last 30 days)
			const thirtyDaysAgo = new Date();
			thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

			const recentCommunications = await this.communicationRepository
				.createQueryBuilder('communication')
				.select('DATE(communication.sentAt)', 'date')
				.addSelect('COUNT(communication.id)', 'count')
				.where('communication.retreatId = :retreatId', { retreatId })
				.andWhere('communication.sentAt >= :thirtyDaysAgo', { thirtyDaysAgo })
				.groupBy('DATE(communication.sentAt)')
				.orderBy('date', 'ASC')
				.getRawMany();

			res.json({
				totalCommunications: whatsappCount + emailCount,
				whatsappCount,
				emailCount,
				uniqueParticipantsCount: parseInt(uniqueParticipants.count) || 0,
				topTemplates: templateUsage,
				recentActivity: recentCommunications,
			});
		} catch (error) {
			console.error('Error fetching communication stats:', error);
			res.status(500).json({
				error: 'Error al obtener estadísticas de comunicación',
			});
		}
	};

	// Delete a communication record
	deleteCommunication = async (req: Request, res: Response) => {
		try {
			const { id } = req.params;

			const communication = await this.communicationRepository.findOne({
				where: { id },
			});

			if (!communication) {
				return res.status(404).json({
					error: 'Comunicación no encontrada',
				});
			}

			// Authorization: caller must have access to the retreat the
			// communication belongs to.
			if (
				!communication.retreatId ||
				!(await callerHasRetreatAccess(req, communication.retreatId))
			) {
				return res.status(403).json({ error: 'Forbidden' });
			}

			await this.communicationRepository.remove(communication);

			res.json({
				message: 'Comunicación eliminada exitosamente',
			});
		} catch (error) {
			console.error('Error deleting communication:', error);
			res.status(500).json({
				error: 'Error al eliminar la comunicación',
			});
		}
	};

	// Send email via backend SMTP
	sendEmailViaBackend = async (req: Request, res: Response) => {
		try {
			const { to, subject, html, text, participantId, retreatId, communityId, templateId, templateName } =
				req.body;

			// Validate required fields
			if (!to || !subject || !html || !participantId || !retreatId) {
				return res.status(400).json({
					error: 'Datos inválidos',
					details: 'Faltan campos requeridos: to, subject, html, participantId, retreatId',
				});
			}

			// Critical: caller must own the retreat before we use the SMTP
			// server in their name. Without this check, any user with
			// `participant:update` (a global permission) could send mail
			// from Emaus to any address.
			if (!(await callerHasRetreatAccess(req, retreatId))) {
				return res.status(403).json({ error: 'Forbidden' });
			}

			// Verify participant exists
			const participant = await this.participantRepository.findOne({
				where: { id: participantId },
			});

			if (!participant) {
				return res.status(404).json({
					error: 'Participante no encontrado',
				});
			}

			// Defense in depth: participant must belong to the retreat.
			const participantRetreatId = (participant as any).retreatId;
			if (participantRetreatId && participantRetreatId !== retreatId) {
				return res.status(400).json({
					error: 'El participante no pertenece al retiro indicado',
				});
			}

			// Send email via SMTP
			const emailSent = await this.emailService.sendEmail({
				to,
				subject,
				html,
				text,
			});

			if (!emailSent) {
				return res.status(500).json({
					error: 'Error al enviar el correo electrónico',
				});
			}

			// Create communication record
			const communication = this.communicationRepository.create({
				participantId,
				scope: communityId ? 'community' : 'retreat',
				retreatId,
				communityId,
				messageType: 'email',
				recipientContact: to,
				messageContent: html,
				templateId,
				templateName,
				subject,
				sentBy: (req.user as any)?.id,
			} as DeepPartial<ParticipantCommunication>);

			const savedCommunication = await this.communicationRepository.save(communication);

			// Fetch the complete record with relations
			const completeCommunication = await this.communicationRepository.findOne({
				where: { id: (savedCommunication as any).id },
				relations: ['participant', 'retreat', 'template', 'sender'],
			});

			res.status(200).json({
				success: true,
				message: 'Correo electrónico enviado exitosamente',
				communication: completeCommunication,
			});
		} catch (error) {
			console.error('Error sending email via backend:', error);
			res.status(500).json({
				error: 'Error al enviar el correo electrónico',
				details: error instanceof Error ? error.message : 'Error desconocido',
			});
		}
	};

	// Check SMTP configuration status
	checkSmtpConfig = async (req: Request, res: Response) => {
		try {
			const configStatus = this.emailService.getSmtpConfigStatus();
			res.json(configStatus);
		} catch (error) {
			console.error('Error checking SMTP config:', error);
			res.status(500).json({
				error: 'Error al verificar la configuración SMTP',
			});
		}
	};

	// Send test email
	sendTestEmail = async (req: Request, res: Response) => {
		try {
			const { to } = req.body;

			if (!to) {
				return res.status(400).json({
					error: 'Datos inválidos',
					details: 'Se requiere el campo "to" para enviar el correo de prueba',
				});
			}

			const emailSent = await this.emailService.sendTestEmail(to);

			if (emailSent) {
				res.json({
					success: true,
					message: 'Correo de prueba enviado exitosamente',
				});
			} else {
				res.status(500).json({
					error: 'Error al enviar el correo de prueba',
				});
			}
		} catch (error) {
			console.error('Error sending test email:', error);
			res.status(500).json({
				error: 'Error al enviar el correo de prueba',
				details: error instanceof Error ? error.message : 'Error desconocido',
			});
		}
	};

	// Verify SMTP connection
	verifySmtpConnection = async (req: Request, res: Response) => {
		try {
			const verification = await this.emailService.verifyConnection();
			res.json(verification);
		} catch (error) {
			console.error('Error verifying SMTP connection:', error);
			res.status(500).json({
				success: false,
				message: 'Error al verificar la conexión SMTP',
			});
		}
	};
}
