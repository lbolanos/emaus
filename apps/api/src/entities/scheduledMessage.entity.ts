import {
	Entity,
	PrimaryGeneratedColumn,
	Column,
	CreateDateColumn,
	UpdateDateColumn,
	ManyToOne,
	JoinColumn,
	Index,
	Unique,
} from 'typeorm';
import { MessageSequence } from './messageSequence.entity';
import { SequenceStep } from './sequenceStep.entity';
import { Participant } from './participant.entity';
import { Retreat } from './retreat.entity';
import type { MessageChannel } from './sequenceStep.entity';

/**
 * Estado de un mensaje programado:
 *  - pending   : esperando su `scheduledFor`.
 *  - sent      : enviado (email desatendido).
 *  - queued    : (whatsapp) listo en la bandeja para que el coordinador lo despache.
 *  - skipped   : condición no cumplida (p.ej. sin plantilla o sin contacto).
 *  - failed    : error al enviar (email).
 *  - cancelled : la secuencia/step se desactivó o el participante salió de la audiencia.
 */
export type ScheduledMessageStatus =
	| 'pending'
	| 'sent'
	| 'queued'
	| 'skipped'
	| 'failed'
	| 'cancelled';

/**
 * Instancia de envío programada: un paso de una secuencia aplicado a un
 * participante concreto. La unicidad (stepId, participantId) garantiza
 * idempotencia: el motor nunca programa dos veces el mismo paso para el mismo
 * participante.
 */
@Entity('scheduled_messages')
@Unique('UQ_scheduled_step_participant', ['stepId', 'participantId'])
export class ScheduledMessage {
	@PrimaryGeneratedColumn('uuid')
	id!: string;

	@Column({ type: 'uuid' })
	sequenceId!: string;

	@ManyToOne(() => MessageSequence, { onDelete: 'CASCADE' })
	@JoinColumn({ name: 'sequenceId' })
	sequence?: MessageSequence;

	@Column({ type: 'uuid' })
	stepId!: string;

	@ManyToOne(() => SequenceStep, { onDelete: 'CASCADE' })
	@JoinColumn({ name: 'stepId' })
	step?: SequenceStep;

	@Column({ type: 'uuid' })
	participantId!: string;

	@ManyToOne(() => Participant, { onDelete: 'CASCADE' })
	@JoinColumn({ name: 'participantId' })
	participant?: Participant;

	@Column({ type: 'uuid' })
	retreatId!: string;

	@ManyToOne(() => Retreat, { onDelete: 'CASCADE' })
	@JoinColumn({ name: 'retreatId' })
	retreat?: Retreat;

	@Column({ type: 'varchar', length: 20 })
	channel!: MessageChannel;

	@Column({ type: 'varchar', length: 60 })
	templateType!: string;

	@Index('IDX_scheduled_messages_due')
	@Column({ type: 'datetime' })
	scheduledFor!: Date;

	@Column({ type: 'varchar', length: 20, default: 'pending' })
	status!: ScheduledMessageStatus;

	@Column({ type: 'datetime', nullable: true })
	sentAt?: Date | null;

	@Column({ type: 'text', nullable: true })
	error?: string | null;

	@CreateDateColumn({ type: 'datetime' })
	createdAt!: Date;

	@UpdateDateColumn({ type: 'datetime' })
	updatedAt!: Date;
}
