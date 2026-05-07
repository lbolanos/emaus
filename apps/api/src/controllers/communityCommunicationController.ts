import { Request, Response } from 'express';
import { AppDataSource } from '../data-source';
import { ParticipantCommunication, MessageType } from '../entities/participantCommunication.entity';
import { MessageTemplate } from '../entities/messageTemplate.entity';
import { CommunityMember } from '../entities/communityMember.entity';
import { CommunityAdmin } from '../entities/communityAdmin.entity';
import { DeepPartial } from 'typeorm';
import { EmailService } from '../services/emailService';
import { authorizationService } from '../middleware/authorization';

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

// Returns true when the caller is a superadmin OR an active admin of
// `communityId`. Use to gate every endpoint in this controller — without
// this check, any authenticated user could read, create or send messages
// scoped to any community, since the only middleware on these routes is
// `isAuthenticated`.
async function callerHasCommunityAccess(req: Request, communityId: string): Promise<boolean> {
	const userId = (req.user as any)?.id;
	if (!userId || !communityId) {
		return false;
	}
	if (await authorizationService.hasRole(userId, 'superadmin')) {
		return true;
	}
	const adminRecord = await AppDataSource.getRepository(CommunityAdmin).findOne({
		where: { communityId, userId, status: 'active' },
	});
	return !!adminRecord;
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

			// Authorize against the member's community — fall back to the query
			// param when present (it must match the member's community).
			const memberCommunityId = (communityMember as any).communityId;
			if (communityId && communityId !== memberCommunityId) {
				return res.status(400).json({
					error: 'communityId no corresponde al miembro',
				});
			}
			if (!(await callerHasCommunityAccess(req, memberCommunityId))) {
				return res.status(403).json({ error: 'Forbidden' });
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

			// Caller must be admin of the target community.
			if (!(await callerHasCommunityAccess(req, dto.communityId))) {
				return res.status(403).json({ error: 'Forbidden' });
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

			// Member must belong to the community in the DTO (defense in depth).
			if ((communityMember as any).communityId !== dto.communityId) {
				return res.status(400).json({
					error: 'El miembro no pertenece a la comunidad indicada',
				});
			}

			// Normalize templateId/templateName: an empty string from the
			// frontend would violate the FK on the raw INSERT below, so coerce
			// any falsy value to null (= "direct message, no template").
			const templateId = dto.templateId ? dto.templateId : null;
			let templateName = dto.templateName ? dto.templateName : null;

			if (templateId) {
				const template = await this.templateRepository.findOne({
					where: { id: templateId },
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
					templateId,
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

			// Only an admin of the communication's community (or a superadmin)
			// may delete it.
			if (
				communication.scope !== 'community' ||
				!communication.communityId ||
				!(await callerHasCommunityAccess(req, communication.communityId))
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

			// Critical: verify caller is admin of the community before using
			// the SMTP server to send mail. Without this, any authenticated
			// user could send emails as Emaus to arbitrary recipients.
			if (!(await callerHasCommunityAccess(req, communityId))) {
				return res.status(403).json({ error: 'Forbidden' });
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

			// Member must belong to the community claimed in the body.
			if ((communityMember as any).communityId !== communityId) {
				return res.status(400).json({
					error: 'El miembro no pertenece a la comunidad indicada',
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
