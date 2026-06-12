import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

/**
 * Audit log de operaciones de ESCRITURA del dominio (participantes, mesas, camas/casas,
 * pagos, retiros).
 *
 * Tabla separada de `audit_logs` (RBAC, retreat-scoped) y `community_audit_log`
 * (community-scoped). Genérica y append-only: el service nunca hace update/delete.
 *
 * El actor (actorUserId / ipAddress / userAgent) se resuelve desde el AsyncLocalStorage
 * (`auditContext`) cuando el evento no lo trae explícito, por lo que no hace falta
 * propagar el userId por las firmas de los servicios.
 *
 * `oldValues` / `newValues` / `metadata` se guardan como TEXT con JSON serializado
 * (no `json`) por consistencia con `community_audit_log` y por la fricción del tipo
 * `json` de TypeORM en SQLite.
 *
 * Acciones registradas: ver constantes `DomainAuditAction` en domainAuditService.
 */
@Entity('domain_audit_log')
@Index('idx_domain_audit_log_resource', ['resourceType', 'resourceId'])
@Index('idx_domain_audit_log_retreat', ['retreatId'])
@Index('idx_domain_audit_log_retreat_created', ['retreatId', 'createdAt'])
@Index('idx_domain_audit_log_actor', ['actorUserId'])
@Index('idx_domain_audit_log_action', ['action', 'createdAt'])
export class DomainAuditLog {
	@PrimaryGeneratedColumn('uuid')
	id!: string;

	@Column({ type: 'varchar', length: 36, nullable: true })
	actorUserId?: string | null;

	@Column({ type: 'varchar', length: 100 })
	action!: string;

	@Column({ type: 'varchar', length: 50 })
	resourceType!: string;

	@Column({ type: 'varchar', length: 36, nullable: true })
	resourceId?: string | null;

	@Column({ type: 'varchar', length: 36, nullable: true })
	retreatId?: string | null;

	@Column({ type: 'text', nullable: true })
	oldValues?: string | null;

	@Column({ type: 'text', nullable: true })
	newValues?: string | null;

	@Column({ type: 'text', nullable: true })
	metadata?: string | null;

	@Column({ type: 'varchar', length: 64, nullable: true })
	ipAddress?: string | null;

	@Column({ type: 'varchar', length: 255, nullable: true })
	userAgent?: string | null;

	@CreateDateColumn()
	createdAt!: Date;
}
