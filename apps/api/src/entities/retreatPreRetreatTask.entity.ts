import {
	Entity,
	PrimaryGeneratedColumn,
	Column,
	ManyToOne,
	OneToMany,
	JoinColumn,
	CreateDateColumn,
	UpdateDateColumn,
	Index,
} from 'typeorm';
import { Retreat } from './retreat.entity';
import { Participant } from './participant.entity';
import { PreRetreatTaskTemplate } from './preRetreatTaskTemplate.entity';

export type PreRetreatTaskStatus = 'pending' | 'in_progress' | 'done' | 'not_applicable';

/**
 * Instancia por retiro de una tarea pre-retiro (materializada del template o
 * ad-hoc). `dueDate` es date-only (YYYY-MM-DD) calculada al materializar como
 * startDate − dueOffsetDays. Sub-tareas vía parentId (profundidad máx 2).
 */
@Entity('retreat_pre_retreat_task')
@Index('IDX_rprt_retreat_due', ['retreatId', 'dueDate'])
@Index('IDX_rprt_parent', ['parentId'])
@Index('IDX_rprt_responsible', ['responsibleParticipantId'])
export class RetreatPreRetreatTask {
	@PrimaryGeneratedColumn('uuid')
	id!: string;

	@Column({ type: 'uuid' })
	retreatId!: string;

	@ManyToOne(() => Retreat, { onDelete: 'CASCADE' })
	@JoinColumn({ name: 'retreatId' })
	retreat?: Retreat;

	@Column({ type: 'uuid', nullable: true })
	templateId?: string | null;

	@ManyToOne(() => PreRetreatTaskTemplate, { onDelete: 'SET NULL', nullable: true })
	@JoinColumn({ name: 'templateId' })
	template?: PreRetreatTaskTemplate | null;

	@Column({ type: 'uuid', nullable: true })
	parentId?: string | null;

	@ManyToOne(() => RetreatPreRetreatTask, (t) => t.children, {
		onDelete: 'CASCADE',
		nullable: true,
	})
	@JoinColumn({ name: 'parentId' })
	parent?: RetreatPreRetreatTask | null;

	@OneToMany(() => RetreatPreRetreatTask, (t) => t.parent)
	children?: RetreatPreRetreatTask[];

	@Column('varchar')
	name!: string;

	@Column('text', { nullable: true })
	description?: string | null;

	@Column({ type: 'integer', nullable: true })
	dueOffsetDays?: number | null;

	// Date-only: string YYYY-MM-DD, nunca Date (columna 'date' + bug TZ conocido).
	@Column({ type: 'date', nullable: true })
	dueDate?: string | null;

	@Column('varchar', { default: 'pending' })
	status!: PreRetreatTaskStatus;

	@Column({ type: 'uuid', nullable: true })
	responsibleParticipantId?: string | null;

	@ManyToOne(() => Participant, { onDelete: 'SET NULL', nullable: true })
	@JoinColumn({ name: 'responsibleParticipantId' })
	responsible?: Participant | null;

	@Column('varchar', { nullable: true })
	responsibleText?: string | null;

	@Column('text', { nullable: true })
	notes?: string | null;

	@Column('text', { nullable: true })
	supportNotes?: string | null;

	@Column({ type: 'integer', default: 0 })
	sortOrder!: number;

	@Column({ type: 'datetime', nullable: true })
	completedAt?: Date | null;

	@CreateDateColumn()
	createdAt!: Date;

	@UpdateDateColumn()
	updatedAt!: Date;
}
