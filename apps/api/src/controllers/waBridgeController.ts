import type { Request, Response } from 'express';
import { AppDataSource } from '../data-source';
import { config } from '../config';
import { Participant } from '../entities/participant.entity';
import { Retreat } from '../entities/retreat.entity';
import { RetreatParticipant } from '../entities/retreatParticipant.entity';
import { User } from '../entities/user.entity';
import { WhatsappBridgeLink } from '../entities/whatsappBridgeLink.entity';
import { WhatsappInboxMessage } from '../entities/whatsappInboxMessage.entity';
import { WhatsappInboxReadState } from '../entities/whatsappInboxReadState.entity';
import { authorizationService, ensureRetreatAccess } from '../middleware/authorization';
import { waBridgeService, acceptedJidDigitVariants } from '../services/waBridge';
import { WacliError } from '../services/waBridge';
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
	not_enabled: 422,
	disabled: 503,
};

const REFUSAL_MESSAGE: Record<string, string> = {
	already_linked:
		'Ya tienes tu WhatsApp vinculado a este retiro. Desvincúlalo primero si quieres volver a vincular.',
	cap_reached:
		'Ya hay el máximo de sesiones vinculadas. Pide a otro compañero que se desvincule o contacta al administrador.',
	outside_window:
		'La vinculación solo está disponible durante la ventana del retiro (una semana antes del inicio y hasta el último día).',
	not_enabled:
		'El superadmin no ha activado la bandeja de WhatsApp para este retiro.',
	disabled: 'La bandeja de WhatsApp está desactivada por el administrador.',
};

function toLinkDto(
	link: WhatsappBridgeLink & { ownerName?: string | null },
	includePhone: boolean,
) {
	return {
		id: link.id,
		retreatId: link.retreatId,
		userId: link.userId,
		ownerName: link.ownerName ?? null,
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
		// Estado de activación del retiro (D13): el switch del superadmin se
		// pinta con este dato.
		const retreat = await AppDataSource.getRepository(Retreat).findOneBy({
			id: req.params.retreatId,
		});
		return res.json({
			links: links.map((link) =>
				toLinkDto(link as WhatsappBridgeLink, superadmin || link.userId === userId),
			),
			enabled: retreat?.whatsappInboxEnabled ?? false,
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

		const registrations = await AppDataSource.getRepository(RetreatParticipant).find({
			where: { retreatId, type: 'walker', isCancelled: false },
			select: ['participantId'],
		});
		const participantIds = registrations
			.map((reg) => reg.participantId)
			.filter((id): id is string => Boolean(id));
		const walkers = participantIds.length
			? await AppDataSource.getRepository(Participant).find({
					where: participantIds.map((id) => ({ id })),
				})
			: [];
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

	/**
	 * PATCH /retreat/:retreatId/enabled — activación por retiro (D13, v1.1).
	 * SOLO superadmin: el puente consume RAM por cada cuenta vinculada; decidir
	 * en qué retiro se enciende no es un permiso de plantilla.
	 */
	setEnabled = async (req: Request, res: Response): Promise<Response> => {
		const user = currentUser(req);
		if (!(await authorizationService.hasRole(user.id, 'superadmin'))) {
			return res.status(403).json({
				message: 'Solo el superadmin puede activar o desactivar la bandeja de un retiro.',
			});
		}
		const enabled = req.body?.enabled;
		if (typeof enabled !== 'boolean') {
			return res.status(400).json({ message: 'enabled debe ser boolean' });
		}
		await waBridgeService.setEnabled(req.params.retreatId, enabled, user);
		return res.json({ ok: true, enabled });
	};

	/**
	 * POST /retreat/:retreatId/terminate-all — termina TODOS los servidores del
	 * puente del retiro (D14, superadmin): stop + logout + wipe + purga de
	 * vínculos; opcionalmente desactiva el retiro (default true).
	 */
	terminateAll = async (req: Request, res: Response): Promise<Response> => {
		const user = currentUser(req);
		if (!(await authorizationService.hasRole(user.id, 'superadmin'))) {
			return res.status(403).json({
				message: 'Solo el superadmin puede terminar los servidores del puente.',
			});
		}
		const disable = req.body?.disable !== false;
		const result = await waBridgeService.terminateAll(req.params.retreatId, user, { disable });
		return res.json({ ok: true, terminated: result.terminated, disabled: disable });
	};

	/**
	 * POST /messages/:messageId/receipt — comprobante de pago desde WhatsApp
	 * (FR14/D15, v1.1): descarga ON-DEMAND la imagen del mensaje (tope 10 MB,
	 * procesada a WebP por el imageService) y la devuelve como data-URL junto
	 * al participante matcheado, lista para `receiptPhoto` del modal de pagos.
	 *
	 * Doble puerta: whatsappInbox:read (ruta) + payment:create (aquí) — la
	 * imagen sale de la bandeja con destino de comprobante. No se persiste
	 * nada en esta llamada: la persistencia es la del propio pago.
	 */
	/**
	 * GET /retreat/:retreatId/unread — total de no leídos DEL usuario (badge del
	 * sidebar, v1.1). Endpoint liviano: cuenta con los read-states del caller.
	 */
	unreadCount = async (req: Request, res: Response): Promise<Response> => {
		const total = await waBridgeService.countUnreadForUser(
			req.params.retreatId,
			currentUser(req).id,
		);
		return res.json({ total });
	};

	/**
	 * POST /retreat/:retreatId/seen-all — marca TODOS los chats como leídos
	 * para el usuario (v1.1): upsert de read-state al último mensaje de cada
	 * chat. Es estado de UI por usuario, no audita.
	 */
	seenAll = async (req: Request, res: Response): Promise<Response> => {
		const retreatId = req.params.retreatId;
		const userId = currentUser(req).id;
		const messages = await AppDataSource.getRepository(WhatsappInboxMessage).find({
			where: { retreatId },
			select: ['chatJid', 'timestamp'],
		});
		const newestByChat = new Map<string, Date>();
		for (const message of messages) {
			const current = newestByChat.get(message.chatJid);
			if (!current || message.timestamp > current) newestByChat.set(message.chatJid, message.timestamp);
		}

		const stateRepo = AppDataSource.getRepository(WhatsappInboxReadState);
		const states = await stateRepo.find({ where: { retreatId, userId } });
		const stateByChat = new Map(states.map((s) => [s.chatJid, s]));

		let marked = 0;
		for (const [chatJid, newest] of newestByChat) {
			const existing = stateByChat.get(chatJid);
			if (existing) {
				if (newest > existing.lastSeenMessageTimestamp) {
					existing.lastSeenMessageTimestamp = newest;
					await stateRepo.save(existing);
					marked += 1;
				}
				continue;
			}
			await stateRepo.save(
				stateRepo.create({ userId, retreatId, chatJid, lastSeenMessageTimestamp: newest }),
			);
			marked += 1;
		}
		return res.json({ ok: true, marked });
	};

	/**
	 * GET /retreat/:retreatId/search?q= — búsqueda de texto sobre los cuerpos
	 * persistidos (v1.1). Límite 30, más recientes primero.
	 */
	search = async (req: Request, res: Response): Promise<Response> => {
		const q = String(req.query.q ?? '').trim();
		if (q.length < 2) {
			return res.json({ results: [] });
		}
		const results = await waBridgeService.searchMessages(req.params.retreatId, q.slice(0, 100));
		// Nombre del caminante en cada resultado (la búsqueda también matchea
		// por nombre — v1.1).
		const digitsMap = await waBridgeService.getWalkerDigitsMap(req.params.retreatId);
		return res.json({
			results: results.map((row) => {
				const participant = digitsMap.get(row.chatPhone);
				return {
					...row,
					participantFirstName: participant?.firstName ?? '',
					participantLastName: participant?.lastName ?? '',
				};
			}),
		});
	};

	receiptDataUrl = async (req: Request, res: Response): Promise<Response> => {
		const user = currentUser(req);
		const canCreatePayment = await authorizationService.hasPermission(
			user.id,
			'payment:create',
		);
		if (!canCreatePayment) {
			return res.status(403).json({
				message: 'Registrar comprobantes requiere el permiso de crear pagos.',
			});
		}

		const message = await AppDataSource.getRepository(WhatsappInboxMessage).findOneBy({
			id: req.params.messageId,
		});
		if (!message) {
			return res.status(404).json({ message: 'Mensaje no encontrado' });
		}
		if (!(await ensureRetreatAccess(req, res, message.retreatId))) return res;
		if (message.messageType !== 'image') {
			return res.status(400).json({ message: 'Este mensaje no tiene imagen adjunta.' });
		}

		const digitsMap = await waBridgeService.getWalkerDigitsMap(message.retreatId);
		const participant = digitsMap.get(message.chatPhone);

		try {
			const receiptPhoto = await waBridgeService.downloadReceiptDataUrl(message);
			return res.json({
				receiptPhoto,
				participantId: participant?.id ?? null,
				participantFirstName: participant?.firstName ?? '',
				participantLastName: participant?.lastName ?? '',
				country: participant?.country ?? null,
			});
		} catch (err) {
			const status = err instanceof WacliError ? 502 : 500;
			return res
				.status(status)
				.json({ message: `No se pudo descargar la imagen: ${(err as Error).message}` });
		}
	};
}
