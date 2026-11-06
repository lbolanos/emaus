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
		const existing = await this.linkRepo.findOneBy({ retreatId, userId });
		const alreadyLinked = existing && existing.status !== 'expired';
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
				const firstLink = link.status !== 'connected';
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
			case 'error':
				link.lastError = (event.message ?? 'unknown wacli error').slice(0, 500);
				if (link.status === 'connected') {
					link.status = 'error';
				}
				await this.linkRepo.save(link);
				return;
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
	 * Teardown común de un vínculo (unlink del dueño, terminación del
	 * superadmin y retención): stop del supervisor, logout best-effort, rm del
	 * store y DELETE (el CASCADE borra mensajes y read-state).
	 */
	private async teardownLink(
		link: WhatsappBridgeLink,
		opts: { actorUserId?: string | null; system: boolean },
	): Promise<void> {
		await this.stopSupervisorById(link.id);
		try {
			await wacliLogout(link.storePath);
		} catch {
			// Logout best-effort: si wacli falla (store ya ido, sesión muerta),
			// el rm y el DELETE garantizan el borrado local de todos modos.
		}
		fs.rmSync(link.storePath, { recursive: true, force: true });
		this.qrCache.delete(link.id);
		await this.linkRepo.remove(link);

		void domainAuditService.log({
			action: DomainAuditAction.WA_BRIDGE_UNLINKED,
			resourceType: 'whatsapp_bridge_link',
			resourceId: link.id,
			retreatId: link.retreatId,
			actorUserId: opts.actorUserId ?? null,
			metadata: { system: opts.system },
		});
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

	/** Respawn al boot: links 'connected' dentro de la gracia post-retiro. */
	async respawnFromDb(): Promise<{ respawned: number }> {
		if (!config.waBridge.enabled) return { respawned: 0 };
		if (!fs.existsSync(config.waBridge.wacliBin)) {
			if (!this.warnedBinaryMissing) {
				console.warn(
					`[waBridge] wacli binary not found at ${config.waBridge.wacliBin}; bridge stays inert`,
				);
				this.warnedBinaryMissing = true;
			}
			return { respawned: 0 };
		}
		const links = await this.linkRepo.find({ where: { status: 'connected' } });
		let respawned = 0;
		for (const link of links) {
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
		const messages = await AppDataSource.getRepository(WhatsappInboxMessage).find({
			where: { retreatId },
			select: ['chatJid', 'timestamp'],
		});
		if (messages.length === 0) return 0;
		const states = await AppDataSource.getRepository(WhatsappInboxReadState).find({
			where: { retreatId, userId },
		});
		const lastSeen = new Map(
			states.map((state) => [state.chatJid, state.lastSeenMessageTimestamp]),
		);
		let unread = 0;
		for (const message of messages) {
			const seen = lastSeen.get(message.chatJid);
			if (!seen || message.timestamp > seen) unread += 1;
		}
		return unread;
	}

	/**
	 * Búsqueda de texto sobre los cuerpos persistidos (v1.1). IGNORA ACENTOS:
	 * los caminantes escriben "sabana" o "sábana" indistinto — se normaliza
	 * NFD sin diacríticos en memoria (los últimos 500 mensajes; LIKE de SQLite
	 * es byte-wise y no plegaría "sábana" contra "sabana").
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
		const rows = await AppDataSource.getRepository(WhatsappInboxMessage).find({
			where: { retreatId },
			select: ['id', 'chatJid', 'chatPhone', 'timestamp', 'body', 'messageType'],
			order: { timestamp: 'DESC' },
			take: 500,
		});
		return rows
			.filter((row) => row.body && strip(row.body).includes(needle))
			.slice(0, limit);
	}

	/**
	 * Mapa dígitos-JID → participante caminante del retiro (FR14): lo consume
	 * la bandeja para mostrar el nombre y prellenar el pago. Mismo cálculo del
	 * índice del poller, expuesto para el controller.
	 */
	async getWalkerDigitsMap(retreatId: string): Promise<Map<string, Participant>> {
		const registrations = await AppDataSource.getRepository(RetreatParticipant).find({
			where: { retreatId, type: 'walker', isCancelled: false },
			select: ['participantId'],
		});
		const participantIds = registrations
			.map((reg) => reg.participantId)
			.filter((id): id is string => Boolean(id));
		const map = new Map<string, Participant>();
		if (participantIds.length === 0) return map;
		const walkers = await AppDataSource.getRepository(Participant).find({
			where: participantIds.map((id) => ({ id })),
		});
		for (const walker of walkers) {
			if (!walker.cellPhone || !walker.country) continue;
			const national = toNationalPhone(walker.cellPhone, walker.country);
			if (!national) continue;
			for (const digits of acceptedJidDigitVariants(national, walker.country)) {
				if (!map.has(digits)) map.set(digits, walker);
			}
		}
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
		const link = await this.linkRepo.findOneByOrFail({ id: message.linkId });
		const tmpDir = `${config.waBridge.dataDir}/receipts-tmp`;
		fs.mkdirSync(tmpDir, { recursive: true, mode: 0o700 });
		const outPath = `${tmpDir}/${message.id}.img`;

		await this.stopSupervisorById(link.id);
		try {
			await mediaDownload(link.storePath, message.chatJid, message.waMessageId, outPath);
			const stat = fs.statSync(outPath);
			if (stat.size > RECEIPT_MAX_BYTES) {
				throw new WacliError(`La imagen pesa ${(stat.size / 1048576).toFixed(1)} MB (tope 10 MB)`);
			}
			const buffer = fs.readFileSync(outPath);
			const processed = await imageService.processPhoto(buffer, detectImageContentType(buffer));
			return `data:${processed.contentType};base64,${processed.buffer.toString('base64')}`;
		} finally {
			fs.rmSync(outPath, { force: true });
			// El sync vuelve a correr tengamos éxito o no: la bandeja no queda muerta.
			const supervisor = this.createSupervisor(link);
			supervisor.startSync();
		}
	}
}

/** Tope de una imagen de comprobante descargada (10 MB — foto de teléfono). */
const RECEIPT_MAX_BYTES = 10 * 1024 * 1024;

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

export const waBridgeService = new WaBridgeService();
