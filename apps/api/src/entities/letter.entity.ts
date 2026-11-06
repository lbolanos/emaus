import {
	Entity,
	PrimaryGeneratedColumn,
	Column,
	CreateDateColumn,
	UpdateDateColumn,
	ManyToOne,
	JoinColumn,
	Index,
	OneToMany,
} from 'typeorm';
import { Retreat } from './retreat.entity';
import { RetreatParticipant } from './retreatParticipant.entity';
import { User } from './user.entity';
import { LetterAttachment } from './letterAttachment.entity';

export type LetterStatus = 'pending' | 'approved' | 'hidden';

/**
 * Carta de familia recibida por email en el buzón del participante
 * (carta.{mailboxCode}@emaus.cc). El cuerpo solo se guarda como texto plano:
 * el HTML del email jamás se persiste (specs/letters-email D10).
 */
@Entity('letters')
@Index('IDX_letters_retreat_status', ['retreatId', 'status'])
@Index('IDX_letters_retreatParticipant', ['retreatParticipantId'])
export class Letter {
	@PrimaryGeneratedColumn('uuid')
	id!: string;

	// Denormalizado para listar la bandeja por retiro sin join.
	@Column({ type: 'uuid' })
	retreatId!: string;

	@ManyToOne(() => Retreat, { onDelete: 'CASCADE' })
	@JoinColumn({ name: 'retreatId' })
	retreat?: Retreat;

	@Column({ type: 'uuid' })
	retreatParticipantId!: string;

	@ManyToOne(() => RetreatParticipant, (rp) => rp.letters, { onDelete: 'CASCADE' })
	@JoinColumn({ name: 'retreatParticipantId' })
	retreatParticipant?: RetreatParticipant;

	@Column({ type: 'text' })
	fromEmail!: string;

	@Column({ type: 'text', nullable: true })
	fromName?: string | null;

	@Column({ type: 'text', nullable: true })
	subject?: string | null;

	@Column({ type: 'text' })
	bodyText!: string;

	// Bandeja de revisión: pending → approved | hidden (D7).
	@Column({ type: 'varchar', default: 'pending' })
	status!: LetterStatus;

	// Message-ID del email; dedupe contra reintentos del Worker (D8).
	@Column({ type: 'text', nullable: true })
	messageId?: string | null;

	@Column({ type: 'datetime' })
	receivedAt!: Date;

	// Avisos del ingest (adjuntos descartados por formato o exceso).
	@Column({ type: 'json', nullable: true })
	warnings?: string[] | null;

	@OneToMany(() => LetterAttachment, (attachment) => attachment.letter)
	attachments?: LetterAttachment[];

	// Revisión (approve/hide): sello de quién y cuándo.
	@Column({ type: 'datetime', nullable: true })
	reviewedAt?: Date | null;

	@Column({ type: 'uuid', nullable: true })
	reviewedById?: string | null;

	@ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
	@JoinColumn({ name: 'reviewedById' })
	reviewedBy?: User | null;

	// Hecho logístico ortogonal al estado: re-imprimible sin límite (D7).
	@Column({ type: 'datetime', nullable: true })
	printedAt?: Date | null;

	@Column({ type: 'varchar', nullable: true })
	printedBatchId?: string | null;

	@CreateDateColumn({ type: 'datetime' })
	createdAt!: Date;

	@UpdateDateColumn({ type: 'datetime' })
	updatedAt!: Date;
}
