import { Entity, PrimaryColumn, Column, CreateDateColumn, Index } from 'typeorm';

/**
 * One row per `Idempotency-Key` the web app sent with a write that can be queued
 * without signal (specs/offline-mode, FR-16).
 *
 * The device generates the key when the action happens and sends the same key on
 * every retry, so a write that reached the server but whose answer was lost (the
 * typical timeout at the retreat house) is not executed twice — a door payment is
 * never recorded twice.
 *
 * `statusCode` 0 means the first request is still being processed. Only 4xx bodies
 * are kept (the error message the device shows as a conflict): 2xx bodies can carry
 * a full participant with personal data, and the outbox does not need them.
 * Rows older than 7 days are purged by `idempotencyService`.
 */
@Entity('idempotency_keys')
@Index('idx_idempotency_keys_created', ['createdAt'])
export class IdempotencyKey {
	@PrimaryColumn({ type: 'varchar', length: 64 })
	key!: string;

	@Column({ type: 'varchar', length: 36 })
	userId!: string;

	@Column({ type: 'varchar', length: 10 })
	method!: string;

	@Column({ type: 'varchar', length: 255 })
	path!: string;

	@Column({ type: 'integer' })
	statusCode!: number;

	@Column({ type: 'text', nullable: true })
	responseBody?: string | null;

	@CreateDateColumn({ type: 'datetime' })
	createdAt!: Date;

	@Column({ type: 'datetime', nullable: true })
	completedAt?: Date | null;
}
