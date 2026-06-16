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
import type { MessageChannel, MessageRecipientTarget } from './sequenceStep.entity';

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

	// Copiado del paso al enrolar: destinatario (participante / contacto emergencia).
	@Column({ type: 'varchar', length: 30, default: 'participant' })
	recipientTarget!: MessageRecipientTarget;

	@Index('IDX_scheduled_messages_due')
	@Column({ type: 'datetime' })
	scheduledFor!: Date;

	@Column({ type: 'varchar', length: 20, default: 'pending' })
	status!: ScheduledMessageStatus;

	@Column({ type: 'datetime', nullable: true })
	sentAt?: Date | null;

	@Column({ type: 'text', nullable: true })
	error?: string | null;

	// Reintentos ante fallo de envío (SMTP). Tope en el servicio.
	@Column({ type: 'integer', default: 0 })
	attempts!: number;

	// Snapshot del envío resuelto al momento de encolar/procesar: preserva el
	// texto aunque la plantilla cambie después, y permite a la bandeja despachar
	// sin recalcular variables.
	@Column({ type: 'text', nullable: true })
	resolvedContent?: string | null;

	@Column({ type: 'varchar', length: 255, nullable: true })
	resolvedContact?: string | null;

	@Column({ type: 'varchar', length: 150, nullable: true })
	recipientName?: string | null;

	// Ownership/auditoría del despacho de WhatsApp (deep-link asistido):
	//  - assignedTo  : coordinador responsable de enviarlo desde su cuenta.
	//  - openedAt    : cuándo se abrió el deep-link (≠ enviado).
	//  - dispatchedBy: quién marcó el envío/omisión real.
	@Column({ type: 'uuid', nullable: true })
	assignedTo?: string | null;

	@Column({ type: 'datetime', nullable: true })
	openedAt?: Date | null;

	@Column({ type: 'uuid', nullable: true })
	dispatchedBy?: string | null;

	@CreateDateColumn({ type: 'datetime' })
	createdAt!: Date;

	@UpdateDateColumn({ type: 'datetime' })
	updatedAt!: Date;
}
