import {
	Entity,
	PrimaryGeneratedColumn,
	Column,
	CreateDateColumn,
	Index,
	ManyToOne,
	JoinColumn,
} from 'typeorm';
import { WhatsappBridgeLink } from './whatsappBridgeLink.entity';

/**
 * A message of a whitelisted chat (specs/whatsapp-inbox D4): a 1:1 chat whose
 * phone matches a walker of the retreat. Incoming messages, plus (v1.3) the
 * staff's own replies in those chats (`fromMe`). Nothing outside the
 * whitelist is ever stored.
 *
 * `retreatId` is denormalized on purpose (no physical FK): inbox and purge
 * query by retreat. Deletion is explicit by linkId (teardownLink) — the FK
 * CASCADE is not relied upon. Media is not stored: `messageType`/`mediaMime`
 * describe it and `body` holds the text or caption.
 */
@Entity('whatsapp_inbox_message')
@Index('IDX_wa_inbox_message_thread', ['retreatId', 'chatJid', 'timestamp'])
@Index('IDX_wa_inbox_message_retreat_ts', ['retreatId', 'timestamp'])
@Index('UQ_wa_inbox_message_dedupe', ['linkId', 'waMessageId'], { unique: true })
export class WhatsappInboxMessage {
	@PrimaryGeneratedColumn('uuid')
	id!: string;

	@Column({ type: 'varchar' })
	linkId!: string;

	@Column({ type: 'varchar' })
	retreatId!: string;

	/** 1:1 chat JID, e.g. 5215512345678@s.whatsapp.net. */
	@Column({ type: 'varchar' })
	chatJid!: string;

	/** JID digits of the chat (with calling code), used to match the walker. */
	@Column({ type: 'varchar' })
	chatPhone!: string;

	/** WhatsApp message id; dedupes re-reads of the store. */
	@Column({ type: 'varchar' })
	waMessageId!: string;

	/** Message time in UTC; the client renders it in the retreat's zone. */
	@Column({ type: 'datetime' })
	timestamp!: Date;

	@Column({ type: 'boolean', default: false })
	fromMe!: boolean;

	@Column({ type: 'text', nullable: true })
	body?: string | null;

	@Column({ type: 'varchar', default: 'text' })
	messageType!: string;

	/** wacli MimeType for media (documents, voice notes, images). */
	@Column({ type: 'varchar', length: 100, nullable: true })
	mediaMime?: string | null;

	/** wacli Filename for documents (shown in the bubble). */
	@Column({ type: 'varchar', length: 255, nullable: true })
	mediaFileName?: string | null;

	/** Payment created from this message (duplicate-payment guard, v1.3). */
	@Column({ type: 'varchar', length: 36, nullable: true })
	paymentId?: string | null;

	@Column({ type: 'varchar', length: 36, nullable: true })
	paymentRegisteredById?: string | null;

	@Column({ type: 'datetime', nullable: true })
	paymentRegisteredAt?: Date | null;

	/** Letter created from this message ("add as letter", v1.3). */
	@Column({ type: 'varchar', length: 36, nullable: true })
	letterId?: string | null;

	@Column({ type: 'varchar', length: 36, nullable: true })
	letterAddedById?: string | null;

	@Column({ type: 'datetime', nullable: true })
	letterAddedAt?: Date | null;

	@CreateDateColumn()
	createdAt!: Date;

	@ManyToOne(() => WhatsappBridgeLink, { onDelete: 'CASCADE' })
	@JoinColumn({ name: 'linkId' })
	link?: WhatsappBridgeLink;
}
