import {
	Entity,
	PrimaryGeneratedColumn,
	Column,
	CreateDateColumn,
	UpdateDateColumn,
	ManyToOne,
	JoinColumn,
	OneToMany,
} from 'typeorm';
import { Retreat } from './retreat.entity';
import { User } from './user.entity';
import { SequenceStep } from './sequenceStep.entity';

/** Disparador que decide CUÁNDO se enrola a un participante en la secuencia. */
export type SequenceTrigger =
	| 'participant_created' // al darse de alta el participante
	| 'days_before_retreat' // N días antes del inicio del retiro
	| 'days_after_retreat' // N días después del fin del retiro
	| 'birthday'; // en torno al cumpleaños

/**
 * Audiencia base. 'table_leaders' = líderes/colíderes de mesa del retiro.
 * Fase 3 añade segmentId para audiencias dinámicas.
 */
export type SequenceAudience = 'walker' | 'server' | 'all' | 'table_leaders' | 'responsables';

/**
 * Una secuencia de mensajes automatizada (drip) ligada a un retiro. Define un
 * disparador, una audiencia y una lista ordenada de pasos. El motor
 * (`messageSequenceService`) enrola participantes y programa cada paso.
 */
@Entity('message_sequences')
export class MessageSequence {
	@PrimaryGeneratedColumn('uuid')
	id!: string;

	@Column({ type: 'varchar', length: 150 })
	name!: string;

	@Column({ type: 'text', nullable: true })
	description?: string | null;

	@Column({ type: 'uuid' })
	retreatId!: string;

	@ManyToOne(() => Retreat, { onDelete: 'CASCADE' })
	@JoinColumn({ name: 'retreatId' })
	retreat?: Retreat;

	@Column({ type: 'varchar', length: 30 })
	trigger!: SequenceTrigger;

	@Column({ type: 'varchar', length: 20, default: 'all' })
	audience!: SequenceAudience;

	// Fase 3: si está presente, la audiencia se evalúa contra este segmento.
	@Column({ type: 'uuid', nullable: true })
	segmentId?: string | null;

	@Column({ type: 'boolean', default: true })
	isActive!: boolean;

	// Ventana de gracia: no enviar un paso vencido hace más de N días
	// (null = sin límite; comportamiento histórico de catch-up).
	@Column({ type: 'integer', nullable: true })
	maxOverdueDays?: number | null;

	@Column({ type: 'uuid', nullable: true })
	createdBy?: string | null;

	@ManyToOne(() => User, { onDelete: 'SET NULL' })
	@JoinColumn({ name: 'createdBy' })
	creator?: User;

	@OneToMany(() => SequenceStep, (step) => step.sequence)
	steps?: SequenceStep[];

	@CreateDateColumn({ type: 'datetime' })
	createdAt!: Date;

	@UpdateDateColumn({ type: 'datetime' })
	updatedAt!: Date;
}
