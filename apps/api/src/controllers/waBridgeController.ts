import type { Request, Response } from 'express';
import { AppDataSource } from '../data-source';
import { config } from '../config';
import { Participant } from '../entities/participant.entity';
import { User } from '../entities/user.entity';
import { WhatsappBridgeLink } from '../entities/whatsappBridgeLink.entity';
import { WhatsappInboxMessage } from '../entities/whatsappInboxMessage.entity';
import { WhatsappInboxReadState } from '../entities/whatsappInboxReadState.entity';
import { authorizationService } from '../middleware/authorization';
import { waBridgeService, acceptedJidDigitVariants } from '../services/waBridge';
import { toNationalPhone } from '@repo/types';

/** El passport monta la entidad User en req.user, pero Express la tipa genérica. */
function currentUser(req: Request): User {
	return req.user as unknown as User;
}

/**
 * Endpoints del puente WhatsApp de solo lectura (specs/whatsapp-inbox §2).
 *
 * Reglas de autorización:
 *  - Todas las rutas: isAuthenticated (en el router) + permiso específico
 *    (whatsappInbox:read|manage) + acceso al retiro (requireRetreatAccess).
 *  - QR y linkedPhone: SOLO el dueño del vínculo (o superadmin) — S5/S12.
 *  - Ningún endpoint devuelve el linkedPhone de un tercer staff.
 */

const ONE_TO_ONE_JID = /^\d+@s\.whatsapp\.net$/;

const REFUSAL_HTTP: Record<string, number> = {
	already_linked: 409,
	cap_reached: 409,
	outside_window: 422,
	disabled: 503,
};

const REFUSAL_MESSAGE: Record<string, string> = {
	already_linked:
		'Ya tienes tu WhatsApp vinculado a este retiro. Desvincúlalo primero si quieres volver a vincular.',
	cap_reached:
		'Ya hay el máximo de sesiones vinculadas. Pide a otro compañero que se desvincule o contacta al administrador.',
	outside_window:
		'La vinculación solo está disponible durante la ventana del retiro (una semana antes del inicio y hasta el último día).',
	disabled: 'La bandeja de WhatsApp está desactivada por el administrador.',
};

function toLinkDto(link: WhatsappBridgeLink, includePhone: boolean) {
	return {
		id: link.id,
		retreatId: link.retreatId,
		userId: link.userId,
		status: link.status,
		linkedPhone: includePhone ? (link.linkedPhone ?? null) : null,
		connectedAt: link.connectedAt,
		lastSyncAt: link.lastSyncAt,
		lastError: link.lastError,
		createdAt: link.createdAt,
	};
}

export class WaBridgeController {
	private async isOwnerOrSuperadmin(userId: string, link: WhatsappBridgeLink): Promise<boolean> {
		return link.userId === userId || authorizationService.hasRole(userId, 'superadmin');
	}

	/** POST /retreat/:retreatId/link — inicia la vinculación (requiere consentimiento). */
	startLink = async (req: Request, res: Response): Promise<Response> => {
		const user = currentUser(req);
		if (req.body?.consentAccepted !== true) {
			return res.status(400).json({
				message:
					'Requiere consentAccepted=true: el staff debe aceptar el aviso de privacidad y riesgo de baneo antes de vincular.',
			});
		}
		if (!config.waBridge.enabled) {
			return res.status(503).json({ reason: 'disabled', message: REFUSAL_MESSAGE.disabled });
		}
		const result = await waBridgeService.startLink(req.params.retreatId, user);
		if (!result.ok) {
			return res.status(REFUSAL_HTTP[result.reason]).json({
				reason: result.reason,
				message: REFUSAL_MESSAGE[result.reason],
			});
		}
		// El que vincula es el dueño: el DTO lleva su teléfono.
		return res.status(201).json({ link: toLinkDto(result.link, true) });
	}

	/** GET /retreat/:retreatId/links — tablero de vínculos del retiro. */
	listLinks = async (req: Request, res: Response): Promise<Response> => {
		const userId = currentUser(req).id;
		const superadmin = await authorizationService.hasRole(userId, 'superadmin');
		const links = await waBridgeService.listLinksForRetreat(req.params.retreatId);
		return res.json({
			links: links.map((link) =>
				toLinkDto(link as WhatsappBridgeLink, superadmin || link.userId === userId),
			),
		});
	}

	/** GET /link/:linkId/status — estado + QR (solo dueño o superadmin). */
	linkStatus = async (req: Request, res: Response): Promise<Response> => {
		const userId = currentUser(req).id;
		const link = await waBridgeService.getLinkById(req.params.linkId);
		if (!link) {
			return res.status(404).json({ message: 'Vínculo no encontrado' });
		}
		if (!(await this.isOwnerOrSuperadmin(userId, link))) {
			return res.status(403).json({ message: 'Solo el dueño del vínculo puede ver su QR' });
		}
		return res.json({
			status: link.status,
			qr: waBridgeService.getQr(link.id),
			linkedPhone: link.linkedPhone ?? null,
			linkedJid: link.linkedJid ?? null,
			lastError: link.lastError,
			lastSyncAt: link.lastSyncAt,
		});
	}

	/** DELETE /link/:linkId — desvinculación total (dueño o superadmin). */
	unlink = async (req: Request, res: Response): Promise<Response> => {
		const link = await waBridgeService.getLinkById(req.params.linkId);
		if (!link) {
			return res.status(404).json({ message: 'Vínculo no encontrado' });
		}
		if (!(await this.isOwnerOrSuperadmin(currentUser(req).id, link))) {
			return res.status(403).json({ message: 'Solo el dueño (o un superadmin) puede desvincular' });
		}
		await waBridgeService.unlink(currentUser(req), link);
		return res.json({ ok: true });
	}

	/**
	 * GET /retreat/:retreatId/conversations — bandeja consolidada (FR3): un
	 * renglón por chat de caminante con último mensaje, conteos y el
	 * participante matcheado (para ficha y deep link de respuesta).
	 */
	conversations = async (req: Request, res: Response): Promise<Response> => {
		const retreatId = req.params.retreatId;
		const userId = currentUser(req).id;
		const messages = await AppDataSource.getRepository(WhatsappInboxMessage).find({
			where: { retreatId },
			order: { timestamp: 'DESC' },
		});

		const walkers = await AppDataSource.getRepository(Participant).find({
			where: { retreatId, type: 'walker', isCancelled: false },
		});
		const digitsToParticipant = new Map<string, Participant>();
		for (const walker of walkers) {
			if (!walker.cellPhone || !walker.country) continue;
			const national = toNationalPhone(walker.cellPhone, walker.country);
			if (!national) continue;
			for (const digits of acceptedJidDigitVariants(national, walker.country)) {
				if (!digitsToParticipant.has(digits)) digitsToParticipant.set(digits, walker);
			}
		}

		const readStates = await AppDataSource.getRepository(WhatsappInboxReadState).find({
			where: { retreatId, userId },
		});
		const lastSeenByChat = new Map(
			readStates.map((state) => [state.chatJid, state.lastSeenMessageTimestamp]),
		);

		const byChat = new Map<
			string,
			{
				chatJid: string;
				chatPhone: string;
				lastMessageAt: Date;
				lastMessagePreview: string | null;
				messageCount: number;
				unreadCount: number;
			}
		>();
		for (const message of messages) {
			let entry = byChat.get(message.chatJid);
			if (entry === undefined) {
				const fresh = {
					chatJid: message.chatJid,
					chatPhone: message.chatPhone,
					lastMessageAt: message.timestamp,
					lastMessagePreview: message.body ?? null,
					messageCount: 0,
					unreadCount: 0,
				};
				byChat.set(message.chatJid, fresh);
				entry = fresh;
			}
			entry.messageCount += 1;
			const seen = lastSeenByChat.get(message.chatJid);
			if (!seen || message.timestamp > seen) entry.unreadCount += 1;
		}

		const conversations = Array.from(byChat.values())
			.map((entry) => {
				const participant = digitsToParticipant.get(entry.chatPhone);
				return {
					...entry,
					participantId: participant?.id ?? null,
					participantFirstName: participant?.firstName ?? '',
					participantLastName: participant?.lastName ?? '',
					country: participant?.country ?? null,
				};
			})
			.sort((a, b) => b.lastMessageAt.getTime() - a.lastMessageAt.getTime());
		return res.json({ conversations });
	}

	/** GET /retreat/:retreatId/messages?chatJid&before&limit — hilo paginado. */
	messages = async (req: Request, res: Response): Promise<Response> => {
		const retreatId = req.params.retreatId;
		const chatJid = String(req.query.chatJid ?? '');
		if (!ONE_TO_ONE_JID.test(chatJid)) {
			return res.status(400).json({ message: 'chatJid debe ser un JID 1:1 válido' });
		}
		const limitRaw = parseInt(String(req.query.limit ?? '50'), 10);
		const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 200) : 50;

		// Validar TODO antes de construir el query builder (que exige metadata
		// del DataSource): los 400 salen sin tocar DB.
		let before: Date | null = null;
		const beforeRaw = req.query.before;
		if (beforeRaw) {
			before = new Date(String(beforeRaw));
			if (Number.isNaN(before.getTime())) {
				return res.status(400).json({ message: 'before debe ser una fecha ISO válida' });
			}
		}

		const qb = AppDataSource.getRepository(WhatsappInboxMessage)
			.createQueryBuilder('m')
			.where('m.retreatId = :retreatId AND m.chatJid = :chatJid', { retreatId, chatJid })
			.orderBy('m.timestamp', 'DESC')
			.take(limit);
		if (before) {
			qb.andWhere('m.timestamp < :before', { before });
		}

		const rows = await qb.getMany();
		return res.json({
			messages: rows.map((row) => ({
				id: row.id,
				chatJid: row.chatJid,
				timestamp: row.timestamp,
				body: row.body,
				messageType: row.messageType,
			})),
		});
	}

	/** POST /retreat/:retreatId/seen — marca leído hasta el último mensaje (D11). */
	markSeen = async (req: Request, res: Response): Promise<Response> => {
		const retreatId = req.params.retreatId;
		const userId = currentUser(req).id;
		const chatJid = String(req.body?.chatJid ?? '');
		if (!ONE_TO_ONE_JID.test(chatJid)) {
			return res.status(400).json({ message: 'chatJid debe ser un JID 1:1 válido' });
		}

		// El timestamp lo decide el servidor (el cliente no manda horas).
		const newest = await AppDataSource.getRepository(WhatsappInboxMessage).findOne({
			where: { retreatId, chatJid },
			order: { timestamp: 'DESC' },
		});
		if (!newest) return res.json({ ok: true, lastSeen: null });

		const stateRepo = AppDataSource.getRepository(WhatsappInboxReadState);
		const existing = await stateRepo.findOneBy({ userId, retreatId, chatJid });
		if (existing) {
			if (newest.timestamp > existing.lastSeenMessageTimestamp) {
				existing.lastSeenMessageTimestamp = newest.timestamp;
				await stateRepo.save(existing);
			}
			return res.json({ ok: true, lastSeen: existing.lastSeenMessageTimestamp });
		}
		const created = stateRepo.create({
			userId,
			retreatId,
			chatJid,
			lastSeenMessageTimestamp: newest.timestamp,
		});
		await stateRepo.save(created);
		return res.json({ ok: true, lastSeen: created.lastSeenMessageTimestamp });
	}
}
