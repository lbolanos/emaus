import type { DomainResourceType } from '@repo/types';
import { AppDataSource } from '../data-source';
import { DomainAuditLog } from '../entities/domainAuditLog.entity';
import { auditContext } from '../utils/auditContext';
import { auditLogger } from '../utils/auditLogger';
import { diffFields, sanitizeSnapshot } from '../utils/auditDiff';
import { config } from '../config';

// Fuente de verdad compartida con el frontend — re-export para los ~13 call sites
// que importan estas constantes/tipos desde este servicio.
export { DomainAuditAction, DOMAIN_RESOURCE_TYPES } from '@repo/types';
export type { DomainAuditActionType, DomainResourceType } from '@repo/types';

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
 * Las constantes/tipos viven en `@repo/types` (`packages/types/src/audit.ts`) para
 * compartirlas con el frontend; aquí solo se re-exportan.
 */
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
		resourceType: DomainResourceType,
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
		resourceType: DomainResourceType,
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
		resourceType: DomainResourceType,
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
