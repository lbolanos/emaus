import { config } from '../../config';
import { waBridgeService } from './waBridgeService';
import { WaBridgePoller } from './waBridgePoller';
import { waBridgeRetentionService } from './waBridgeRetentionService';
import { WaBridgeSupervisor } from './waBridgeSupervisor';

/**
 * Entry point of the read-only WhatsApp bridge (specs/whatsapp-inbox).
 * Wired in apps/api/src/index.ts next to the other startScheduledTasks().
 *
 * - Supervisor respawn: only with the kill switch on and the binary present
 *   (if it is missing, stays inert with a single warning).
 * - Ingestion poller: own interval (not node-cron) with an anti-overlap lock;
 *   each cycle also respawns missing supervisors (watchdog).
 * - Retention: ALWAYS, even with the bridge turned off (FR7).
 */

export {
	waBridgeService,
	computeLinkWindow,
	acceptedJidDigitVariants,
	isLinkPurgeDue,
	senderKindOf,
	contactWalkers,
	primaryParticipantOf,
	senderDisplayName,
} from './waBridgeService';
export type {
	WaLinkWindow,
	WaLinkRefusalReason,
	WaLinkStartResult,
	WaSenderMatch,
	WaSenderKind,
} from './waBridgeService';
export { filterWhitelistedChats, normalizeWacliMessage, jidToDigits } from './waBridgePoller';
export { parseWacliEventLine, WaBridgeSupervisor } from './waBridgeSupervisor';
export { waBridgeRetentionService } from './waBridgeRetentionService';
export { WacliError } from './wacliClient';

const poller = new WaBridgePoller();

export function startScheduledTasks(): void {
	// Retention always runs (privacy-safe): its own cron, independent of the
	// kill switch and of the binary being present.
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
