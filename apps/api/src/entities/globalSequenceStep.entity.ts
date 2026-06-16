import {
	Entity,
	PrimaryGeneratedColumn,
	Column,
	CreateDateColumn,
	UpdateDateColumn,
	ManyToOne,
	JoinColumn,
} from 'typeorm';
import type { MessageChannel, MessageRecipientTarget } from './sequenceStep.entity';
import { GlobalMessageSequence } from './globalMessageSequence.entity';

/**
 * Un paso de una plantilla global de secuencia. Idéntico en forma a
 * `SequenceStep` pero ligado a una `GlobalMessageSequence`. Al importar la
 * secuencia a un retiro, sus pasos se copian a `sequence_steps`.
 */
@Entity('global_sequence_steps')
export class GlobalSequenceStep {
	@PrimaryGeneratedColumn('uuid')
	id!: string;

	@Column({ type: 'uuid' })
	sequenceId!: string;

	@ManyToOne(() => GlobalMessageSequence, (seq) => seq.steps, { onDelete: 'CASCADE' })
	@JoinColumn({ name: 'sequenceId' })
	sequence?: GlobalMessageSequence;

	@Column({ type: 'integer', default: 0 })
	stepOrder!: number;

	@Column({ type: 'integer', default: 0 })
	offsetDays!: number;

	@Column({ type: 'integer', default: 9 })
	sendHour!: number;

	@Column({ type: 'varchar', length: 60 })
	templateType!: string;

	@Column({ type: 'varchar', length: 20 })
	channel!: MessageChannel;

	@Column({ type: 'varchar', length: 30, default: 'participant' })
	recipientTarget!: MessageRecipientTarget;

	// Responsabilidad destino cuando recipientTarget = 'responsibility' (se copia al importar).
	@Column({ type: 'varchar', length: 100, nullable: true })
	recipientResponsibility?: string | null;

	// Condición opcional (SegmentFilters) — se copia al importar. simple-json.
	@Column({ type: 'simple-json', nullable: true })
	condition?: Record<string, unknown> | null;

	@CreateDateColumn({ type: 'datetime' })
	createdAt!: Date;

	@UpdateDateColumn({ type: 'datetime' })
	updatedAt!: Date;
}
