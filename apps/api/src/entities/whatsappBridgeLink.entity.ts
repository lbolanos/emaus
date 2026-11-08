import {
	Entity,
	PrimaryGeneratedColumn,
	Column,
	CreateDateColumn,
	UpdateDateColumn,
	Index,
	ManyToOne,
	JoinColumn,
} from 'typeorm';
import { User } from './user.entity';
import { Retreat } from './retreat.entity';

/**
 * Read-only link between a staff member's WhatsApp account and a retreat
 * (specs/whatsapp-inbox). One row per QR scan: wacli's local store lives in
 * `storePath`, outside the repo and the web root.
 *
 * `linkedPhone` never leaves the API towards anyone but the owner — the
 * controller strips it from third-party payloads.
 */
@Entity('whatsapp_bridge_link')
@Index('IDX_wa_bridge_link_retreat_status', ['retreatId', 'status'])
@Index('IDX_wa_bridge_link_status', ['status'])
@Index('UQ_wa_bridge_link_user_retreat', ['userId', 'retreatId'], { unique: true })
export class WhatsappBridgeLink {
	@PrimaryGeneratedColumn('uuid')
	id!: string;

	@Column({ type: 'varchar' })
	retreatId!: string;

	@Column({ type: 'varchar' })
	userId!: string;

	/** Link lifecycle: pending→qr→connected; error|logged_out|expired. */
	@Column({
		type: 'varchar',
		default: 'pending',
		enum: ['pending', 'qr', 'connected', 'error', 'logged_out', 'expired'],
	})
	status!: string;

	/** JID of the staff account (display); set by the `connected` event. */
	@Column({ type: 'varchar', nullable: true })
	linkedJid?: string | null;

	/** Staff member's national phone (display); visible to its owner only. */
	@Column({ type: 'varchar', nullable: true })
	linkedPhone?: string | null;

	/** wacli store directory, e.g. /var/lib/emaus-wa-bridge/<id> (0700). */
	@Column({ type: 'varchar' })
	storePath!: string;

	@Column({ type: 'text', nullable: true })
	lastError?: string | null;

	@Column({ type: 'datetime', nullable: true })
	connectedAt?: Date | null;

	@Column({ type: 'datetime', nullable: true })
	lastSyncAt?: Date | null;

	@CreateDateColumn()
	createdAt!: Date;

	@UpdateDateColumn()
	updatedAt!: Date;

	@ManyToOne(() => Retreat, { onDelete: 'CASCADE' })
	@JoinColumn({ name: 'retreatId' })
	retreat?: Retreat;

	@ManyToOne(() => User, { onDelete: 'CASCADE' })
	@JoinColumn({ name: 'userId' })
	user?: User;
}
