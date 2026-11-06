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
 * Mensaje ENTRANTE de un caminante que pasó la whitelist (specs/whatsapp-inbox
 * D4): chat 1:1 cuyo teléfono coincide con un participante walker del retiro.
 * Nada que no pase el filtro se persiste jamás.
 *
 * `retreatId` va desnormalizado a propósito (sin FK física): la bandeja y la
 * purga consultan por retiro; el borrado en cascada real lo hace el DELETE del
 * link padre. La multimedia no se descarga — `messageType` informa el tipo y
 * `body` trae texto o caption.
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

	/** JID del chat 1:1, p. ej. 5215512345678@s.whatsapp.net. */
	@Column({ type: 'varchar' })
	chatJid!: string;

	/** Número nacional normalizado del chat (toNationalPhone). */
	@Column({ type: 'varchar' })
	chatPhone!: string;

	/** Id de mensaje de WhatsApp; dedupe contra re-lecturas del store. */
	@Column({ type: 'varchar' })
	waMessageId!: string;

	/** Hora del mensaje en UTC; el cliente renderiza en zona del retiro. */
	@Column({ type: 'datetime' })
	timestamp!: Date;

	@Column({ type: 'boolean', default: false })
	fromMe!: boolean;

	@Column({ type: 'text', nullable: true })
	body?: string | null;

	@Column({ type: 'varchar', default: 'text' })
	messageType!: string;

	@CreateDateColumn()
	createdAt!: Date;

	@ManyToOne(() => WhatsappBridgeLink, { onDelete: 'CASCADE' })
	@JoinColumn({ name: 'linkId' })
	link?: WhatsappBridgeLink;
}
