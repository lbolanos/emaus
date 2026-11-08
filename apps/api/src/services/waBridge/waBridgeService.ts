import * as fs from 'fs';
import { randomUUID } from 'crypto';
import { AppDataSource } from '../../data-source';
import { config } from '../../config';
import { Participant } from '../../entities/participant.entity';
import { RetreatParticipant } from '../../entities/retreatParticipant.entity';
import { Retreat } from '../../entities/retreat.entity';
import { User } from '../../entities/user.entity';
import { WhatsappBridgeLink } from '../../entities/whatsappBridgeLink.entity';
import { WhatsappInboxMessage } from '../../entities/whatsappInboxMessage.entity';
import { WhatsappInboxReadState } from '../../entities/whatsappInboxReadState.entity';
import { domainAuditService } from '../domainAuditService';
import {
	toNationalPhone,
	DomainAuditAction,
	type DomainAuditActionType,
	PHONE_CALLING_CODE_BY_COUNTRY,
	type WaLinkRefusalReason,
} from '@repo/types';
import { resolveSafeTimeZone } from '../../utils/date.transformer';
import { emitInboxChanged } from '../../realtime';
import { imageService } from '../imageService';
import { mediaDownload, WacliError } from './wacliClient';
import {
	WaBridgeSupervisor,
	type WaSupervisorEvent,
} from './waBridgeSupervisor';
import { authStatus, wacliLogout } from './wacliClient';

/**
 * Orquestación del puente WhatsApp de solo lectura (specs/whatsapp-inbox):
 * ventanas de vinculación por fecha civil del retiro, tope de sesiones,
 * ciclo de vida de supervisores, unlink con borrado total y el índice de
 * teléfonos de caminantes que consume el poller.
 *
 * Read-only estructural: nada de este servicio envía mensajes (D1). El único
 * comando escritor es `auth logout` en unlink/retención.
 */

const CIVIL_TODAY_CACHE_TTL_MS = 60_000;

/** Fecha civil "YYYY-MM-DD" de hoy vista desde `tz` (en-CA da ISO directo). */
export function civilTodayInTimezone(tz: string): string {
	return new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date());
}

/** Suma (o resta) días a una fecha civil `YYYY-MM-DD` con aritmética UTC. */
export function shiftCivilDate(civil: string, days: number): string {
	const [y, m, d] = civil.split('-').map((part) => parseInt(part, 10));
	const date = new Date(Date.UTC(y, m - 1, d));
	date.setUTCDate(date.getUTCDate() + days);
	return date.toISOString().slice(0, 10);
}

export interface WaLinkWindow {
	/** Primer día civil en que se permite vincular (startDate − linkWindowDays). */
	linkOpenOn: string;
	/** Último día civil en que se permite vincular (endDate). */
	linkCloseOn: string;
	/** Último día civil con sync vivo (endDate + retentionDays); luego purga. */
	syncCloseOn: string;
	canLink: boolean;
	syncAllowed: boolean;
}

/** Ventana del puente para un retiro, contra la fecha civil dada (puro, testeable). */
export function computeLinkWindow(
	retreat: Pick<Retreat, 'startDate' | 'endDate' | 'timezone'>,
	todayCivil: string,
	linkWindowDays = config.waBridge.linkWindowDays,
	retentionDays = config.waBridge.retentionDays,
): WaLinkWindow {
	const startDate = typeof retreat.startDate === 'string' ? retreat.startDate : '';
	const endDate = typeof retreat.endDate === 'string' ? retreat.endDate : '';
	const linkOpenOn = shiftCivilDate(startDate, -linkWindowDays);
	const syncCloseOn = shiftCivilDate(endDate, retentionDays);
	return {
		linkOpenOn,
		linkCloseOn: endDate,
		syncCloseOn,
		canLink: todayCivil >= linkOpenOn && todayCivil <= endDate,
		// Gracia post-retiro: los mensajes siguen entrando hasta la purga.
		syncAllowed: todayCivil <= syncCloseOn,
	};
}

/** ¿Ya corresponde purgar este link? (puro, testeable) */
export function isLinkPurgeDue(
	retreatEndDate: string,
	todayCivil: string,
	retentionDays = config.waBridge.retentionDays,
): boolean {
	return todayCivil > shiftCivilDate(retreatEndDate, retentionDays);
}

/**
 * Dígitos JID que aceptaríamos de un caminante con ese número nacional y país.
 * (puro, testeable). MX es caso especial: los JID de móviles mexicanos llevan
 * el prefijo 1 intermedio (`521XXXXXXXXXX`), el fijo no (`52XXXXXXXXXX`).
 */
export function acceptedJidDigitVariants(national: string, country: string): string[] {
	const code = PHONE_CALLING_CODE_BY_COUNTRY[country];
	if (!code) return [national];
	const base = `${code}${national}`;
	return code === '52' ? [base, `${code}1${national}`] : [base];
}

// La unión de motivos vive en @repo/types (waBridge.ts) — una sola fuente.
export type { WaLinkRefusalReason };

export type WaLinkStartResult =
	| { ok: true; link: WhatsappBridgeLink }
	| { ok: false; reason: WaLinkRefusalReason };

export class WaBridgeService {
	private supervisors = new Map<string, WaBridgeSupervisor>();
	private qrCache = new Map<string, string>();
	private civitTodayCache = new Map<string, { civil: string; at: number }>();
	private warnedBinaryMissing = false;
	/** Set by shutdown(): an in-flight poll must not respawn supervisors. */
	private shuttingDown = false;

	private get linkRepo() {
		return AppDataSource.getRepository(WhatsappBridgeLink);
	}

	private todayCivil(tz: string): string {
		const cached = this.civitTodayCache.get(tz);
		const now = Date.now();
		if (cached && now - cached.at < CIVIL_TODAY_CACHE_TTL_MS) return cached.civil;
		const civil = civilTodayInTimezone(tz);
		this.civitTodayCache.set(tz, { civil, at: now });
		return civil;
	}

	async getWindowForRetreat(retreatId: string): Promise<{ retreat: Retreat; window: WaLinkWindow } | null> {
		const retreat = await AppDataSource.getRepository(Retreat).findOneBy({ id: retreatId });
		if (!retreat) return null;
		const tz = resolveSafeTimeZone(retreat.timezone);
		return {
			retreat,
			window: computeLinkWindow(retreat, this.todayCivil(tz)),
		};
	}

	/** Chequeos de vinculación sin efectos (motivo tipado para la UI). */
	async canLink(retreatId: string, userId: string): Promise<WaLinkRefusalReason | null> {
		if (!config.waBridge.enabled) return 'disabled';
		const found = await this.getWindowForRetreat(retreatId);
		if (!found) return 'outside_window';
		// Activación por retiro (D13): solo el superadmin la enciende; consume
		// RAM por cada cuenta vinculada.
		if (!found.retreat.whatsappInboxEnabled) return 'not_enabled';
		if (!found.window.canLink) return 'outside_window';

		const activeCount = await this.linkRepo.count({
			where: [
				{ status: 'connected' },
				{ status: 'qr' },
				{ status: 'pending' },
			],
		});
		// Solo un vínculo REALMENTE conectado bloquea la re-vinculación: los
		// pendientes/qr/error son intentos muertos que startLink reinicia
		// (incidencia del QA real 2026-11-06: un auth que murió sin emparejar
		// dejaba la fila y bloqueaba el reintento con already_linked).
		const existing = await this.linkRepo.findOneBy({ retreatId, userId });
		const alreadyLinked = existing && existing.status === 'connected';
		if (alreadyLinked) return 'already_linked';
		if (activeCount >= config.waBridge.maxSessions) return 'cap_reached';
		return null;
	}

	/** Crea (o reusa) el vínculo y arranca el flujo de QR. */
	async startLink(retreatId: string, user: User): Promise<WaLinkStartResult> {
		const reason = await this.canLink(retreatId, user.id);
		if (reason) return { ok: false, reason };

		let link = await this.linkRepo.findOneBy({ retreatId, userId: user.id });
		if (!link) {
			// El storePath necesita el id ANTES del save: uuid asignado a mano
			// (el mkdir 0700 va inmediatamente después).
			link = this.linkRepo.create({
				id: randomUUID(),
				retreatId,
				userId: user.id,
				status: 'pending',
			});
		}
		link.storePath = `${config.waBridge.dataDir}/${link.id}`;
		link.status = 'pending';
		link.lastError = null;
		link.linkedJid = null;
		link.linkedPhone = null;
		link.connectedAt = null;
		link.lastSyncAt = null;

		// El store se crea ANTES de guardar la fila: si el dataDir no es
		// escribible, el fallo no deja fila pending huérfana que después
		// bloquee con already_linked (incidencia del QA 2026-11-06). Store
		// limpio: un re-vinculado no hereda sesión ni historial previo.
		fs.rmSync(link.storePath, { recursive: true, force: true });
		fs.mkdirSync(link.storePath, { recursive: true, mode: 0o700 });

		await this.linkRepo.save(link);

		await this.stopSupervisorById(link.id);
		const supervisor = this.createSupervisor(link);
		supervisor.startAuth();

		void domainAuditService.log({
			action: DomainAuditAction.WA_BRIDGE_LINK_START,
			resourceType: 'whatsapp_bridge_link',
			resourceId: link.id,
			retreatId,
			actorUserId: user.id,
			metadata: { system: false, storePath: link.storePath },
		});
		return { ok: true, link };
	}

	private createSupervisor(link: WhatsappBridgeLink): WaBridgeSupervisor {
		const existing = this.supervisors.get(link.id);
		if (existing) return existing;
		const supervisor = new WaBridgeSupervisor(link.id, link.storePath, (event) => {
			void this.handleSupervisorEvent(link.id, event);
		});
		this.supervisors.set(link.id, supervisor);
		return supervisor;
	}

	private async handleSupervisorEvent(linkId: string, event: WaSupervisorEvent): Promise<void> {
		const link = await this.linkRepo.findOneBy({ id: linkId });
		if (!link) return;
		const supervisor = this.supervisors.get(linkId);

		switch (event.type) {
			case 'qr':
				this.qrCache.set(linkId, event.qr ?? '');
				if (link.status !== 'qr') {
					link.status = 'qr';
					await this.linkRepo.save(link);
				}
				return;
			case 'connected': {
				supervisor?.resetBackoff();
				try {
					const status = await authStatus(link.storePath);
					link.linkedJid = status.linkedJid ?? null;
					// Display-only: dígitos pelados, sin normalización por país (el
					// dueño es quien los ve; nunca salen hacia terceros).
					link.linkedPhone = status.phone
						? String(status.phone).replace(/\D/g, '') || null
						: null;
				} catch {
					// auth status puede chocar con el lock durante el bootstrap: no
					// bloquea la transición.
				}
				// A reconnect after 'error' is not a new link: only the first
				// successful pairing (no connectedAt yet) is audited as LINKED.
				const firstLink = !link.connectedAt;
				link.status = 'connected';
				if (!link.connectedAt) link.connectedAt = new Date();
				link.lastError = null;
				this.qrCache.delete(linkId);
				await this.linkRepo.save(link);
				if (firstLink) {
					void domainAuditService.log({
						action: DomainAuditAction.WA_BRIDGE_LINKED,
						resourceType: 'whatsapp_bridge_link',
						resourceId: link.id,
						retreatId: link.retreatId,
						metadata: { system: true },
					});
				}
				return;
			}
			case 'logged_out':
				link.status = 'logged_out';
				link.lastError = null;
				await this.linkRepo.save(link);
				return;
			case 'warning':
			case 'error': {
				const rawMessage = (event.message ?? 'unknown wacli error').slice(0, 300);
				// Ruido informativo del sync (QA real 2026-11-06/07): mensajes de
				// grupo cuyo payload wacli no renderiza — se anotan, no ensucian
				// el tablero ni el modal.
				if (/stored message .* without content|unhandled payload|history sync suppressed/i.test(rawMessage)) {
					console.log(`[waBridge][${linkId}] wacli notice: ${rawMessage}`);
					return;
				}
				// Errores conocidos → instrucción accionable para el staff (v1.1:
				// el tablero informa qué hacer, no solo el error crudo).
				let guidance = '';
				if (/store is locked|another wacli/i.test(rawMessage)) {
					guidance =
						'La sesión está ocupada por otro proceso del sistema; se reintenta automáticamente. Si sigue así más de 5 minutos, desvincula y vuelve a vincular.';
				} else if (/logged out|logged_out|no session|not authenticated/i.test(rawMessage)) {
					guidance =
						'La sesión se cerró desde el teléfono. Desvincula y vuelve a vincular para reconectar.';
				} else {
					guidance = 'Si el problema persiste, desvincula y vuelve a vincular tu WhatsApp.';
				}
				link.lastError = `${rawMessage} — ${guidance}`.slice(0, 500);
				await this.linkRepo.save(link);
				return;
			}
			case 'auth_exit': {
				// El bootstrap terminó: ¿quedó emparejado? Si sí, pasa a sync.
				try {
					const status = await authStatus(link.storePath);
					if (status.authenticated) {
						supervisor?.startSync();
						await this.handleSupervisorEvent(linkId, { type: 'connected' });
					} else if (link.status !== 'qr') {
						// El QR expiró o el usuario cerró: el supervisor no re-arranca
						// auth por sí solo; el usuario reintenta desde la UI.
						link.lastError = 'Pairing did not finish; scan the QR again';
						await this.linkRepo.save(link);
					}
				} catch (err) {
					link.lastError = (err as Error).message.slice(0, 500);
					await this.linkRepo.save(link);
				}
				return;
			}
			case 'child_exit':
				// sync murió: el supervisor agenda restart con backoff; el estado
				// queda 'error' hasta que vuelva a conectar.
				if (link.status === 'connected') {
					link.status = 'error';
					link.lastError = 'sync process exited; retrying with backoff';
					await this.linkRepo.save(link);
				}
				return;
		}
	}

	getQr(linkId: string): string | null {
		return this.qrCache.get(linkId) ?? null;
	}

	/** Desvinculación total: logout + rm del store + DELETE (cascade limpia todo). */
	async unlink(user: User, link: WhatsappBridgeLink): Promise<void> {
		await this.teardownLink(link, { actorUserId: user.id, system: false });
	}

	/**
	 * Single teardown path for a link (owner unlink, superadmin termination and
	 * retention): stop the supervisor, best-effort logout, rm the store, then
	 * delete the link's messages EXPLICITLY before the link row. The runtime
	 * does not guarantee `PRAGMA foreign_keys` (see retreatService), so the
	 * entity's onDelete CASCADE cannot be trusted to purge walker messages.
	 */
	async teardownLink(
		link: WhatsappBridgeLink,
		opts: {
			actorUserId?: string | null;
			system: boolean;
			action?: DomainAuditActionType;
			metadata?: Record<string, unknown>;
		},
	): Promise<{ messageCount: number }> {
		await this.stopSupervisorById(link.id);
		try {
			await wacliLogout(link.storePath);
		} catch {
			// Best-effort: with the store gone or the session dead, the rm and the
			// deletes below still remove everything local.
		}
		fs.rmSync(link.storePath, { recursive: true, force: true });
		this.qrCache.delete(link.id);
		this.forgetLinkMedia(link.id);

		const messageRepo = AppDataSource.getRepository(WhatsappInboxMessage);
		const messageCount = await messageRepo.count({ where: { linkId: link.id } });
		await messageRepo.delete({ linkId: link.id });
		await this.linkRepo.remove(link);
		// Read-state rows carry walker chat JIDs: drop them once the retreat has
		// no link left (nothing else can show those chats anymore).
		const remaining = await this.linkRepo.count({ where: { retreatId: link.retreatId } });
		if (remaining === 0) {
			await AppDataSource.getRepository(WhatsappInboxReadState).delete({
				retreatId: link.retreatId,
			});
		}

		void domainAuditService.log({
			action: opts.action ?? DomainAuditAction.WA_BRIDGE_UNLINKED,
			resourceType: 'whatsapp_bridge_link',
			resourceId: link.id,
			retreatId: link.retreatId,
			actorUserId: opts.actorUserId ?? null,
			metadata: { system: opts.system, messageCount, ...(opts.metadata ?? {}) },
		});
		return { messageCount };
	}

	/**
	 * Activación por retiro (D13): solo superadmin (lo valida el controller).
	 * Al apagar se TERMINAN todos los vínculos del retiro (D14): los stores son
	 * llaves de sesión de cuentas personales — un retiro apagado no puede
	 * dejar sesiones vivas.
	 */
	async setEnabled(retreatId: string, enabled: boolean, actor: User): Promise<void> {
		if (!enabled) {
			await this.terminateAll(retreatId, actor, { disable: false });
		}
		const repo = AppDataSource.getRepository(Retreat);
		const retreat = await repo.findOneByOrFail({ id: retreatId });
		retreat.whatsappInboxEnabled = enabled;
		await repo.save(retreat);

		void domainAuditService.log({
			action: enabled
				? DomainAuditAction.WA_BRIDGE_RETREAT_ENABLED
				: DomainAuditAction.WA_BRIDGE_RETREAT_DISABLED,
			resourceType: 'retreat',
			resourceId: retreatId,
			retreatId,
			actorUserId: actor.id,
			metadata: { system: false },
		});
		emitInboxChanged({ retreatId, newCount: 0 });
	}

	/** Termina TODOS los servidores del puente de un retiro (D14, superadmin). */
	async terminateAll(
		retreatId: string,
		actor: User,
		opts: { disable: boolean } = { disable: true },
	): Promise<{ terminated: number }> {
		const links = await this.linkRepo.find({ where: { retreatId } });
		for (const link of links) {
			await this.teardownLink(link, { actorUserId: actor.id, system: true });
		}
		if (opts.disable) {
			const repo = AppDataSource.getRepository(Retreat);
			const retreat = await repo.findOneByOrFail({ id: retreatId });
			retreat.whatsappInboxEnabled = false;
			await repo.save(retreat);
			void domainAuditService.log({
				action: DomainAuditAction.WA_BRIDGE_RETREAT_DISABLED,
				resourceType: 'retreat',
				resourceId: retreatId,
				retreatId,
				actorUserId: actor.id,
				metadata: { system: true, terminatedLinks: links.length },
			});
		}
		emitInboxChanged({ retreatId, newCount: 0 });
		return { terminated: links.length };
	}

	/**
	 * Dígitos JID aceptados para el retiro (D4): para cada caminante, su número
	 * nacional + variantes de lada según su país. Se recalcula en cada ciclo:
	 * barato (cientos de filas) y captura inscripciones tardías. El filtro
	 * canónico del repo: `retreat_participants.type='walker' AND isCancelled=0`
	 * — el type/isCancelled viven en RetreatParticipant, NO en Participant.
	 */
	async getWalkerJidDigitIndex(retreatId: string): Promise<Set<string>> {
		const registrations = await AppDataSource.getRepository(RetreatParticipant).find({
			where: { retreatId, type: 'walker', isCancelled: false },
			select: ['participantId'],
		});
		const participantIds = registrations
			.map((reg) => reg.participantId)
			.filter((id): id is string => Boolean(id));
		if (participantIds.length === 0) return new Set();

		const walkers = await AppDataSource.getRepository(Participant).find({
			where: participantIds.map((id) => ({ id })),
			select: ['id', 'cellPhone', 'country'],
		});
		const index = new Set<string>();
		for (const walker of walkers) {
			if (!walker.cellPhone || !walker.country) continue;
			const national = toNationalPhone(walker.cellPhone, walker.country);
			if (!national) continue;
			for (const variant of acceptedJidDigitVariants(national, walker.country)) {
				index.add(variant);
			}
		}
		return index;
	}

	/** Para y desregistra el supervisor del link; espera la parada limpia. */
	async stopSupervisorById(linkId: string): Promise<void> {
		const supervisor = this.supervisors.get(linkId);
		this.supervisors.delete(linkId);
		if (!supervisor) return;
		await supervisor.stop();
	}

	async getLinkById(linkId: string): Promise<WhatsappBridgeLink | null> {
		return this.linkRepo.findOneBy({ id: linkId });
	}

	async listLinksForRetreat(retreatId: string): Promise<Array<WhatsappBridgeLink & { ownerName: string | null }>> {
		const links = await this.linkRepo.find({
			where: { retreatId },
			order: { createdAt: 'ASC' },
		});
		const userIds = Array.from(new Set(links.map((link) => link.userId)));
		const users = userIds.length
			? await AppDataSource.getRepository(User).find({
					where: userIds.map((id) => ({ id })),
					select: ['id', 'displayName'],
				})
			: [];
		const nameById = new Map(users.map((user) => [user.id, user.displayName]));
		return links.map((link) => ({ ...link, ownerName: nameById.get(link.userId) ?? null }));
	}

	/**
	 * Boot respawn AND per-poll watchdog: every paired link ('connected' or
	 * 'error' — an 'error' link is paired but its sync child died) gets a
	 * supervisor when it has none. Without 'error' here, a deploy during a
	 * reconnect backoff left that session dead until someone re-linked.
	 */
	async respawnFromDb(): Promise<{ respawned: number }> {
		if (!config.waBridge.enabled || this.shuttingDown) return { respawned: 0 };
		if (!fs.existsSync(config.waBridge.wacliBin)) {
			if (!this.warnedBinaryMissing) {
				console.warn(
					`[waBridge] wacli binary not found at ${config.waBridge.wacliBin}; bridge stays inert`,
				);
				this.warnedBinaryMissing = true;
			}
			return { respawned: 0 };
		}
		const links = await this.linkRepo.find({
			where: [{ status: 'connected' }, { status: 'error' }],
		});
		let respawned = 0;
		for (const link of links) {
			if (this.supervisors.has(link.id)) continue;
			// No store on disk = nothing to resume (wiped by hand or a failed rm).
			if (!fs.existsSync(link.storePath)) continue;
			const retreat = await AppDataSource.getRepository(Retreat).findOneBy({ id: link.retreatId });
			if (!retreat) continue;
			// Sin activación del superadmin, ningún hijo se levanta (D13).
			if (!retreat.whatsappInboxEnabled) continue;
			const tz = resolveSafeTimeZone(retreat.timezone);
			const window = computeLinkWindow(retreat, this.todayCivil(tz));
			if (!window.syncAllowed) continue;
			const supervisor = this.createSupervisor(link);
			supervisor.startSync();
			respawned += 1;
		}
		return { respawned };
	}

	shutdown(): void {
		this.shuttingDown = true;
		for (const [, supervisor] of this.supervisors) {
			void supervisor.stop();
		}
		this.supervisors.clear();
		this.qrCache.clear();
	}

	/**
	 * No leídos totales del retiro PARA ESTE usuario (badge del sidebar, v1.1):
	 * mensaje cuyo timestamp es mayor que el read-state de su chat.
	 */
	async countUnreadForUser(retreatId: string, userId: string): Promise<number> {
		// Incoming only (v1.3 stores the staff's own replies too) and resolved in
		// SQL: the badge polls every 60 s from every open sidebar.
		const rows: Array<{ unread: number }> = await AppDataSource.query(
			`SELECT COUNT(*) AS unread
			   FROM whatsapp_inbox_message m
			   LEFT JOIN whatsapp_inbox_read_state rs
			     ON rs.retreatId = m.retreatId AND rs.chatJid = m.chatJid AND rs.userId = ?
			  WHERE m.retreatId = ? AND m.fromMe = 0
			    AND (rs.lastSeenMessageTimestamp IS NULL
			         OR julianday(m.timestamp) > julianday(rs.lastSeenMessageTimestamp))`,
			[userId, retreatId],
		);
		return Number(rows[0]?.unread ?? 0);
	}

	/**
	 * Consolidated conversation list for one user (v1.3): aggregated in SQL —
	 * the previous version loaded every message of the retreat into memory on
	 * each refetch, and every open inbox refetches on every new message.
	 *
	 * Per chat: counts, unread for this user (incoming only), the last message
	 * (preview + type + direction) and the last staff reply with its author, so
	 * the list can say "answered by X" vs "awaiting reply".
	 */
	async listConversations(
		retreatId: string,
		userId: string,
	): Promise<WaConversationRow[]> {
		const aggregates: Array<{
			chatJid: string;
			chatPhone: string;
			messageCount: number;
			unreadCount: number;
			lastMessageAt: string;
			lastIncomingAt: string | null;
			lastReplyAt: string | null;
		}> = await AppDataSource.query(
			`SELECT m.chatJid AS chatJid,
			        MIN(m.chatPhone) AS chatPhone,
			        COUNT(*) AS messageCount,
			        SUM(CASE WHEN m.fromMe = 0
			                  AND (rs.lastSeenMessageTimestamp IS NULL
			                       OR julianday(m.timestamp) > julianday(rs.lastSeenMessageTimestamp))
			                 THEN 1 ELSE 0 END) AS unreadCount,
			        MAX(m.timestamp) AS lastMessageAt,
			        MAX(CASE WHEN m.fromMe = 0 THEN m.timestamp END) AS lastIncomingAt,
			        MAX(CASE WHEN m.fromMe = 1 THEN m.timestamp END) AS lastReplyAt
			   FROM whatsapp_inbox_message m
			   LEFT JOIN whatsapp_inbox_read_state rs
			     ON rs.retreatId = m.retreatId AND rs.chatJid = m.chatJid AND rs.userId = ?
			  WHERE m.retreatId = ?
			  GROUP BY m.chatJid`,
			[userId, retreatId],
		);
		if (aggregates.length === 0) return [];

		// Last message per chat (preview) and last staff reply per chat (author).
		const lastRows: Array<{
			chatJid: string;
			body: string | null;
			messageType: string;
			fromMe: number;
		}> = await AppDataSource.query(
			`SELECT m.chatJid, m.body, m.messageType, m.fromMe
			   FROM whatsapp_inbox_message m
			   JOIN (SELECT chatJid, MAX(timestamp) AS ts FROM whatsapp_inbox_message
			          WHERE retreatId = ? GROUP BY chatJid) last
			     ON last.chatJid = m.chatJid AND last.ts = m.timestamp
			  WHERE m.retreatId = ?`,
			[retreatId, retreatId],
		);
		const replyRows: Array<{ chatJid: string; linkId: string }> = await AppDataSource.query(
			`SELECT m.chatJid, m.linkId
			   FROM whatsapp_inbox_message m
			   JOIN (SELECT chatJid, MAX(timestamp) AS ts FROM whatsapp_inbox_message
			          WHERE retreatId = ? AND fromMe = 1 GROUP BY chatJid) last
			     ON last.chatJid = m.chatJid AND last.ts = m.timestamp
			  WHERE m.retreatId = ? AND m.fromMe = 1`,
			[retreatId, retreatId],
		);
		const lastByChat = new Map(lastRows.map((row) => [row.chatJid, row]));
		const replyLinkByChat = new Map(replyRows.map((row) => [row.chatJid, row.linkId]));
		const ownerNameByLink = await this.linkOwnerNames(Array.from(replyLinkByChat.values()));
		const index = await this.getWalkerDigitsIndex(retreatId);

		return aggregates
			.map((row) => {
				const walkers = index.get(row.chatPhone) ?? [];
				const primary = walkers[0];
				const last = lastByChat.get(row.chatJid);
				const lastIncomingAt = sqliteUtcToDate(row.lastIncomingAt);
				const lastReplyAt = sqliteUtcToDate(row.lastReplyAt);
				const replyLinkId = replyLinkByChat.get(row.chatJid);
				return {
					chatJid: row.chatJid,
					chatPhone: row.chatPhone,
					messageCount: Number(row.messageCount),
					unreadCount: Number(row.unreadCount),
					lastMessageAt: sqliteUtcToDate(row.lastMessageAt) ?? new Date(0),
					lastMessagePreview: last?.body ?? null,
					lastMessageType: last?.messageType ?? 'text',
					lastMessageFromMe: Boolean(last?.fromMe),
					lastReplyAt,
					lastReplyByName: replyLinkId ? (ownerNameByLink.get(replyLinkId) ?? null) : null,
					awaitingReply:
						lastIncomingAt !== null && (lastReplyAt === null || lastReplyAt < lastIncomingAt),
					participantId: primary?.id ?? null,
					participantFirstName: primary?.firstName ?? '',
					participantLastName: primary?.lastName ?? '',
					country: primary?.country ?? null,
					sharedWith: walkers.slice(1).map((walker) => ({
						id: walker.id,
						firstName: walker.firstName,
						lastName: walker.lastName,
					})),
				};
			})
			.sort((a, b) => b.lastMessageAt.getTime() - a.lastMessageAt.getTime());
	}

	/** linkId → display name of the staff owner (for "answered by"). */
	async linkOwnerNames(linkIds: string[]): Promise<Map<string, string>> {
		const unique = Array.from(new Set(linkIds));
		if (unique.length === 0) return new Map();
		const links = await this.linkRepo.find({
			where: unique.map((id) => ({ id })),
			select: ['id', 'userId'],
		});
		const userIds = Array.from(new Set(links.map((link) => link.userId)));
		const users = userIds.length
			? await AppDataSource.getRepository(User).find({
					where: userIds.map((id) => ({ id })),
					select: ['id', 'displayName'],
				})
			: [];
		const nameByUser = new Map(users.map((user) => [user.id, user.displayName]));
		return new Map(
			links.map((link) => [link.id, nameByUser.get(link.userId) ?? 'Equipo']),
		);
	}

	/**
	 * Búsqueda de texto sobre los cuerpos persistidos (v1.1). IGNORA ACENTOS:
	 * los caminantes escriben "sabana" o "sábana" indistinto — se normaliza
	 * NFD sin diacríticos en memoria (los últimos 500 mensajes; LIKE de SQLite
	 * es byte-wise y no plegaría "sábana" contra "sabana"). v1.1: TAMBIÉN
	 * matchea por NOMBRE del caminante — un hit de nombre devuelve todo el
	 * chat de esa persona (búsqueda por persona, no solo por palabra).
	 */
	async searchMessages(
		retreatId: string,
		q: string,
		limit = 30,
	): Promise<
		Array<Pick<WhatsappInboxMessage, 'id' | 'chatJid' | 'chatPhone' | 'timestamp' | 'body' | 'messageType'>>
	> {
		const strip = (s: string) =>
			s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
		const needle = strip(q);
		if (!needle) return [];

		// v1.1: matchear TAMBIÉN por nombre del caminante — un hit de nombre
		// devuelve todo el chat de esa persona (búsqueda por persona).
		const digitsMap = await this.getWalkerDigitsMap(retreatId);
		const nameMatchedJids: string[] = [];
		for (const [digits, participant] of digitsMap) {
			const fullName = strip(`${participant.firstName} ${participant.lastName}`);
			if (fullName.includes(needle)) nameMatchedJids.push(`${digits}@s.whatsapp.net`);
		}

		// Chunked scan of the WHOLE retreat (newest first) until `limit` hits:
		// the old 500-row window silently missed older messages. Accent folding
		// happens in memory because SQLite LIKE is byte-wise.
		const repo = AppDataSource.getRepository(WhatsappInboxMessage);
		const out: Array<
			Pick<WhatsappInboxMessage, 'id' | 'chatJid' | 'chatPhone' | 'timestamp' | 'body' | 'messageType'>
		> = [];
		for (let skip = 0; out.length < limit; skip += SEARCH_CHUNK) {
			const rows = await repo.find({
				where: { retreatId },
				select: ['id', 'chatJid', 'chatPhone', 'timestamp', 'body', 'messageType'],
				order: { timestamp: 'DESC' },
				skip,
				take: SEARCH_CHUNK,
			});
			for (const row of rows) {
				const bodyHit = Boolean(row.body) && strip(row.body!).includes(needle);
				const chatHit = nameMatchedJids.includes(row.chatJid);
				if (bodyHit || chatHit) {
					out.push(row);
					if (out.length >= limit) break;
				}
			}
			if (rows.length < SEARCH_CHUNK) break;
		}
		return out;
	}

	/**
	 * JID digits → walkers of the retreat sharing that phone (most recent
	 * registration first). Usually one; couples on one phone give two — the
	 * inbox names both and lets the staff pick the payer (v1.3).
	 */
	async getWalkerDigitsIndex(retreatId: string): Promise<Map<string, Participant[]>> {
		const registrations = await AppDataSource.getRepository(RetreatParticipant).find({
			where: { retreatId, type: 'walker', isCancelled: false },
			order: { createdAt: 'DESC' },
			select: ['participantId'],
		});
		const participantIds = registrations
			.map((reg) => reg.participantId)
			.filter((id): id is string => Boolean(id));
		const index = new Map<string, Participant[]>();
		if (participantIds.length === 0) return index;
		const walkers = await AppDataSource.getRepository(Participant).find({
			where: participantIds.map((id) => ({ id })),
		});
		const walkerById = new Map(walkers.map((walker) => [walker.id, walker]));
		for (const reg of registrations) {
			const walker = reg.participantId ? walkerById.get(reg.participantId) : undefined;
			if (!walker?.cellPhone || !walker.country) continue;
			const national = toNationalPhone(walker.cellPhone, walker.country);
			if (!national) continue;
			for (const digits of acceptedJidDigitVariants(national, walker.country)) {
				const list = index.get(digits) ?? [];
				if (!list.some((p) => p.id === walker.id)) list.push(walker);
				index.set(digits, list);
			}
		}
		return index;
	}

	/**
	 * JID digits → the primary walker for that phone (most recent registration
	 * wins, deterministically). Every phone→participant resolution in the
	 * bridge goes through this — never an inline copy of the logic.
	 */
	async getWalkerDigitsMap(retreatId: string): Promise<Map<string, Participant>> {
		const index = await this.getWalkerDigitsIndex(retreatId);
		const map = new Map<string, Participant>();
		for (const [digits, walkers] of index) map.set(digits, walkers[0]);
		return map;
	}

	/**
	 * Descarga ON-DEMAND la imagen de un mensaje y la devuelve como data-URL
	 * lista para `receiptPhoto` del modal de pagos (FR14/D15, v1.1).
	 *
	 * La descarga escribe en el store y el hijo sync sostiene el lock: se
	 * detiene al supervisor, se descarga, y se re-arranca el sync antes de
	 * devolver (o al fallar). La imagen NUNCA se persiste en esta tabla: vive
	 * en el modal y, al guardar, en Payment.receiptUrl (payment-receipts/).
	 */
	async downloadReceiptDataUrl(message: WhatsappInboxMessage): Promise<string> {
		const variants = await this.getReceiptVariants(message);
		return variants.large;
	}

	/** Thumb + large variants of one image message (cache first). */
	async getReceiptVariants(
		message: WhatsappInboxMessage,
	): Promise<{ thumb: string; large: string }> {
		const map = await this.getReceiptVariantsBatch([message]);
		const variants = map.get(message.id);
		if (!variants) {
			throw new WacliError(
				'La imagen ya no está disponible: la sesión que la recibió fue desvinculada o purgada.',
			);
		}
		return variants;
	}

	/**
	 * Image variants for several messages (v1.2). `media download --read-only`
	 * takes no store lock, so it runs next to the live sync. Returns a map by
	 * messageId; a message whose link is gone (unlinked/purged — its media went
	 * with the store, D9) or whose download fails (403 from WhatsApp's CDN,
	 * over the size cap) is skipped without failing the batch.
	 */
	async getReceiptVariantsBatch(
		messages: WhatsappInboxMessage[],
	): Promise<Map<string, { thumb: string; large: string }>> {
		const out = new Map<string, { thumb: string; large: string }>();
		const pending: WhatsappInboxMessage[] = [];
		for (const message of messages) {
			const cached = this.receiptCache.get(message.id);
			if (cached && Date.now() - cached.at < RECEIPT_CACHE_TTL_MS) {
				out.set(message.id, { thumb: cached.thumb, large: cached.large });
			} else {
				pending.push(message);
			}
		}
		if (pending.length === 0) return out;

		const tmpDir = this.mediaTmpDir();
		for (const [linkId, group] of groupByLink(pending)) {
			const link = await this.linkRepo.findOneBy({ id: linkId });
			if (!link) continue;
			for (const message of group) {
				const outPath = `${tmpDir}/${message.id}.img`;
				try {
					await mediaDownload(link.storePath, message.chatJid, message.waMessageId, outPath);
					const stat = fs.statSync(outPath);
					if (stat.size > RECEIPT_MAX_BYTES) {
						throw new WacliError(
							`La imagen pesa ${(stat.size / 1048576).toFixed(1)} MB (tope 10 MB)`,
						);
					}
					const buffer = fs.readFileSync(outPath);
					const { thumb, large } = await imageService.processWaReceiptVariants(
						buffer,
						detectImageContentType(buffer),
					);
					const variants = {
						thumb: `data:${thumb.contentType};base64,${thumb.buffer.toString('base64')}`,
						large: `data:${large.contentType};base64,${large.buffer.toString('base64')}`,
					};
					this.cacheReceiptVariants(message, variants);
					out.set(message.id, variants);
				} catch (err) {
					console.error(
						`[waBridge][media] ${message.waMessageId}: ${(err as Error).message}`,
						err instanceof WacliError ? (err.stderrTail?.slice(-200) ?? '') : '',
					);
				} finally {
					fs.rmSync(outPath, { force: true });
				}
			}
		}
		return out;
	}

	/**
	 * Raw bytes of a voice note or document (v1.3), on demand and uncached:
	 * these are played or opened once, and documents can be large. The caller
	 * decides what to do with them (play, open, render a PDF page client-side).
	 */
	async downloadRawMedia(
		message: WhatsappInboxMessage,
	): Promise<{ buffer: Buffer; mime: string; fileName: string | null }> {
		const link = await this.linkRepo.findOneBy({ id: message.linkId });
		if (!link) {
			throw new WacliError(
				'El archivo ya no está disponible: la sesión que lo recibió fue desvinculada o purgada.',
			);
		}
		const cap = message.messageType === 'audio' ? AUDIO_MAX_BYTES : DOCUMENT_MAX_BYTES;
		const outPath = `${this.mediaTmpDir()}/${message.id}.bin`;
		try {
			await mediaDownload(link.storePath, message.chatJid, message.waMessageId, outPath);
			const stat = fs.statSync(outPath);
			if (stat.size > cap) {
				throw new WacliError(
					`El archivo pesa ${(stat.size / 1048576).toFixed(1)} MB (tope ${cap / 1048576} MB)`,
				);
			}
			return {
				buffer: fs.readFileSync(outPath),
				mime: message.mediaMime || 'application/octet-stream',
				fileName: message.mediaFileName ?? null,
			};
		} finally {
			fs.rmSync(outPath, { force: true });
		}
	}

	/** Drops every cached variant that came from this link (unlink/purge). */
	forgetLinkMedia(linkId: string): void {
		for (const [messageId, entry] of this.receiptCache) {
			if (entry.linkId === linkId) this.receiptCache.delete(messageId);
		}
	}

	private mediaTmpDir(): string {
		const tmpDir = `${config.waBridge.dataDir}/receipts-tmp`;
		fs.mkdirSync(tmpDir, { recursive: true, mode: 0o700 });
		return tmpDir;
	}

	private receiptCache = new Map<
		string,
		{ thumb: string; large: string; linkId: string; at: number }
	>();

	private cacheReceiptVariants(
		message: WhatsappInboxMessage,
		variants: { thumb: string; large: string },
	): void {
		// FIFO eviction past the cap: evicted photos are re-downloaded on demand.
		while (this.receiptCache.size >= RECEIPT_CACHE_MAX_ENTRIES) {
			const oldest = this.receiptCache.keys().next().value;
			if (oldest === undefined) break;
			this.receiptCache.delete(oldest);
		}
		this.receiptCache.set(message.id, { ...variants, linkId: message.linkId, at: Date.now() });
	}
}

function groupByLink(messages: WhatsappInboxMessage[]): Map<string, WhatsappInboxMessage[]> {
	const byLink = new Map<string, WhatsappInboxMessage[]>();
	for (const message of messages) {
		const list = byLink.get(message.linkId) ?? [];
		list.push(message);
		byLink.set(message.linkId, list);
	}
	return byLink;
}

/** Rows per page of the inbox text search scan. */
const SEARCH_CHUNK = 1000;

/** Cap for a downloaded receipt image (10 MB — a phone photo). */
const RECEIPT_MAX_BYTES = 10 * 1024 * 1024;
/** Caps for on-demand voice notes and documents. */
const AUDIO_MAX_BYTES = 8 * 1024 * 1024;
const DOCUMENT_MAX_BYTES = 10 * 1024 * 1024;

/**
 * Cache of downloaded image variants: 30 min, 40 entries (~8 MB worst case).
 * 40 > the 30-image thread batch, so reopening a thread does not thrash.
 */
const RECEIPT_CACHE_TTL_MS = 30 * 60 * 1000;
const RECEIPT_CACHE_MAX_ENTRIES = 40;

/** Content-type por magic bytes (JPEG/PNG/WebP); fallback image/jpeg. */
function detectImageContentType(buffer: Buffer): string {
	if (buffer.length > 3 && buffer[0] === 0xff && buffer[1] === 0xd8) return 'image/jpeg';
	if (
		buffer.length > 12 &&
		buffer[0] === 0x89 &&
		buffer[1] === 0x50 &&
		buffer[2] === 0x4e &&
		buffer[3] === 0x47
	)
		return 'image/png';
	if (
		buffer.length > 12 &&
		buffer[8] === 0x57 &&
		buffer[9] === 0x45 &&
		buffer[10] === 0x42 &&
		buffer[11] === 0x50
	)
		return 'image/webp';
	return 'image/jpeg';
}

/** Conversation row returned by listConversations (mirrors WaConversationDto). */
export interface WaConversationRow {
	chatJid: string;
	chatPhone: string;
	messageCount: number;
	unreadCount: number;
	lastMessageAt: Date;
	lastMessagePreview: string | null;
	lastMessageType: string;
	lastMessageFromMe: boolean;
	lastReplyAt: Date | null;
	lastReplyByName: string | null;
	awaitingReply: boolean;
	participantId: string | null;
	participantFirstName: string;
	participantLastName: string;
	country: string | null;
	sharedWith: Array<{ id: string; firstName: string; lastName: string }>;
}

/**
 * TypeORM stores SQLite datetimes as UTC 'YYYY-MM-DD HH:MM:SS.SSS' (no zone);
 * raw queries return that string, so parse it explicitly as UTC.
 */
export function sqliteUtcToDate(value: string | Date | null | undefined): Date | null {
	if (value === null || value === undefined || value === '') return null;
	if (value instanceof Date) return value;
	const iso = value.includes('T') ? value : value.replace(' ', 'T');
	const date = new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(iso) ? iso : `${iso}Z`);
	return Number.isNaN(date.getTime()) ? null : date;
}

export const waBridgeService = new WaBridgeService();
