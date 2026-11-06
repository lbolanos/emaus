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
 * Marca de "leído hasta aquí" POR USUARIO de la app (specs/whatsapp-inbox D11):
 * que un staff lea un chat no lo marca como leído para los demás, y el puente
 * nunca marca visto en WhatsApp (presence quiet).
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

	/** Todo mensaje de timestamp mayor cuenta como no leído para este usuario. */
	@Column({ type: 'datetime' })
	lastSeenMessageTimestamp!: Date;

	@UpdateDateColumn()
	updatedAt!: Date;

	@ManyToOne(() => User, { onDelete: 'CASCADE' })
	@JoinColumn({ name: 'userId' })
	user?: User;
}
