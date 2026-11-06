import * as fs from 'fs';
import { randomUUID } from 'crypto';
import { AppDataSource } from '../../data-source';
import { config } from '../../config';
import { Participant } from '../../entities/participant.entity';
import { Retreat } from '../../entities/retreat.entity';
import { User } from '../../entities/user.entity';
import { WhatsappBridgeLink } from '../../entities/whatsappBridgeLink.entity';
import { domainAuditService } from '../domainAuditService';
import {
	toNationalPhone,
	DomainAuditAction,
	PHONE_CALLING_CODE_BY_COUNTRY,
} from '@repo/types';
import { resolveSafeTimeZone } from '../../utils/date.transformer';
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

export type WaLinkRefusalReason = 'disabled' | 'outside_window' | 'cap_reached' | 'already_linked';

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
		await this.linkRepo.save(link);

		// Store limpio: un re-vinculado no hereda sesión ni historial previo.
		fs.rmSync(link.storePath, { recursive: true, force: true });
		fs.mkdirSync(link.storePath, { recursive: true, mode: 0o700 });

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
			actorUserId: user.id,
			metadata: { system: false },
		});
	}

	/**
	 * Dígitos JID aceptados para el retiro (D4): para cada caminante, su número
	 * nacional + variantes de lada según su país. Se recalcula en cada ciclo:
	 * barato (cientos de filas) y captura inscripciones tardías. El filtro
	 * canónico del repo: type='walker' AND isCancelled=0.
	 */
	async getWalkerJidDigitIndex(retreatId: string): Promise<Set<string>> {
		const walkers = await AppDataSource.getRepository(Participant).find({
			where: { retreatId, type: 'walker', isCancelled: false },
			select: ['cellPhone', 'country'],
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
}

export const waBridgeService = new WaBridgeService();
