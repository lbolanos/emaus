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
 * Vínculo de solo lectura entre la cuenta de WhatsApp de un miembro del staff y
 * un retiro (specs/whatsapp-inbox). Una fila por escaneo de QR: el store local
 * de wacli vive en `storePath`, fuera del repo y del web root.
 *
 * `linkedPhone` nunca sale del API hacia usuarios que no sean el dueño — el
 * controller la recorta del payload de terceros.
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

	/** Ciclo de vida del vínculo: pending→qr→connected; error|logged_out|expired. */
	@Column({
		type: 'varchar',
		default: 'pending',
		enum: ['pending', 'qr', 'connected', 'error', 'logged_out', 'expired'],
	})
	status!: string;

	/** JID de la cuenta del staff (display); lo fija el evento `connected`. */
	@Column({ type: 'varchar', nullable: true })
	linkedJid?: string | null;

	/** Teléfono nacional del staff (display); solo visible para su dueño. */
	@Column({ type: 'varchar', nullable: true })
	linkedPhone?: string | null;

	/** Directorio del store wacli, p. ej. /var/lib/emaus-wa-bridge/<id> (0700). */
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
