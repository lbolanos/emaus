import { AppDataSource } from '../../data-source';
import { config } from '../../config';
import { Retreat } from '../../entities/retreat.entity';
import { WhatsappBridgeLink } from '../../entities/whatsappBridgeLink.entity';
import { WhatsappInboxMessage } from '../../entities/whatsappInboxMessage.entity';
import { domainAuditService } from '../domainAuditService';
import { DomainAuditAction } from '@repo/types';
import { emitInboxChanged } from '../../realtime';
import { listChats, listMessages, type WacliChat, type WacliMessage } from './wacliClient';
import { waBridgeService } from './waBridgeService';

/**
 * Polling ingestion (specs/whatsapp-inbox D8): every cycle, for each connected
 * link, reads the store's chats one-shot, applies the walker whitelist and
 * stores the messages of chats that pass it (incoming, and since v1.3 the
 * staff's own replies). Nothing outside the whitelist is read in depth or
 * stored, ever.
 *
 * The store lock may reject reads while `sync` or a bootstrap imports
 * history: tolerated and retried next cycle, never crashing. The error audit
 * is rate-limited (1 per link every 10 min) so expected lock contention does
 * not flood the table.
 */

const ONE_TO_ONE_JID = /^\d+@s\.whatsapp\.net$/;
const AUDIT_ERROR_COOLDOWN_MS = 10 * 60 * 1000;
const LOOKBACK_MINUTES = 5;

/** Digits of a 1:1 JID (null for @g.us groups, @lid or odd shapes). */
export function jidToDigits(jid: string | undefined | null): string | null {
	if (!jid || !ONE_TO_ONE_JID.test(jid)) return null;
	return jid.split('@')[0] || null;
}

/**
 * Whitelist (pure, testable): keeps only 1:1 chats whose JID digits are in the
 * retreat's accepted index (with per-country variants, e.g. `52…` and `521…`
 * for MX). Groups, lists and unknown chats stay out.
 */
export function filterWhitelistedChats(
	chats: WacliChat[],
	acceptedJidDigits: Set<string>,
): WacliChat[] {
	return chats.filter((chat) => {
		const digits = jidToDigits(chat?.jid);
		return digits !== null && acceptedJidDigits.has(digits);
	});
}

/**
 * Normalizes a raw wacli message into a storable row; null when it lacks an id
 * or a timestamp. `fromMe` is kept (v1.3: staff replies power "answered by").
 *
 * The real v0.21.0 store uses PascalCase (MsgID/ChatJID/Timestamp/FromMe/Text/
 * MediaType — verified against the binary in the real QA 2026-11-06); the
 * normalizer also accepts camelCase in case wacli changes shape.
 */
export function normalizeWacliMessage(
	raw: WacliMessage,
	chatJid: string,
	chatPhone: string,
): Pick<
	WhatsappInboxMessage,
	| 'chatJid'
	| 'chatPhone'
	| 'waMessageId'
	| 'timestamp'
	| 'fromMe'
	| 'body'
	| 'messageType'
	| 'mediaMime'
	| 'mediaFileName'
> | null {
	const r = raw as Record<string, unknown>;
	const pick = (...keys: string[]): string => {
		for (const key of keys) {
			const v = r[key];
			if (typeof v === 'string' && v.length > 0) return v;
		}
		return '';
	};

	const waMessageId = pick('MsgID', 'id', 'messageId');
	if (!waMessageId) return null;

	const tsRaw = r.Timestamp ?? r.timestamp;
	let timestamp: Date | null = null;
	if (typeof tsRaw === 'string' || typeof tsRaw === 'number') {
		const parsed = new Date(tsRaw);
		if (!Number.isNaN(parsed.getTime())) timestamp = parsed;
	}
	if (!timestamp) return null;
	const fromMeRaw = r.FromMe ?? r.fromMe;
	const fromMe = fromMeRaw === true || String(fromMeRaw).toLowerCase() === 'true';

	// MediaCaption: the text a walker types on a photo ("here is my payment")
	// lives there, not in Text — it used to be dropped.
	const body = pick('Text', 'Body', 'body', 'MediaCaption');
	const messageType = pick('MediaType', 'messageType') || 'text';
	const mediaMime = pick('MimeType', 'mimeType');
	const mediaFileName = pick('Filename', 'fileName');
	return {
		chatJid,
		chatPhone,
		waMessageId,
		timestamp,
		fromMe,
		body: body || null,
		messageType,
		mediaMime: mediaMime ? mediaMime.slice(0, 100) : null,
		mediaFileName: mediaFileName ? mediaFileName.slice(0, 255) : null,
	};
}

/** Max pages read per chat per cycle (50 messages each). */
const MAX_PAGES_PER_CHAT = 10;
const PAGE_SIZE = 50;

export class WaBridgePoller {
	private timer: NodeJS.Timeout | null = null;
	private running = false;
	private lastErrorAuditAt = new Map<string, number>();
	private lastLidLogAt = new Map<string, number>();

	start(): void {
		if (this.timer) return;
		this.timer = setInterval(() => {
			void this.pollAll();
		}, config.waBridge.pollSeconds * 1000);
		this.timer.unref();
	}

	stop(): void {
		if (this.timer) {
			clearInterval(this.timer);
			this.timer = null;
		}
	}

	async pollAll(): Promise<void> {
		if (this.running || !config.waBridge.enabled) return;
		this.running = true;
		try {
			// Watchdog: a paired link ('connected' or 'error') without a
			// supervisor gets one back (deploys, crashed restarts).
			await waBridgeService.respawnFromDb().catch((err: Error) => {
				console.error(`[waBridge] supervisor watchdog failed: ${err.message}`);
			});
			const links = await AppDataSource.getRepository(WhatsappBridgeLink).find({
				where: { status: 'connected' },
			});
			// Only retreats whose inbox the superadmin enabled (D13).
			let enabledRetreatIds: Set<string> | null = null;
			if (links.length > 0) {
				const retreatIds = Array.from(new Set(links.map((l) => l.retreatId)));
				const retreats = await AppDataSource.getRepository(Retreat).findByIds(retreatIds);
				enabledRetreatIds = new Set(
					retreats.filter((r) => r.whatsappInboxEnabled).map((r) => r.id),
				);
			}
			for (const link of links) {
				if (enabledRetreatIds && !enabledRetreatIds.has(link.retreatId)) continue;
				try {
					await this.pollLink(link);
				} catch (err) {
					await this.recordError(link, err as Error);
				}
			}
		} finally {
			this.running = false;
		}
	}

	private async pollLink(link: WhatsappBridgeLink): Promise<void> {
		const digitsMap = await waBridgeService.getWalkerDigitsMap(link.retreatId);
		const chats = await listChats(link.storePath, 100);
		this.noteDiscardedLidChats(link, chats);
		const whitelisted = filterWhitelistedChats(chats, new Set(digitsMap.keys()));
		if (whitelisted.length === 0) {
			await this.touchSync(link);
			return;
		}

		const afterIso = this.lookbackIso(link.lastSyncAt);
		const messageRepo = AppDataSource.getRepository(WhatsappInboxMessage);
		let insertedIncoming = 0;
		let insertedTotal = 0;
		let lastSenderName: string | null = null;
		let lastPreview: string | null = null;
		for (const chat of whitelisted) {
			const chatPhone = jidToDigits(chat.jid) ?? '';
			const participant = digitsMap.get(chatPhone);
			// Page forward (asc) from the window start: a single `--limit 50`
			// returned the 50 OLDEST messages and dropped the rest of a burst.
			let pageAfter = afterIso;
			for (let page = 0; page < MAX_PAGES_PER_CHAT; page++) {
				const messages = await listMessages(link.storePath, chat.jid, {
					limit: PAGE_SIZE,
					afterIso: pageAfter,
				});
				for (const raw of messages) {
					const normalized = normalizeWacliMessage(raw, chat.jid, chatPhone);
					if (!normalized) continue;
					// UNIQUE(linkId, waMessageId) dedupes; orIgnore turns a re-poll
					// into a no-op and `changes` counts the real inserts.
					const result = await messageRepo
						.createQueryBuilder()
						.insert()
						.into(WhatsappInboxMessage)
						.values({ ...normalized, linkId: link.id, retreatId: link.retreatId })
						.orIgnore()
						.execute();
					const changes = Number(result.raw?.changes ?? 0) || 0;
					if (changes > 0) {
						insertedTotal += changes;
						if (!normalized.fromMe) {
							insertedIncoming += changes;
							lastSenderName = participant
								? `${participant.firstName} ${participant.lastName}`.trim()
								: null;
							lastPreview = normalized.body ?? null;
						}
					}
				}
				if (messages.length < PAGE_SIZE) break;
				const lastTs = (messages[messages.length - 1] as Record<string, unknown>).Timestamp;
				if (typeof lastTs !== 'string' || lastTs === pageAfter) break;
				pageAfter = lastTs;
			}
		}
		await this.touchSync(link);
		if (insertedTotal > 0) {
			// The toast (senderName/preview) is only for walker messages; a staff
			// reply still refreshes the list ("answered by") with newCount 0.
			emitInboxChanged({
				retreatId: link.retreatId,
				newCount: insertedIncoming,
				senderName: insertedIncoming > 0 ? lastSenderName : null,
				preview: insertedIncoming > 0 ? lastPreview : null,
			});
		}
	}

	/**
	 * WhatsApp is moving contacts to `@lid` identifiers (no phone in the JID).
	 * Those chats cannot be matched to a walker and are dropped by the
	 * whitelist — log how many, at most once per link every 10 minutes, so a
	 * walker silently "missing" from the inbox is diagnosable.
	 */
	private noteDiscardedLidChats(link: WhatsappBridgeLink, chats: WacliChat[]): void {
		const lidCount = chats.filter((chat) => /@lid$/.test(String(chat?.jid ?? ''))).length;
		if (lidCount === 0) return;
		const now = Date.now();
		if (now - (this.lastLidLogAt.get(link.id) ?? 0) < AUDIT_ERROR_COOLDOWN_MS) return;
		this.lastLidLogAt.set(link.id, now);
		console.warn(
			`[waBridge][${link.id}] ${lidCount} chat(s) with @lid JIDs skipped (no phone to match a walker)`,
		);
	}

	/** Re-read window: since the last sync, with a clock-skew lookback. */
	private lookbackIso(lastSyncAt: Date | null | undefined): string | null {
		if (!lastSyncAt) return null;
		const date = new Date(lastSyncAt);
		date.setMinutes(date.getMinutes() - LOOKBACK_MINUTES);
		return date.toISOString();
	}

	private async touchSync(link: WhatsappBridgeLink): Promise<void> {
		link.lastSyncAt = new Date();
		await AppDataSource.getRepository(WhatsappBridgeLink).save(link);
	}

	private async recordError(link: WhatsappBridgeLink, err: Error): Promise<void> {
		const now = Date.now();
		const last = this.lastErrorAuditAt.get(link.id) ?? 0;
		link.lastError = err.message.slice(0, 500);
		await AppDataSource.getRepository(WhatsappBridgeLink).save(link);
		if (now - last >= AUDIT_ERROR_COOLDOWN_MS) {
			this.lastErrorAuditAt.set(link.id, now);
			void domainAuditService.log({
				action: DomainAuditAction.WA_BRIDGE_SYNC_ERROR,
				resourceType: 'whatsapp_bridge_link',
				resourceId: link.id,
				retreatId: link.retreatId,
				metadata: { system: true, message: err.message.slice(0, 300) },
			});
		}
	}
}
