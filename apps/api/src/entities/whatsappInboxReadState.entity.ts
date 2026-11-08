import {
	Entity,
	PrimaryGeneratedColumn,
	Column,
	UpdateDateColumn,
	Index,
	ManyToOne,
	JoinColumn,
} from 'typeorm';
import { User } from './user.entity';

/**
 * "Read up to here" mark PER app user (specs/whatsapp-inbox D11): one staff
 * member reading a chat does not mark it read for the others, and the bridge
 * never sends "seen" on WhatsApp (quiet presence).
 */
@Entity('whatsapp_inbox_read_state')
@Index('UQ_wa_inbox_read_state_user_chat', ['userId', 'retreatId', 'chatJid'], {
	unique: true,
})
export class WhatsappInboxReadState {
	@PrimaryGeneratedColumn('uuid')
	id!: string;

	@Column({ type: 'varchar' })
	userId!: string;

	@Column({ type: 'varchar' })
	retreatId!: string;

	@Column({ type: 'varchar' })
	chatJid!: string;

	/** Every incoming message with a newer timestamp counts as unread for this user. */
	@Column({ type: 'datetime' })
	lastSeenMessageTimestamp!: Date;

	@UpdateDateColumn()
	updatedAt!: Date;

	@ManyToOne(() => User, { onDelete: 'CASCADE' })
	@JoinColumn({ name: 'userId' })
	user?: User;
}
