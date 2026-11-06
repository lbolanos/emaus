import { config } from '../../config';
import { waBridgeService } from './waBridgeService';
import { WaBridgePoller } from './waBridgePoller';
import { waBridgeRetentionService } from './waBridgeRetentionService';
import { WaBridgeSupervisor } from './waBridgeSupervisor';

/**
 * Punto de arranque del puente WhatsApp de solo lectura (specs/whatsapp-inbox).
 * Registrado en apps/api/src/index.ts junto a los demás startScheduledTasks().
 *
 * - Supervisor respawn: solo si el kill switch está activo y el binario existe
 *   (si falta, queda inerte con un warning único).
 * - Poller de ingesta: intervalo propio (no node-cron) con lock anti-solape.
 * - Retención: SIEMPRE, aunque el bridge esté apagado (FR7).
 */

export { waBridgeService, computeLinkWindow, acceptedJidDigitVariants, isLinkPurgeDue } from './waBridgeService';
export type { WaLinkWindow, WaLinkRefusalReason, WaLinkStartResult } from './waBridgeService';
export { filterWhitelistedChats, normalizeWacliMessage, jidToDigits } from './waBridgePoller';
export { parseWacliEventLine, WaBridgeSupervisor } from './waBridgeSupervisor';
export { waBridgeRetentionService } from './waBridgeRetentionService';
export { WacliError } from './wacliClient';

const poller = new WaBridgePoller();

export function startScheduledTasks(): void {
	// La retención corre siempre (privacy-safe): cron propio, no depende del
	// kill switch ni de que el binario exista.
	waBridgeRetentionService.startScheduledTasks();

	poller.start();

	void waBridgeService.respawnFromDb();
}

export function waBridgeShutdown(): void {
	poller.stop();
	waBridgeRetentionService.stopScheduledTasks();
	waBridgeService.shutdown();
	WaBridgeSupervisor.killAll();
}
