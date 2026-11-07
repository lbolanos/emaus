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
 * Ingesta por polling (specs/whatsapp-inbox D8): cada ciclo, para cada link
 * conectado, lee los chats del store one-shot, aplica la whitelist de
 * caminantes y persiste solo los mensajes entrantes que pasan. Nada que no
 * pase el filtro se consulta a fondo ni se persiste jamás.
 *
 * El lock del store puede rechazar lecturas mientras `sync` o un bootstrap
 * importan historial: se tolera y reintenta el ciclo siguiente, sin crashear.
 * El audit de error va rate-limited (1 por link cada 10 min) para no inundar
 * la tabla con lock contention esperado.
 */

const ONE_TO_ONE_JID = /^\d+@s\.whatsapp\.net$/;
const AUDIT_ERROR_COOLDOWN_MS = 10 * 60 * 1000;
const LOOKBACK_MINUTES = 5;

/** Dígitos de un JID 1:1 (null para grupos @g.us, @lid o formas raras). */
export function jidToDigits(jid: string | undefined | null): string | null {
	if (!jid || !ONE_TO_ONE_JID.test(jid)) return null;
	return jid.split('@')[0] || null;
}

/**
 * Whitelist (función pura, testeable): conserva solo los chats 1:1 cuyos
 * dígitos JID están en el índice aceptado del retiro (con variantes por país,
 * p. ej. `52…` y `521…` para MX). Grupos, lists y desconocidos quedan fuera.
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
 * Normaliza un mensaje crudo de wacli a fila persistible; null si le falta id
 * o timestamp, o si es saliente (doble chequeo de --from-them).
 *
 * El store real v0.21.0 usa PascalCase (MsgID/ChatJID/Timestamp/FromMe/Text/
 * MediaType — verificado contra el binario en el QA real 2026-11-06); el
 * normalizador acepta también camelCase por si wacli cambia de forma.
 */
export function normalizeWacliMessage(
	raw: WacliMessage,
	chatJid: string,
	chatPhone: string,
): Pick<
	WhatsappInboxMessage,
	'chatJid' | 'chatPhone' | 'waMessageId' | 'timestamp' | 'fromMe' | 'body' | 'messageType'
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
	if (r.FromMe === true || r.fromMe === true) return null;

	const body = pick('Text', 'Body', 'body');
	const messageType = pick('MediaType', 'messageType') || 'text';
	return {
		chatJid,
		chatPhone,
		waMessageId,
		timestamp,
		fromMe: false,
		body: body || null,
		messageType,
	};
}

export class WaBridgePoller {
	private timer: NodeJS.Timeout | null = null;
	private running = false;
	private lastErrorAuditAt = new Map<string, number>();

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
			const links = await AppDataSource.getRepository(WhatsappBridgeLink).find({
				where: { status: 'connected' },
			});
			// Solo retiros con la bandeja activada por el superadmin (D13).
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
		const whitelisted = filterWhitelistedChats(chats, new Set(digitsMap.keys()));
		if (whitelisted.length === 0) {
			await this.touchSync(link);
			return;
		}

		const afterIso = this.lookbackIso(link.lastSyncAt);
		const messageRepo = AppDataSource.getRepository(WhatsappInboxMessage);
		let inserted = 0;
		let lastSenderName: string | null = null;
		let lastPreview: string | null = null;
		for (const chat of whitelisted) {
			const chatPhone = jidToDigits(chat.jid) ?? '';
			const participant = digitsMap.get(chatPhone);
			const messages = await listMessages(link.storePath, chat.jid, {
				limit: 50,
				afterIso,
			});
			for (const raw of messages) {
				const normalized = normalizeWacliMessage(raw, chat.jid, chatPhone);
				if (!normalized) continue;
				// El índice UNIQUE(linkId, waMessageId) hace el dedupe; orIgnore
				// convierte el re-poll en no-op y `changes` cuenta los reales.
				const result = await messageRepo
					.createQueryBuilder()
					.insert()
					.into(WhatsappInboxMessage)
					.values({ ...normalized, linkId: link.id, retreatId: link.retreatId })
					.orIgnore()
					.execute();
				const changes = Number(result.raw?.changes ?? 0) || 0;
				if (changes > 0) {
					inserted += changes;
					lastSenderName = participant
						? `${participant.firstName} ${participant.lastName}`.trim()
						: null;
					lastPreview = normalized.body ?? null;
				}
			}
		}
		await this.touchSync(link);
		if (inserted > 0) {
			emitInboxChanged({
				retreatId: link.retreatId,
				newCount: inserted,
				senderName: lastSenderName,
				preview: lastPreview,
			});
		}
	}

	/** Ventana de re-lectura: desde la última sync, con lookback por relojes. */
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
