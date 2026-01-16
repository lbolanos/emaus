import { Request, Response } from 'express';
import { AppDataSource } from '../data-source';
import { ParticipantCommunication, MessageType } from '../entities/participantCommunication.entity';
import { MessageTemplate } from '../entities/messageTemplate.entity';
import { CommunityMember } from '../entities/communityMember.entity';
import { DeepPartial } from 'typeorm';
import { EmailService } from '../services/emailService';

interface CreateCommunicationDTO {
	communityMemberId: string;
	communityId: string;
	messageType: 'whatsapp' | 'email';
	recipientContact: string;
	messageContent: string;
	templateId?: string;
	templateName?: string;
	subject?: string;
}

export class CommunityCommunicationController {
	private communicationRepository = AppDataSource.getRepository(ParticipantCommunication);
	private templateRepository = AppDataSource.getRepository(MessageTemplate);
	private communityMemberRepository = AppDataSource.getRepository(CommunityMember);
	private emailService = new EmailService();

	// Get all communications for a community member
	getMemberCommunications = async (req: Request, res: Response) => {
		try {
			const { memberId } = req.params;
			const { communityId, limit = 50, offset = 0 } = req.query;

			// First find the community member to get the participant ID
			const communityMember = await this.communityMemberRepository.findOne({
				where: { id: memberId },
				relations: ['participant'],
			});

			if (!communityMember) {
				return res.status(404).json({
					error: 'Miembro de comunidad no encontrado',
				});
			}

			const where: any = {
				scope: 'community',
				participantId: communityMember.participantId,
			};

			if (communityId) {
				where.communityId = communityId;
			}

			const [communications, total] = await this.communicationRepository.findAndCount({
				where,
				relations: ['participant', 'community', 'template', 'sender'],
				order: {
					sentAt: 'DESC',
				},
				take: Number(limit),
				skip: Number(offset),
			});

			// Map to include communityMember info
			const mappedCommunications = communications.map((comm) => ({
				...comm,
				communityMemberId: memberId,
			}));

			res.json({
				communications: mappedCommunications,
				total,
				limit: Number(limit),
				offset: Number(offset),
			});
		} catch (error) {
			console.error('Error fetching community member communications:', error);
			res.status(500).json({
				error: 'Error al obtener las comunicaciones del miembro',
			});
		}
	};

	// Get all communications for a community
	getCommunityCommunications = async (req: Request, res: Response) => {
		try {
			const { communityId } = req.params;
			const { memberId, messageType, limit = 50, offset = 0 } = req.query;

			const where: any = {
				scope: 'community',
				communityId,
			};

			if (memberId) {
				where.participantId = memberId;
			}
			if (messageType) {
				where.messageType = messageType;
			}

			const [communications, total] = await this.communicationRepository.findAndCount({
				where,
				relations: ['participant', 'community', 'template', 'sender'],
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
			console.error('Error fetching community communications:', error);
			res.status(500).json({
				error: 'Error al obtener las comunicaciones de la comunidad',
			});
		}
	};

	// Create a new communication record
	createCommunication = async (req: Request, res: Response) => {
		try {
			const dto = { ...req.body } as CreateCommunicationDTO;

			// Basic validation
			if (
				!dto.communityMemberId ||
				!dto.communityId ||
				!dto.messageType ||
				!dto.recipientContact ||
				!dto.messageContent
			) {
				return res.status(400).json({
					error: 'Datos inválidos',
					details: 'Faltan campos requeridos',
				});
			}

			// Verify community member exists and get participant info
			const communityMember = await this.communityMemberRepository.findOne({
				where: { id: dto.communityMemberId },
				relations: ['participant'],
			});

			if (!communityMember) {
				return res.status(404).json({
					error: 'Miembro de comunidad no encontrado',
				});
			}

			// If templateId is provided, verify it exists and get template name
			let templateName = dto.templateName;
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

			// Create communication record using raw query to avoid TypeORM relation issues
			const dataSource = AppDataSource;
			const userId = (req.user as any)?.id;
			const newId = require('crypto').randomUUID();

			await dataSource.query(
				`
				INSERT INTO participant_communications (id, participantId, scope, communityId, messageType, recipientContact, messageContent, templateId, templateName, subject, sentBy, sentAt)
				VALUES (?, ?, 'community', ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
			`,
				[
					newId,
					communityMember.participantId,
					dto.communityId,
					dto.messageType,
					dto.recipientContact,
					dto.messageContent,
					dto.templateId,
					templateName,
					dto.subject,
					userId,
				],
			);

			// Fetch the complete record with relations (excluding sender to avoid user table issue)
			const completeCommunication = await this.communicationRepository.findOne({
				where: { id: newId },
				relations: ['participant', 'community', 'template'],
			});

			// Map to include communityMemberId
			const response = {
				...(completeCommunication as object),
				communityMemberId: dto.communityMemberId,
			};

			res.status(201).json(response);
		} catch (error) {
			console.error('Error creating communication:', error);
			res.status(500).json({
				error: 'Error al crear el registro de comunicación',
			});
		}
	};

	// Get communication statistics for a community
	getCommunityCommunicationStats = async (req: Request, res: Response) => {
		try {
			const { communityId } = req.params;

			// Get counts by message type
			const whatsappCount = await this.communicationRepository.count({
				where: { scope: 'community', communityId, messageType: 'whatsapp' },
			});

			const emailCount = await this.communicationRepository.count({
				where: { scope: 'community', communityId, messageType: 'email' },
			});

			// Get unique participants communicated with
			const uniqueParticipants = await this.communicationRepository
				.createQueryBuilder('communication')
				.select('COUNT(DISTINCT communication.participantId)', 'count')
				.where('communication.scope = :scope', { scope: 'community' })
				.andWhere('communication.communityId = :communityId', { communityId })
				.getRawOne();

			// Get most used templates
			const templateUsage = await this.communicationRepository
				.createQueryBuilder('communication')
				.select('communication.templateName', 'templateName')
				.addSelect('COUNT(communication.id)', 'usageCount')
				.where('communication.scope = :scope', { scope: 'community' })
				.andWhere('communication.communityId = :communityId', { communityId })
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
				.where('communication.scope = :scope', { scope: 'community' })
				.andWhere('communication.communityId = :communityId', { communityId })
				.andWhere('communication.sentAt >= :thirtyDaysAgo', { thirtyDaysAgo })
				.groupBy('DATE(communication.sentAt)')
				.orderBy('date', 'ASC')
				.getRawMany();

			res.json({
				totalCommunications: whatsappCount + emailCount,
				whatsappCount,
				emailCount,
				uniqueMembersCount: parseInt(uniqueParticipants.count) || 0,
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

	// Send email via backend SMTP (reuses the same email service)
	sendEmailViaBackend = async (req: Request, res: Response) => {
		try {
			const { to, subject, html, text, communityMemberId, communityId, templateId, templateName } =
				req.body;

			// Validate required fields
			if (!to || !subject || !html || !communityMemberId || !communityId) {
				return res.status(400).json({
					error: 'Datos inválidos',
					details: 'Faltan campos requeridos: to, subject, html, communityMemberId, communityId',
				});
			}

			// Verify community member exists
			const communityMember = await this.communityMemberRepository.findOne({
				where: { id: communityMemberId },
				relations: ['participant'],
			});

			if (!communityMember) {
				return res.status(404).json({
					error: 'Miembro de comunidad no encontrado',
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
				scope: 'community',
				participantId: communityMember.participantId,
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
				relations: ['participant', 'community', 'template', 'sender'],
			});

			// Map to include communityMemberId
			const response = {
				...(completeCommunication as object),
				communityMemberId,
			};

			res.status(200).json({
				success: true,
				message: 'Correo electrónico enviado exitosamente',
				communication: response,
			});
		} catch (error) {
			console.error('Error sending email via backend:', error);
			res.status(500).json({
				error: 'Error al enviar el correo electrónico',
				details: error instanceof Error ? error.message : 'Error desconocido',
			});
		}
	};
}
