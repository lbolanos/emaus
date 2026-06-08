import { AppDataSource } from '../data-source';
import { DomainAuditLog } from '../entities/domainAuditLog.entity';
import { auditContext } from '../utils/auditContext';
import { auditLogger } from '../utils/auditLogger';
import { diffFields, sanitizeSnapshot } from '../utils/auditDiff';
import { config } from '../config';

/**
 * Auditoría de operaciones de ESCRITURA del dominio (participantes, mesas, camas/casas,
 * pagos, retiros). Dos sinks: la tabla `domain_audit_log` (DB) y un archivo NDJSON
 * (`auditLogger`).
 *
 * Diseño (mismo espíritu que `communityAuditService`):
 *  - **Fire-and-forget**: `log()` nunca lanza ni rechaza; un fallo de auditoría jamás
 *    rompe la operación de negocio. Los call sites usan `void domainAuditService.log(...)`.
 *  - **Actor implícito**: el actor (userId/ip/userAgent) se lee del `auditContext`
 *    (AsyncLocalStorage) cuando el evento no lo trae, así no hay que propagar el userId
 *    por las firmas de los servicios. Un valor explícito en el evento siempre gana.
 *  - **Lazy `get repo()`**: resuelve el repo en cada call para funcionar con el
 *    monkey-patch de `AppDataSource.getRepository` que hace `test-setup.ts`.
 *
 * Usar las constantes `DomainAuditAction` para `action` (consistencia para queries/análisis).
 */
export const DomainAuditAction = {
	// Participantes
	PARTICIPANT_CREATE: 'participant.create',
	PARTICIPANT_UPDATE: 'participant.update',
	PARTICIPANT_SELF_UPDATE: 'participant.self_update',
	PARTICIPANT_DELETE: 'participant.delete',
	PARTICIPANT_IMPORT: 'participant.import',
	PARTICIPANT_CONFIRM: 'participant.confirm',
	PARTICIPANT_CHECKIN: 'participant.checkin',
	PARTICIPANT_ANONYMIZE: 'participant.anonymize',
	// Mesas
	TABLE_CREATE: 'table.create',
	TABLE_UPDATE: 'table.update',
	TABLE_DELETE: 'table.delete',
	TABLE_ASSIGN_LEADER: 'table.assign_leader',
	TABLE_UNASSIGN_LEADER: 'table.unassign_leader',
	TABLE_ASSIGN_WALKER: 'table.assign_walker',
	TABLE_UNASSIGN_WALKER: 'table.unassign_walker',
	TABLE_REBALANCE: 'table.rebalance',
	TABLE_CLEAR_ALL: 'table.clear_all',
	// Camas / Casas
	BED_ASSIGN: 'bed.assign',
	BED_UNASSIGN: 'bed.unassign',
	BED_TOGGLE_ACTIVE: 'bed.toggle_active',
	BED_CLEAR_ALL: 'bed.clear_all',
	HOUSE_CREATE: 'house.create',
	HOUSE_UPDATE: 'house.update',
	HOUSE_DELETE: 'house.delete',
	// Pagos
	PAYMENT_CREATE: 'payment.create',
	PAYMENT_UPDATE: 'payment.update',
	PAYMENT_DELETE: 'payment.delete',
	// Retiros
	RETREAT_CREATE: 'retreat.create',
	RETREAT_UPDATE: 'retreat.update',
	RETREAT_MEMORY_PHOTO_UPLOAD: 'retreat.memory.photo_upload',
	RETREAT_MEMORY_UPDATE: 'retreat.memory.update',
} as const;

export type DomainAuditActionType = (typeof DomainAuditAction)[keyof typeof DomainAuditAction];

export type DomainResourceType =
	| 'participant'
	| 'table'
	| 'bed'
	| 'house'
	| 'payment'
	| 'retreat';

export interface DomainAuditEvent {
	action: string;
	resourceType: string;
	resourceId?: string | null;
	retreatId?: string | null;
	/** Si se omite, se toma del auditContext (AsyncLocalStorage). */
	actorUserId?: string | null;
	oldValues?: Record<string, any> | null;
	newValues?: Record<string, any> | null;
	metadata?: Record<string, any> | null;
	/** Si se omite, se toma del auditContext. */
	ipAddress?: string | null;
	/** Si se omite, se toma del auditContext. */
	userAgent?: string | null;
}

/** Opciones comunes de los helpers logCreate/logUpdate/logDelete. */
export interface DomainAuditHelperOptions {
	retreatId?: string | null;
	metadata?: Record<string, any> | null;
	/** Allowlist de campos a considerar para el diff/snapshot. */
	fields?: string[];
	action?: string;
}

function safeStringify(value: Record<string, any> | null | undefined): string | null {
	if (!value) return null;
	try {
		return JSON.stringify(value);
	} catch {
		return null;
	}
}

export class DomainAuditService {
	// Lazy getter — ver nota en el header sobre el monkey-patch de tests.
	private get repo() {
		return AppDataSource.getRepository(DomainAuditLog);
	}

	async log(event: DomainAuditEvent): Promise<void> {
		try {
			const ctx = auditContext.get();
			const actorUserId = event.actorUserId ?? ctx?.userId ?? null;
			const ipAddress = event.ipAddress ?? ctx?.ip ?? null;
			const userAgent = event.userAgent ?? ctx?.userAgent ?? null;

			// 1) Sink a DB
			if (config.audit.dbEnabled) {
				const entry = this.repo.create({
					action: event.action,
					resourceType: event.resourceType,
					resourceId: event.resourceId ?? null,
					retreatId: event.retreatId ?? null,
					actorUserId,
					oldValues: safeStringify(event.oldValues),
					newValues: safeStringify(event.newValues),
					metadata: safeStringify(event.metadata),
					ipAddress,
					userAgent: userAgent ? userAgent.slice(0, 255) : null,
				});
				await this.repo.save(entry);
			}

			// 2) Sink a archivo (NDJSON). En test el logger está silent.
			if (config.audit.fileEnabled) {
				auditLogger.info('domain_audit', {
					action: event.action,
					resourceType: event.resourceType,
					resourceId: event.resourceId ?? null,
					retreatId: event.retreatId ?? null,
					actorUserId,
					oldValues: event.oldValues ?? null,
					newValues: event.newValues ?? null,
					metadata: event.metadata ?? null,
					ipAddress,
				});
			}
		} catch (err) {
			// Un fallo de auditoría NUNCA debe romper la operación principal.
			console.error('[domainAuditService] Failed to log event:', err, (err as any)?.stack);
		}
	}

	/** Registra una creación: `newValues` = snapshot compacto de la entidad creada. */
	logCreate(
		resourceType: string,
		resourceId: string | null | undefined,
		newValues: Record<string, any> | null | undefined,
		opts: DomainAuditHelperOptions = {},
	): Promise<void> {
		return this.log({
			action: opts.action ?? `${resourceType}.create`,
			resourceType,
			resourceId: resourceId ?? null,
			retreatId: opts.retreatId ?? null,
			newValues: sanitizeSnapshot(newValues, opts.fields),
			metadata: opts.metadata ?? null,
		});
	}

	/** Registra una actualización: solo los campos que cambiaron (diff). */
	logUpdate(
		resourceType: string,
		resourceId: string | null | undefined,
		oldValues: Record<string, any> | null | undefined,
		newValues: Record<string, any> | null | undefined,
		opts: DomainAuditHelperOptions = {},
	): Promise<void> {
		const diff = diffFields(oldValues, newValues, opts.fields);
		return this.log({
			action: opts.action ?? `${resourceType}.update`,
			resourceType,
			resourceId: resourceId ?? null,
			retreatId: opts.retreatId ?? null,
			oldValues: diff
				? Object.fromEntries(Object.entries(diff).map(([k, v]) => [k, v.from]))
				: null,
			newValues: diff
				? Object.fromEntries(Object.entries(diff).map(([k, v]) => [k, v.to]))
				: null,
			metadata: opts.metadata ?? null,
		});
	}

	/** Registra un borrado: `oldValues` = snapshot compacto de la entidad eliminada. */
	logDelete(
		resourceType: string,
		resourceId: string | null | undefined,
		oldValues: Record<string, any> | null | undefined,
		opts: DomainAuditHelperOptions = {},
	): Promise<void> {
		return this.log({
			action: opts.action ?? `${resourceType}.delete`,
			resourceType,
			resourceId: resourceId ?? null,
			retreatId: opts.retreatId ?? null,
			oldValues: sanitizeSnapshot(oldValues, opts.fields),
			metadata: opts.metadata ?? null,
		});
	}
}

// Singleton para uso conveniente en services/controllers.
export const domainAuditService = new DomainAuditService();
