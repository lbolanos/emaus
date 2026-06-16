import {
	Entity,
	PrimaryGeneratedColumn,
	Column,
	CreateDateColumn,
	UpdateDateColumn,
	ManyToOne,
	JoinColumn,
} from 'typeorm';
import { MessageSequence } from './messageSequence.entity';

export type MessageChannel = 'email' | 'whatsapp';

/**
 * A quién va dirigido el paso: al participante, a un contacto de emergencia, al
 * servidor invitador (palanquero), o al titular de una responsabilidad del
 * retiro (el nombre va en `recipientResponsibility`).
 */
export type MessageRecipientTarget =
	| 'participant'
	| 'emergencyContact1'
	| 'emergencyContact2'
	| 'inviter'
	| 'tableLeader'
	| 'responsibility';

/**
 * Un paso de una secuencia: qué plantilla enviar, por qué canal y con qué
 * desfase temporal respecto al evento del disparador.
 *
 * `offsetDays` se interpreta según el trigger de la secuencia:
 *  - participant_created → días DESPUÉS del alta (0 = inmediato).
 *  - days_before_retreat → días ANTES del inicio del retiro.
 *  - days_after_retreat  → días DESPUÉS del fin del retiro.
 *  - birthday            → días respecto al cumpleaños.
 */
@Entity('sequence_steps')
export class SequenceStep {
	@PrimaryGeneratedColumn('uuid')
	id!: string;

	@Column({ type: 'uuid' })
	sequenceId!: string;

	@ManyToOne(() => MessageSequence, (seq) => seq.steps, { onDelete: 'CASCADE' })
	@JoinColumn({ name: 'sequenceId' })
	sequence?: MessageSequence;

	@Column({ type: 'integer', default: 0 })
	stepOrder!: number;

	@Column({ type: 'integer', default: 0 })
	offsetDays!: number;

	// Hora local (0-23) del retiro a la que se programa el envío.
	@Column({ type: 'integer', default: 9 })
	sendHour!: number;

	// Tipo de plantilla a resolver contra el retiro (WALKER_WELCOME, etc.).
	@Column({ type: 'varchar', length: 60 })
	templateType!: string;

	@Column({ type: 'varchar', length: 20 })
	channel!: MessageChannel;

	// Destinatario del paso (participante o contacto de emergencia).
	@Column({ type: 'varchar', length: 30, default: 'participant' })
	recipientTarget!: MessageRecipientTarget;

	// Nombre de la responsabilidad destino cuando recipientTarget = 'responsibility'.
	@Column({ type: 'varchar', length: 100, nullable: true })
	recipientResponsibility?: string | null;

	// Condición opcional (SegmentFilters): el participante debe cumplirla para
	// recibir ESTE paso. null = sin condición (todos). simple-json (de)serializa.
	@Column({ type: 'simple-json', nullable: true })
	condition?: Record<string, unknown> | null;

	@CreateDateColumn({ type: 'datetime' })
	createdAt!: Date;

	@UpdateDateColumn({ type: 'datetime' })
	updatedAt!: Date;
}
