import type { Request, Response } from 'express';
import { AppDataSource } from '../data-source';
import { config } from '../config';
import { Retreat } from '../entities/retreat.entity';
import { User } from '../entities/user.entity';
import { WhatsappBridgeLink } from '../entities/whatsappBridgeLink.entity';
import { WhatsappInboxMessage } from '../entities/whatsappInboxMessage.entity';
import { WhatsappInboxReadState } from '../entities/whatsappInboxReadState.entity';
import { authorizationService, ensureRetreatAccess } from '../middleware/authorization';
import {
	waBridgeService,
	acceptedJidDigitVariants,
	primaryParticipantOf,
	senderDisplayName,
	senderKindOf,
	WaMediaRejectedError,
	type WaSenderMatch,
} from '../services/waBridge';
import { WacliError } from '../services/waBridge';
import { Payment } from '../entities/payment.entity';
import { RetreatParticipant } from '../entities/retreatParticipant.entity';
import { emitInboxChanged } from '../realtime';
import { createLetterFromWhatsapp, WaLetterError } from '../services/waBridge/waLetterService';

/** Passport mounts the User entity on req.user, but Express types it generically. */
function currentUser(req: Request): User {
	return req.user as unknown as User;
}

/**
 * Endpoints of the read-only WhatsApp bridge (specs/whatsapp-inbox §2).
 *
 * Authorization rules:
 *  - Every route: isAuthenticated (in the router) + a specific permission
 *    (whatsappInbox:read|manage) + retreat access (requireRetreatAccess, or
 *    ensureRetreatAccess inside for routes keyed by message/link id).
 *  - QR and linkedPhone: ONLY the link owner (or superadmin) — S5/S12.
 *  - No endpoint returns another staff member's linkedPhone.
 *  - Emergency-contact chats (v1.4, D22) also need participant:health: who
 *    the contact is belongs to SENSITIVE_HEALTH_FIELDS. Without it those
 *    chats do not exist for the caller (list, badge, search) and every
 *    message endpoint answers 403.
 */

const ONE_TO_ONE_JID = /^\d+@s\.whatsapp\.net$/;
/** Message types the on-demand raw download serves (images go through /media). */
const RAW_MEDIA_TYPES = new Set(['audio', 'video', 'document']);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

/** Emergency-contact chats carry SENSITIVE_HEALTH_FIELDS data (v1.4, D22). */
function canSeeEmergencyContacts(userId: string): Promise<boolean> {
	return authorizationService.hasPermission(userId, 'participant:health');
}

/** JID digits of a 1:1 chat ("5215511406977@s.whatsapp.net" → "5215511406977"). */
function chatPhoneOf(chatJid: string): string {
	return chatJid.split('@')[0];
}

export class WaBridgeController {
	private async isOwnerOrSuperadmin(userId: string, link: WhatsappBridgeLink): Promise<boolean> {
		return link.userId === userId || authorizationService.hasRole(userId, 'superadmin');
	}

	/**
	 * Who a chat belongs to, if the caller may see it (v1.4, D22). Sends the
	 * refusal itself and returns null: 403 for an emergency-contact chat
	 * without participant:health, 404 for a chat that no longer resolves to
	 * anyone (cancelled walker, edited phone).
	 */
	private async visibleChat(
		req: Request,
		res: Response,
		retreatId: string,
		chatPhone: string,
	): Promise<WaSenderMatch | null> {
		const index = await waBridgeService.getSenderIndex(retreatId);
		const match = index.get(chatPhone);
		if (!match) {
			res.status(404).json({ message: 'Esta conversación ya no corresponde a ningún caminante del retiro.' });
			return null;
		}
		if (!waBridgeService.isChatVisible(match, await canSeeEmergencyContacts(currentUser(req).id))) {
			res.status(403).json({
				message: 'Los mensajes de contactos de emergencia requieren el permiso de ver datos de salud.',
			});
			return null;
		}
		return match;
	}

	/** POST /retreat/:retreatId/link — starts linking (requires consent). */
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
		// Whoever links is the owner: the DTO carries their phone.
		return res.status(201).json({ link: toLinkDto(result.link, true) });
	}

	/** GET /retreat/:retreatId/links — the retreat's link board. */
	listLinks = async (req: Request, res: Response): Promise<Response> => {
		const userId = currentUser(req).id;
		const superadmin = await authorizationService.hasRole(userId, 'superadmin');
		const links = await waBridgeService.listLinksForRetreat(req.params.retreatId);
		// Retreat activation state (D13): the superadmin switch is drawn from
		// this value.
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

	/** GET /link/:linkId/status — status + QR (owner or superadmin only). */
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

	/** DELETE /link/:linkId — full unlink (owner or superadmin). */
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
	 * GET /retreat/:retreatId/conversations — consolidated list for the caller:
	 * aggregated in SQL by waBridgeService.listConversations (unread for this
	 * user, last message, "answered by" and shared-phone walkers). v1.4: also
	 * emergency-contact chats, only with participant:health.
	 */
	conversations = async (req: Request, res: Response): Promise<Response> => {
		const userId = currentUser(req).id;
		const conversations = await waBridgeService.listConversations(
			req.params.retreatId,
			userId,
			await canSeeEmergencyContacts(userId),
		);
		return res.json({ conversations });
	};

	/** GET /retreat/:retreatId/messages?chatJid&before&limit — paginated thread. */
	messages = async (req: Request, res: Response): Promise<Response> => {
		const retreatId = req.params.retreatId;
		const chatJid = String(req.query.chatJid ?? '');
		if (!ONE_TO_ONE_JID.test(chatJid)) {
			return res.status(400).json({ message: 'chatJid debe ser un JID 1:1 válido' });
		}
		const limitRaw = parseInt(String(req.query.limit ?? '50'), 10);
		const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 200) : 50;

		// Validate everything before building the query builder (it needs the
		// DataSource metadata): the 400s go out without touching the DB.
		let before: Date | null = null;
		const beforeRaw = req.query.before;
		if (beforeRaw) {
			before = new Date(String(beforeRaw));
			if (Number.isNaN(before.getTime())) {
				return res.status(400).json({ message: 'before debe ser una fecha ISO válida' });
			}
		}

		if (!(await this.visibleChat(req, res, retreatId, chatPhoneOf(chatJid)))) return res;

		const qb = AppDataSource.getRepository(WhatsappInboxMessage)
			.createQueryBuilder('m')
			.where('m.retreatId = :retreatId AND m.chatJid = :chatJid', { retreatId, chatJid })
			.orderBy('m.timestamp', 'DESC')
			.take(limit);
		if (before) {
			qb.andWhere('m.timestamp < :before', { before });
		}
		const rows = await qb.getMany();

		// Names for "sent by" (staff replies) and for "payment/letter by".
		const ownerNameByLink = await waBridgeService.linkOwnerNames(
			rows.filter((row) => row.fromMe).map((row) => row.linkId),
		);
		const actorIds = Array.from(
			new Set(
				rows
					.flatMap((row) => [row.paymentRegisteredById, row.letterAddedById])
					.filter((id): id is string => Boolean(id)),
			),
		);
		const actors = actorIds.length
			? await AppDataSource.getRepository(User).find({
					where: actorIds.map((id) => ({ id })),
					select: ['id', 'displayName'],
				})
			: [];
		const actorName = new Map(actors.map((user) => [user.id, user.displayName]));

		return res.json({
			messages: rows.map((row) => ({
				id: row.id,
				chatJid: row.chatJid,
				timestamp: row.timestamp,
				body: row.body,
				messageType: row.messageType,
				fromMe: Boolean(row.fromMe),
				senderName: row.fromMe ? (ownerNameByLink.get(row.linkId) ?? null) : null,
				mediaMime: row.mediaMime ?? null,
				mediaFileName: row.mediaFileName ?? null,
				paymentId: row.paymentId ?? null,
				paymentRegisteredByName: row.paymentRegisteredById
					? (actorName.get(row.paymentRegisteredById) ?? null)
					: null,
				paymentRegisteredAt: row.paymentRegisteredAt ?? null,
				letterId: row.letterId ?? null,
				letterAddedByName: row.letterAddedById
					? (actorName.get(row.letterAddedById) ?? null)
					: null,
				letterAddedAt: row.letterAddedAt ?? null,
			})),
		});
	};

	/** POST /retreat/:retreatId/seen — marks read up to the last message (D11). */
	markSeen = async (req: Request, res: Response): Promise<Response> => {
		const retreatId = req.params.retreatId;
		const userId = currentUser(req).id;
		const chatJid = String(req.body?.chatJid ?? '');
		if (!ONE_TO_ONE_JID.test(chatJid)) {
			return res.status(400).json({ message: 'chatJid debe ser un JID 1:1 válido' });
		}

		// The server decides the timestamp (the client sends no times).
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
	 * PATCH /retreat/:retreatId/enabled — per-retreat activation (D13, v1.1).
	 * Superadmin ONLY: the bridge costs RAM per linked account; deciding which
	 * retreat turns it on is not a role-template permission.
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
	 * POST /retreat/:retreatId/terminate-all — terminates EVERY bridge session
	 * of the retreat (D14, superadmin): stop + logout + wipe + purge of the
	 * links; optionally disables the retreat (default true).
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
	 * GET /retreat/:retreatId/unread — the user's total unread (sidebar badge,
	 * v1.1). Lightweight: counts against the caller's read states.
	 */
	unreadCount = async (req: Request, res: Response): Promise<Response> => {
		const userId = currentUser(req).id;
		const total = await waBridgeService.countUnreadForUser(
			req.params.retreatId,
			userId,
			await canSeeEmergencyContacts(userId),
		);
		return res.json({ total });
	};

	/**
	 * POST /retreat/:retreatId/seen-all — marks EVERY chat as read for the
	 * user (v1.1): read-state upsert at each chat's last message. Per-user UI
	 * state, not audited.
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
	 * GET /retreat/:retreatId/search?q= — text search over stored bodies
	 * (v1.1). Limit 30, newest first.
	 */
	search = async (req: Request, res: Response): Promise<Response> => {
		const q = String(req.query.q ?? '').trim();
		if (q.length < 2) {
			return res.json({ results: [] });
		}
		const index = await waBridgeService.getSenderIndex(req.params.retreatId);
		const results = await waBridgeService.searchMessages(req.params.retreatId, q.slice(0, 100), {
			canSeeEmergencyContacts: await canSeeEmergencyContacts(currentUser(req).id),
			index,
		});
		// Who wrote each result (search also matches by name — v1.1; contacts
		// since v1.4). Every result is visible: the service skipped the rest.
		return res.json({
			results: results.map((row) => {
				const match = index.get(row.chatPhone);
				const participant = primaryParticipantOf(match);
				const contact =
					match && senderKindOf(match) === 'emergency_contact' ? match.emergencyFor[0] : undefined;
				return {
					...row,
					senderKind: match ? senderKindOf(match) : 'walker',
					contactName: contact?.contactName ?? null,
					contactRelation: contact?.relation ?? null,
					participantId: participant?.id ?? null,
					participantFirstName: participant?.firstName ?? '',
					participantLastName: participant?.lastName ?? '',
				};
			}),
		});
	};

	/**
	 * POST /messages/:messageId/receipt — payment receipt from WhatsApp
	 * (FR14/D15, v1.1): the message's large image as a data-URL plus the
	 * matched walker, ready for the payment modal's `receiptPhoto`. Double
	 * gate: whatsappInbox:read (route) + payment:create (here). Nothing is
	 * stored by this call — the payment itself persists the receipt.
	 */
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

		// Orphan messages: their link was unlinked/purged — the image no longer
		// exists in any store (it was temporary, D9).
		const link = await waBridgeService.getLinkById(message.linkId);
		if (!link) {
			return res.status(410).json({
				message:
					'La imagen ya no está disponible: la sesión que la recibió fue desvinculada o purgada.',
			});
		}

		const match = await this.visibleChat(req, res, message.retreatId, message.chatPhone);
		if (!match) return res;
		// The walker the payment is for: the walker of the chat or, for an
		// emergency contact, the walker who listed them (the web may override
		// it with the group the chat was opened from).
		const participant = primaryParticipantOf(match);

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

	/**
	 * POST /retreat/:retreatId/media — thumbnails of a thread (v1.2): one batch
	 * for many images (cached server side) instead of one request per photo.
	 * Body: {messageIds} (max 30).
	 */
	threadMedia = async (req: Request, res: Response): Promise<Response> => {
		const messageIds: unknown = (req.body ?? {}).messageIds;
		if (!Array.isArray(messageIds) || messageIds.length === 0 || messageIds.length > 30) {
			return res.status(400).json({
				message: 'Envía entre 1 y 30 messageIds en el cuerpo de la petición.',
			});
		}

		const messages = await AppDataSource.getRepository(WhatsappInboxMessage).find({
			where: messageIds.map((id) => ({ id: String(id) })),
			select: [
				'id',
				'linkId',
				'chatJid',
				'chatPhone',
				'waMessageId',
				'messageType',
				'timestamp',
				'retreatId',
			],
		});
		const inRetreat = messages.filter(
			(m) => m.messageType === 'image' && m.retreatId === req.params.retreatId,
		);
		let valid: WhatsappInboxMessage[] = [];
		if (inRetreat.length > 0) {
			const accessOk = await ensureRetreatAccess(req, res, req.params.retreatId);
			if (!accessOk) return res;
			// v1.4: images of chats the caller cannot see are skipped, not 403 —
			// a batch may mix chats (history of a walker and their contacts).
			const index = await waBridgeService.getSenderIndex(req.params.retreatId);
			const canSee = await canSeeEmergencyContacts(currentUser(req).id);
			valid = inRetreat.filter((m) => waBridgeService.isChatVisible(index.get(m.chatPhone), canSee));
		}
		if (valid.length > 0) {
			try {
				const variants = await waBridgeService.getReceiptVariantsBatch(valid);
				const media: Record<string, { thumb: string; large: string }> = {};
				for (const m of valid) {
					const v = variants.get(m.id);
					if (v) media[m.id] = v;
				}
				return res.json({
					media,
					skipped: messageIds.length - Object.keys(media).length,
				});
			} catch (err) {
				const status = err instanceof WacliError ? 502 : 500;
				// The raw wacli detail (stderrTail) goes to the log only: it holds
				// internal paths and pids, so it never reaches the client.
				console.error('[waBridge][media] download failed:', (err as Error).message);
				const tail = (err as WacliError).stderrTail;
				if (tail) console.error('[waBridge][media] stderr:', tail.slice(-300));
				return res.status(status).json({
					message: `No se pudieron descargar las imágenes: ${(err as Error).message}. Reintenta en unos segundos; si persiste, revisa la sesión vinculada en el tablero.`,
				});
			}
		}
		return res.json({ media: {}, skipped: messageIds.length });
	};

	/**
	 * POST /messages/:messageId/raw-media (v1.3): a voice note, video (v1.5) or
	 * document, downloaded on demand and returned as a data-URL. v1.5 (D26):
	 * the type is verified from the bytes (letters' classifier) and comes with
	 * a `previewKind` — the browser shows images, PDFs, text, audio and video
	 * in the app and hands everything else to the system as a download.
	 * Macros and risky types (HTML, SVG, executables, archives) are refused.
	 */
	rawMedia = async (req: Request, res: Response): Promise<Response> => {
		const message = await AppDataSource.getRepository(WhatsappInboxMessage).findOneBy({
			id: req.params.messageId,
		});
		if (!message) return res.status(404).json({ message: 'Mensaje no encontrado' });
		if (!(await ensureRetreatAccess(req, res, message.retreatId))) return res;
		if (!RAW_MEDIA_TYPES.has(message.messageType)) {
			return res.status(400).json({ message: 'Este mensaje no trae audio, video ni documento.' });
		}
		if (!(await this.visibleChat(req, res, message.retreatId, message.chatPhone))) return res;
		try {
			const media = await waBridgeService.downloadRawMedia(message);
			return res.json({
				dataUrl: `data:${media.mime};base64,${media.buffer.toString('base64')}`,
				mime: media.mime,
				fileName: media.fileName,
				sizeBytes: media.buffer.length,
				previewKind: media.previewKind,
			});
		} catch (err) {
			if (err instanceof WaMediaRejectedError) {
				return res
					.status(err.reason === 'too_large' ? 413 : 415)
					.json({ message: err.message, reason: err.reason });
			}
			console.error('[waBridge][raw-media] download failed:', (err as Error).message);
			const status = err instanceof WacliError ? 502 : 500;
			return res.status(status).json({
				message: `No se pudo descargar el archivo: ${(err as Error).message}. Reintenta en unos segundos; si persiste, ábrelo desde tu WhatsApp.`,
			});
		}
	};

	/**
	 * POST /messages/:messageId/payment (v1.3, duplicate-payment guard): links
	 * the payment just created from this message. The bubble then shows
	 * "registered by X", and the next staff member sees it before paying twice.
	 */
	linkPayment = async (req: Request, res: Response): Promise<Response> => {
		const paymentId = String((req.body ?? {}).paymentId ?? '');
		if (!UUID_RE.test(paymentId)) {
			return res.status(400).json({ message: 'paymentId inválido.' });
		}
		const repo = AppDataSource.getRepository(WhatsappInboxMessage);
		const message = await repo.findOneBy({ id: req.params.messageId });
		if (!message) return res.status(404).json({ message: 'Mensaje no encontrado' });
		if (!(await ensureRetreatAccess(req, res, message.retreatId))) return res;
		if (!(await this.visibleChat(req, res, message.retreatId, message.chatPhone))) return res;
		const payment = await AppDataSource.getRepository(Payment).findOne({
			where: { id: paymentId },
			select: ['id', 'retreatId'],
		});
		if (!payment || payment.retreatId !== message.retreatId) {
			return res.status(400).json({ message: 'El pago no pertenece a este retiro.' });
		}
		const now = new Date();
		await repo.update(
			{ id: message.id },
			{ paymentId, paymentRegisteredById: currentUser(req).id, paymentRegisteredAt: now },
		);
		emitInboxChanged({ retreatId: message.retreatId, newCount: 0 });
		return res.json({ ok: true, paymentId, paymentRegisteredAt: now });
	};

	/**
	 * POST /messages/:messageId/letter (v1.3, D20): "add as letter" — the
	 * message (text edited by the staff, optional image or rendered PDF page)
	 * becomes a printable Letter of the chosen retreat participant.
	 */
	addAsLetter = async (req: Request, res: Response): Promise<Response> => {
		const body = (req.body ?? {}) as Record<string, unknown>;
		const participantId = String(body.participantId ?? '');
		const bodyText = typeof body.bodyText === 'string' ? body.bodyText : '';
		const attachmentRaw = body.attachment as { fileName?: unknown; dataUrl?: unknown } | null;
		// v1.5: keep the original document (Word, PDF…) with the letter; the
		// server downloads and verifies it itself — the client never uploads it.
		const includeDocument = body.includeDocument === true;
		if (!UUID_RE.test(participantId)) {
			return res.status(400).json({ message: 'Elige el participante destinatario de la carta.' });
		}
		const message = await AppDataSource.getRepository(WhatsappInboxMessage).findOneBy({
			id: req.params.messageId,
		});
		if (!message) return res.status(404).json({ message: 'Mensaje no encontrado' });
		if (!(await ensureRetreatAccess(req, res, message.retreatId))) return res;
		const match = await this.visibleChat(req, res, message.retreatId, message.chatPhone);
		if (!match) return res;
		// Letters belong to the retreat registration, resolved server-side.
		const registration = await AppDataSource.getRepository(RetreatParticipant).findOne({
			where: { participantId, retreatId: message.retreatId },
			select: ['id'],
		});
		if (!registration) {
			return res.status(400).json({ message: 'El participante elegido no pertenece a este retiro.' });
		}
		const retreatParticipantId = registration.id;

		// "Mamá — María (contacto de Juan Pérez)" for an emergency contact.
		const senderName = senderDisplayName(match, `+${message.chatPhone}`);
		try {
			const document =
				includeDocument && message.messageType === 'document'
					? await waBridgeService.downloadRawMedia(message)
					: null;
			const result = await createLetterFromWhatsapp({
				message,
				retreatParticipantId,
				bodyText,
				senderName,
				attachment:
					attachmentRaw &&
					typeof attachmentRaw.dataUrl === 'string' &&
					typeof attachmentRaw.fileName === 'string'
						? { fileName: attachmentRaw.fileName, dataUrl: attachmentRaw.dataUrl }
						: null,
				document: document
					? {
							fileName: document.fileName,
							mimeType: document.mime,
							buffer: document.buffer,
							printable: document.previewKind === 'image',
						}
					: null,
				actorUserId: currentUser(req).id,
			});
			emitInboxChanged({ retreatId: message.retreatId, newCount: 0 });
			return res.status(result.duplicate ? 200 : 201).json(result);
		} catch (err) {
			if (err instanceof WaLetterError) {
				return res.status(err.httpStatus).json({ message: err.message });
			}
			if (err instanceof WaMediaRejectedError) {
				return res.status(err.reason === 'too_large' ? 413 : 415).json({ message: err.message });
			}
			if (err instanceof WacliError) {
				return res.status(502).json({ message: `No se pudo descargar el documento: ${err.message}` });
			}
			console.error('[waBridge][letter] create failed:', (err as Error).message);
			return res.status(500).json({ message: 'No se pudo crear la carta. Reintenta.' });
		}
	};
}
