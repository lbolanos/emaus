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
import { classifyAttachment } from '../letterService';
import { mediaDownload, WacliError } from './wacliClient';
import {
	WaBridgeSupervisor,
	type WaSupervisorEvent,
} from './waBridgeSupervisor';
import { authStatus, wacliLogout } from './wacliClient';

/**
 * Orchestration of the read-only WhatsApp bridge (specs/whatsapp-inbox):
 * link windows by the retreat's civil date, session cap, supervisor
 * lifecycle, unlink with full deletion, and the walker phone index the
 * poller consumes.
 *
 * Structurally read-only: nothing in this service sends messages (D1). The
 * only writing command is `auth logout` on unlink/retention.
 */

const CIVIL_TODAY_CACHE_TTL_MS = 60_000;

/** Today's civil date "YYYY-MM-DD" as seen from `tz` (en-CA yields ISO). */
export function civilTodayInTimezone(tz: string): string {
	return new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date());
}

/** Adds (or subtracts) days to a civil date `YYYY-MM-DD` with UTC arithmetic. */
export function shiftCivilDate(civil: string, days: number): string {
	const [y, m, d] = civil.split('-').map((part) => parseInt(part, 10));
	const date = new Date(Date.UTC(y, m - 1, d));
	date.setUTCDate(date.getUTCDate() + days);
	return date.toISOString().slice(0, 10);
}

export interface WaLinkWindow {
	/** First civil day linking is allowed (startDate − linkWindowDays). */
	linkOpenOn: string;
	/** Last civil day linking is allowed (endDate). */
	linkCloseOn: string;
	/** Last civil day with a live sync (endDate + retentionDays); then purge. */
	syncCloseOn: string;
	canLink: boolean;
	syncAllowed: boolean;
}

/** Bridge window of a retreat against the given civil date (pure, testable). */
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
		// Post-retreat grace: messages keep arriving until the purge.
		syncAllowed: todayCivil <= syncCloseOn,
	};
}

/** Is this link due for purge? (pure, testable) */
export function isLinkPurgeDue(
	retreatEndDate: string,
	todayCivil: string,
	retentionDays = config.waBridge.retentionDays,
): boolean {
	return todayCivil > shiftCivilDate(retreatEndDate, retentionDays);
}

/**
 * JID digits we would accept from a walker with that national number and
 * country (pure, testable). MX is special: Mexican mobile JIDs carry the
 * extra 1 (`521XXXXXXXXXX`), landlines do not (`52XXXXXXXXXX`).
 */
export function acceptedJidDigitVariants(national: string, country: string): string[] {
	const code = PHONE_CALLING_CODE_BY_COUNTRY[country];
	if (!code) return [national];
	const base = `${code}${national}`;
	return code === '52' ? [base, `${code}1${national}`] : [base];
}

// The refusal-reason union lives in @repo/types (waBridge.ts) — single source.
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

	/** Side-effect-free link checks (typed reason for the UI). */
	async canLink(retreatId: string, userId: string): Promise<WaLinkRefusalReason | null> {
		if (!config.waBridge.enabled) return 'disabled';
		const found = await this.getWindowForRetreat(retreatId);
		if (!found) return 'outside_window';
		// Per-retreat activation (D13): only the superadmin turns it on; every
		// linked account costs RAM.
		if (!found.retreat.whatsappInboxEnabled) return 'not_enabled';
		if (!found.window.canLink) return 'outside_window';

		const activeCount = await this.linkRepo.count({
			where: [
				{ status: 'connected' },
				{ status: 'qr' },
				{ status: 'pending' },
			],
		});
		// Only a REALLY connected link blocks re-linking: pending/qr/error rows
		// are dead attempts that startLink restarts (real QA 2026-11-06: an auth
		// that died before pairing left the row behind and blocked the retry
		// with already_linked).
		const existing = await this.linkRepo.findOneBy({ retreatId, userId });
		const alreadyLinked = existing && existing.status === 'connected';
		if (alreadyLinked) return 'already_linked';
		if (activeCount >= config.waBridge.maxSessions) return 'cap_reached';
		return null;
	}

	/** Creates (or reuses) the link and starts the QR flow. */
	async startLink(retreatId: string, user: User): Promise<WaLinkStartResult> {
		const reason = await this.canLink(retreatId, user.id);
		if (reason) return { ok: false, reason };

		let link = await this.linkRepo.findOneBy({ retreatId, userId: user.id });
		if (!link) {
			// storePath needs the id BEFORE the save: uuid assigned by hand (the
			// 0700 mkdir comes right after).
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

		// The store is created BEFORE saving the row: if dataDir is not
		// writable, the failure leaves no orphan pending row that would later
		// block with already_linked (QA 2026-11-06). Clean store: a re-linked
		// account inherits no previous session or history.
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
					// Display-only: bare digits, no per-country normalization (only
					// the owner sees them; they never go to third parties).
					link.linkedPhone = status.phone
						? String(status.phone).replace(/\D/g, '') || null
						: null;
				} catch {
					// auth status may hit the lock during the bootstrap: it does not
					// block the transition.
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
				// Informational sync noise (real QA 2026-11-06/07): group messages
				// whose payload wacli does not render — logged, kept off the board
				// and the modal.
				if (/stored message .* without content|unhandled payload|history sync suppressed/i.test(rawMessage)) {
					console.log(`[waBridge][${linkId}] wacli notice: ${rawMessage}`);
					return;
				}
				// Known errors → actionable instruction for the staff (v1.1: the
				// board says what to do, not just the raw error).
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
				// Bootstrap finished: is it paired? If so, move on to sync.
				try {
					const status = await authStatus(link.storePath);
					if (status.authenticated) {
						supervisor?.startSync();
						await this.handleSupervisorEvent(linkId, { type: 'connected' });
					} else if (link.status !== 'qr') {
						// The QR expired or the user closed it: the supervisor does not
						// restart auth on its own; the user retries from the UI.
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
				// sync died: the supervisor schedules a restart with backoff; the
				// status stays 'error' until it reconnects.
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

	/** Full unlink: logout + rm of the store + explicit deletes (teardownLink). */
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
	 * Per-retreat activation (D13): superadmin only (checked by the controller).
	 * Turning it off TERMINATES every link of the retreat (D14): stores are
	 * session keys of personal accounts — a disabled retreat cannot keep live
	 * sessions.
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

	/** Terminates EVERY bridge session of a retreat (D14, superadmin). */
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

	/** Stops and unregisters the link's supervisor; waits for a clean stop. */
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
			// Without the superadmin's activation no child is started (D13).
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
	 * Total unread of the retreat FOR THIS user (sidebar badge, v1.1): incoming
	 * messages newer than the read state of their chat. Only chats the user can
	 * see count (v1.4): emergency-contact chats need participant:health.
	 */
	async countUnreadForUser(
		retreatId: string,
		userId: string,
		canSeeEmergencyContacts: boolean,
	): Promise<number> {
		// Incoming only (v1.3 stores the staff's own replies too) and resolved in
		// SQL: the badge polls every 60 s from every open sidebar. Grouped by
		// phone so visibility is decided per chat, not per message.
		const rows: Array<{ chatPhone: string; unread: number }> = await AppDataSource.query(
			`SELECT m.chatPhone AS chatPhone, COUNT(*) AS unread
			   FROM whatsapp_inbox_message m
			   LEFT JOIN whatsapp_inbox_read_state rs
			     ON rs.retreatId = m.retreatId AND rs.chatJid = m.chatJid AND rs.userId = ?
			  WHERE m.retreatId = ? AND m.fromMe = 0
			    AND (rs.lastSeenMessageTimestamp IS NULL
			         OR julianday(m.timestamp) > julianday(rs.lastSeenMessageTimestamp))
			  GROUP BY m.chatPhone`,
			[userId, retreatId],
		);
		if (rows.length === 0) return 0;
		const index = await this.getSenderIndex(retreatId);
		return rows.reduce(
			(total, row) =>
				this.isChatVisible(index.get(row.chatPhone), canSeeEmergencyContacts)
					? total + Number(row.unread)
					: total,
			0,
		);
	}

	/**
	 * Consolidated conversation list for one user (v1.3): aggregated in SQL —
	 * the previous version loaded every message of the retreat into memory on
	 * each refetch, and every open inbox refetches on every new message.
	 *
	 * Per chat: counts, unread for this user (incoming only), the last message
	 * (preview + type + direction) and the last staff reply with its author, so
	 * the list can say "answered by X" vs "awaiting reply".
	 *
	 * v1.4: each chat says who wrote it (the walker or an emergency contact)
	 * and which walkers it is grouped under. Emergency-contact chats are left
	 * out without participant:health; chats that no longer resolve to anyone
	 * (cancelled walker, edited phone) are left out for everybody.
	 */
	async listConversations(
		retreatId: string,
		userId: string,
		canSeeEmergencyContacts: boolean,
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
		const index = await this.getSenderIndex(retreatId);
		const visible = aggregates.filter((row) =>
			this.isChatVisible(index.get(row.chatPhone), canSeeEmergencyContacts),
		);
		if (visible.length === 0) return [];

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

		return visible
			.map((row) => {
				// Visible ⇒ resolved (isChatVisible rejects unknown chats).
				const match = index.get(row.chatPhone)!;
				const senderKind = senderKindOf(match);
				const walkers = senderKind === 'walker' ? match.walkers : contactWalkers(match);
				const primary = walkers[0];
				const contact = senderKind === 'emergency_contact' ? match.emergencyFor[0] : undefined;
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
					senderKind,
					contact: contact
						? { name: contact.contactName, relation: contact.relation, slot: contact.slot }
						: null,
					forWalkers: walkers.map((walker) => ({
						participantId: walker.id,
						firstName: walker.firstName,
						lastName: walker.lastName,
					})),
					participantId: primary?.id ?? null,
					participantFirstName: primary?.firstName ?? '',
					participantLastName: primary?.lastName ?? '',
					country: primary?.country ?? null,
					// Phone shared by several walkers (a couple); contacts use forWalkers.
					sharedWith:
						senderKind === 'walker'
							? walkers.slice(1).map((walker) => ({
									id: walker.id,
									firstName: walker.firstName,
									lastName: walker.lastName,
								}))
							: [],
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
	 * Text search over stored bodies (v1.1). ACCENT-INSENSITIVE: walkers write
	 * "sabana" or "sábana" interchangeably — NFD folding happens in memory
	 * (SQLite LIKE is byte-wise and would not fold "sábana" to "sabana"), over
	 * the whole retreat in chunks. It ALSO matches the walker's NAME — a name
	 * hit returns that person's whole chat (search by person, not only by
	 * word).
	 *
	 * v1.4: an emergency-contact chat matches by the contact's name and
	 * relation and by the walker's name ("Juan" also finds Juan's mother).
	 * Chats the caller cannot see are skipped (participant:health, D22).
	 */
	async searchMessages(
		retreatId: string,
		q: string,
		options: {
			canSeeEmergencyContacts: boolean;
			index?: Map<string, WaSenderMatch>;
			limit?: number;
		},
	): Promise<
		Array<Pick<WhatsappInboxMessage, 'id' | 'chatJid' | 'chatPhone' | 'timestamp' | 'body' | 'messageType'>>
	> {
		const limit = options.limit ?? 30;
		const strip = (s: string) =>
			s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
		const needle = strip(q);
		if (!needle) return [];

		const index = options.index ?? (await this.getSenderIndex(retreatId));
		const visiblePhones = new Set<string>();
		const nameMatchedPhones = new Set<string>();
		for (const [digits, match] of index) {
			if (!this.isChatVisible(match, options.canSeeEmergencyContacts)) continue;
			visiblePhones.add(digits);
			const names =
				senderKindOf(match) === 'walker'
					? match.walkers.map((walker) => `${walker.firstName} ${walker.lastName}`)
					: match.emergencyFor.flatMap((entry) => [
							entry.contactName,
							entry.relation,
							`${entry.participant.firstName} ${entry.participant.lastName}`,
						]);
			if (names.some((name) => strip(name).includes(needle))) nameMatchedPhones.add(digits);
		}
		if (visiblePhones.size === 0) return [];

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
				if (!visiblePhones.has(row.chatPhone)) continue;
				const bodyHit = Boolean(row.body) && strip(row.body!).includes(needle);
				const chatHit = nameMatchedPhones.has(row.chatPhone);
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
	 * JID digits → who the chat belongs to (v1.4, D22): the walkers of the
	 * retreat with that phone and/or the walkers who listed it as an emergency
	 * contact (cell, home or work phone of slot 1 or 2). The single source of
	 * phone → person resolution in the bridge — whitelist, names, permission
	 * gating and prefills all read it.
	 *
	 * A walker match wins (a couple listing each other as contact is a walker
	 * chat). A contact of several walkers (siblings) lists them all. Contacts
	 * have no country of their own: the walker's country is used (same rule as
	 * messageSequenceService.resolveRecipient for the "family" audience).
	 * Recomputed every poll: cheap, and it picks up late registrations.
	 */
	async getSenderIndex(retreatId: string): Promise<Map<string, WaSenderMatch>> {
		const registrations = await AppDataSource.getRepository(RetreatParticipant).find({
			where: { retreatId, type: 'walker', isCancelled: false },
			order: { createdAt: 'DESC' },
			select: ['participantId'],
		});
		const participantIds = registrations
			.map((reg) => reg.participantId)
			.filter((id): id is string => Boolean(id));
		const index = new Map<string, WaSenderMatch>();
		if (participantIds.length === 0) return index;
		const walkers = await AppDataSource.getRepository(Participant).find({
			where: participantIds.map((id) => ({ id })),
		});
		const walkerById = new Map(walkers.map((walker) => [walker.id, walker]));
		const entry = (digits: string): WaSenderMatch => {
			let match = index.get(digits);
			if (!match) {
				match = { walkers: [], emergencyFor: [] };
				index.set(digits, match);
			}
			return match;
		};
		const digitsOf = (phone: string | null | undefined, country: string): string[] => {
			if (!phone) return [];
			const national = toNationalPhone(phone, country);
			return national ? acceptedJidDigitVariants(national, country) : [];
		};

		for (const reg of registrations) {
			const walker = reg.participantId ? walkerById.get(reg.participantId) : undefined;
			if (!walker?.country) continue;
			for (const digits of digitsOf(walker.cellPhone, walker.country)) {
				const match = entry(digits);
				if (!match.walkers.some((p) => p.id === walker.id)) match.walkers.push(walker);
			}
			for (const slot of [1, 2] as const) {
				const contactName = (slot === 1 ? walker.emergencyContact1Name : walker.emergencyContact2Name) ?? '';
				const relation =
					(slot === 1 ? walker.emergencyContact1Relation : walker.emergencyContact2Relation) ?? '';
				const phones =
					slot === 1
						? [
								walker.emergencyContact1CellPhone,
								walker.emergencyContact1HomePhone,
								walker.emergencyContact1WorkPhone,
							]
						: [
								walker.emergencyContact2CellPhone,
								walker.emergencyContact2HomePhone,
								walker.emergencyContact2WorkPhone,
							];
				const seen = new Set<string>();
				for (const phone of phones) {
					for (const digits of digitsOf(phone, walker.country)) {
						if (seen.has(digits)) continue;
						seen.add(digits);
						const match = entry(digits);
						if (!match.emergencyFor.some((e) => e.participant.id === walker.id && e.slot === slot)) {
							match.emergencyFor.push({ participant: walker, slot, contactName, relation });
						}
					}
				}
			}
		}
		return index;
	}

	/**
	 * JID digits → walkers sharing that phone (most recent registration first).
	 * Walker chats only; derived from getSenderIndex.
	 */
	async getWalkerDigitsIndex(retreatId: string): Promise<Map<string, Participant[]>> {
		const index = await this.getSenderIndex(retreatId);
		const out = new Map<string, Participant[]>();
		for (const [digits, match] of index) {
			if (match.walkers.length) out.set(digits, match.walkers);
		}
		return out;
	}

	/** JID digits → the primary walker of a walker chat (derived from getSenderIndex). */
	async getWalkerDigitsMap(retreatId: string): Promise<Map<string, Participant>> {
		const index = await this.getWalkerDigitsIndex(retreatId);
		const map = new Map<string, Participant>();
		for (const [digits, walkers] of index) map.set(digits, walkers[0]);
		return map;
	}

	/**
	 * Visibility of a chat for a user (v1.4, D22): an emergency-contact chat
	 * carries SENSITIVE_HEALTH_FIELDS data (who the contact is), so it exists
	 * only for users with participant:health. Unknown chats are not visible.
	 */
	isChatVisible(match: WaSenderMatch | undefined, canSeeEmergencyContacts: boolean): boolean {
		if (!match) return false;
		return senderKindOf(match) === 'walker' || canSeeEmergencyContacts;
	}

	/**
	 * ON-DEMAND download of a message's image as a data-URL ready for the
	 * payment modal's `receiptPhoto` (FR14/D15, v1.1).
	 *
	 * `media download --read-only` takes no store lock, so it runs next to the
	 * live sync. The image is NEVER persisted in the inbox tables: it lives in
	 * the modal and, once saved, in Payment.receiptUrl (payment-receipts/).
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
	async downloadRawMedia(message: WhatsappInboxMessage): Promise<WaRawMedia> {
		const link = await this.linkRepo.findOneBy({ id: message.linkId });
		if (!link) {
			throw new WacliError(
				'El archivo ya no está disponible: la sesión que lo recibió fue desvinculada o purgada.',
			);
		}
		const cap = RAW_MEDIA_MAX_BYTES[message.messageType] ?? DOCUMENT_MAX_BYTES;
		const outPath = `${this.mediaTmpDir()}/${message.id}.bin`;
		let buffer: Buffer;
		try {
			await mediaDownload(link.storePath, message.chatJid, message.waMessageId, outPath);
			const stat = fs.statSync(outPath);
			if (stat.size > cap) {
				throw new WaMediaRejectedError(
					'too_large',
					`El archivo pesa ${(stat.size / 1048576).toFixed(1)} MB (tope ${cap / 1048576} MB).`,
				);
			}
			buffer = fs.readFileSync(outPath);
		} finally {
			fs.rmSync(outPath, { force: true });
		}
		return classifyRawMedia(message, buffer);
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
const VIDEO_MAX_BYTES = 16 * 1024 * 1024;
const RAW_MEDIA_MAX_BYTES: Record<string, number> = {
	audio: AUDIO_MAX_BYTES,
	video: VIDEO_MAX_BYTES,
	document: DOCUMENT_MAX_BYTES,
};

/**
 * How the browser may show a downloaded file (v1.5). Everything that is not
 * an image, a PDF, plain text, audio or video is handed to the system
 * ("download") — never rendered by the page.
 */
export type WaRawPreviewKind = 'audio' | 'video' | 'image' | 'pdf' | 'text' | 'download';

export interface WaRawMedia {
	buffer: Buffer;
	/** Verified from the bytes for documents and video; never the sender's claim. */
	mime: string;
	fileName: string;
	previewKind: WaRawPreviewKind;
}

/** A file the inbox does not hand out (v1.5): too large, macros, or a risky type. */
export class WaMediaRejectedError extends Error {
	constructor(
		public readonly reason: 'too_large' | 'macros' | 'unsupported',
		message: string,
	) {
		super(message);
		this.name = 'WaMediaRejectedError';
	}
}

/** Extension for a sender-declared type, used only when the file has no name. */
const EXT_BY_DECLARED_MIME: Record<string, string> = {
	'application/pdf': 'pdf',
	'application/msword': 'doc',
	'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
	'application/vnd.ms-powerpoint': 'ppt',
	'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
	'application/vnd.ms-excel': 'xls',
	'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
	'application/vnd.oasis.opendocument.text': 'odt',
	'application/vnd.oasis.opendocument.presentation': 'odp',
	'application/vnd.oasis.opendocument.spreadsheet': 'ods',
	'text/plain': 'txt',
};

const EXT_BY_VERIFIED_MIME: Record<string, string> = {
	...EXT_BY_DECLARED_MIME,
	'image/jpeg': 'jpg',
	'image/png': 'png',
	'image/gif': 'gif',
	'image/webp': 'webp',
	'image/heic': 'heic',
	'video/mp4': 'mp4',
	'video/quicktime': 'mov',
};

/**
 * Decides what the inbox may do with a downloaded file (v1.5, D26). Documents
 * go through the letters' classifier (specs/letters-email): the type comes
 * from the bytes (magic + container) and the extension, the sender's MIME is
 * ignored, and macros, executables, archives, HTML and SVG are refused — an
 * HTML "document" opened from a blob would run with the app's origin. Voice
 * notes only ever play in <audio>; videos must be an ISO-BMFF (mp4/mov).
 */
export function classifyRawMedia(message: WhatsappInboxMessage, buffer: Buffer): WaRawMedia {
	const id = message.id.slice(0, 8);
	if (message.messageType === 'audio') {
		const declared = message.mediaMime ?? '';
		const mime = declared.startsWith('audio/') ? declared.split(';')[0] : 'audio/ogg';
		return { buffer, mime, fileName: message.mediaFileName || `nota-de-voz-${id}.ogg`, previewKind: 'audio' };
	}
	if (message.messageType === 'video') {
		const isoBmff = buffer.length > 12 && buffer.subarray(4, 8).toString('ascii') === 'ftyp';
		if (!isoBmff) {
			throw new WaMediaRejectedError('unsupported', 'Este video no está en un formato que el navegador reproduzca.');
		}
		const mime = buffer.subarray(8, 12).toString('ascii') === 'qt  ' ? 'video/quicktime' : 'video/mp4';
		return {
			buffer,
			mime,
			fileName: message.mediaFileName || `video-${id}.${EXT_BY_VERIFIED_MIME[mime]}`,
			previewKind: 'video',
		};
	}
	const declaredExt = EXT_BY_DECLARED_MIME[(message.mediaMime ?? '').split(';')[0]];
	const nameForType = message.mediaFileName || (declaredExt ? `archivo.${declaredExt}` : '');
	const classified = classifyAttachment(buffer, nameForType);
	if (classified.kind === 'rejected') {
		throw new WaMediaRejectedError(
			classified.reason,
			classified.reason === 'macros'
				? 'Este documento trae macros y no se abre desde la bandeja por seguridad. Si confías en quien lo mandó, ábrelo desde tu WhatsApp.'
				: 'Este tipo de archivo no se abre desde la bandeja por seguridad (se abren PDF, Word, PowerPoint, Excel, OpenDocument, texto e imágenes). Si confías en quien lo mandó, ábrelo desde tu WhatsApp.',
		);
	}
	const previewKind: WaRawPreviewKind = classified.browserSafe
		? 'image'
		: classified.mime === 'application/pdf'
			? 'pdf'
			: classified.mime === 'text/plain'
				? 'text'
				: 'download';
	return {
		buffer,
		mime: classified.mime,
		fileName: message.mediaFileName || `whatsapp-${id}.${EXT_BY_VERIFIED_MIME[classified.mime] ?? 'bin'}`,
		previewKind,
	};
}

/**
 * Cache of downloaded image variants: 30 min, 40 entries (~8 MB worst case).
 * 40 > the 30-image thread batch, so reopening a thread does not thrash.
 */
const RECEIPT_CACHE_TTL_MS = 30 * 60 * 1000;
const RECEIPT_CACHE_MAX_ENTRIES = 40;

/** Content-type by magic bytes (JPEG/PNG/WebP); falls back to image/jpeg. */
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

/** Who a chat belongs to (v1.4): walkers with that phone and/or walkers who listed it as contact. */
export interface WaSenderMatch {
	walkers: Participant[];
	emergencyFor: Array<{ participant: Participant; slot: 1 | 2; contactName: string; relation: string }>;
}

export type WaSenderKind = 'walker' | 'emergency_contact';

/** A walker match wins over an emergency-contact match. */
export function senderKindOf(match: WaSenderMatch): WaSenderKind {
	return match.walkers.length ? 'walker' : 'emergency_contact';
}

/** Walkers that listed this number as an emergency contact, without repeats. */
export function contactWalkers(match: WaSenderMatch): Participant[] {
	const seen = new Set<string>();
	const out: Participant[] = [];
	for (const entry of match.emergencyFor) {
		if (seen.has(entry.participant.id)) continue;
		seen.add(entry.participant.id);
		out.push(entry.participant);
	}
	return out;
}

/** The participant a chat is primarily about (prefills payments and letters). */
export function primaryParticipantOf(match: WaSenderMatch | undefined): Participant | undefined {
	return match?.walkers[0] ?? match?.emergencyFor[0]?.participant;
}

/** "Mamá — María (contacto de Juan Pérez)" style label for toasts and letters. */
export function senderDisplayName(match: WaSenderMatch | undefined, fallback: string): string {
	if (!match) return fallback;
	if (match.walkers.length) {
		return match.walkers.map((w) => `${w.firstName} ${w.lastName}`.trim()).join(' y ');
	}
	const first = match.emergencyFor[0];
	if (!first) return fallback;
	const who = [first.relation, first.contactName].filter(Boolean).join(' — ') || fallback;
	const of = match.emergencyFor
		.map((e) => `${e.participant.firstName} ${e.participant.lastName}`.trim())
		.join(' y ');
	return `${who} (contacto de ${of})`;
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
	senderKind: WaSenderKind;
	contact: { name: string; relation: string; slot: 1 | 2 } | null;
	forWalkers: Array<{ participantId: string; firstName: string; lastName: string }>;
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
