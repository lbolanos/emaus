import {
	Entity,
	PrimaryGeneratedColumn,
	Column,
	CreateDateColumn,
	UpdateDateColumn,
	ManyToOne,
	JoinColumn,
	Index,
} from 'typeorm';
import { ScheduleTemplateSet } from './scheduleTemplateSet.entity';

export type ScheduleItemType =
	| 'charla'
	| 'testimonio'
	| 'dinamica'
	| 'misa'
	| 'comida'
	| 'refrigerio'
	| 'traslado'
	| 'campana'
	| 'logistica'
	| 'santisimo'
	| 'descanso'
	| 'oracion'
	| 'otro';

@Entity('schedule_template')
@Index('IDX_schedule_template_set', ['templateSetId'])
export class ScheduleTemplate {
	@PrimaryGeneratedColumn('uuid')
	id!: string;

	@Column({ type: 'uuid', nullable: true })
	templateSetId?: string | null;

	@ManyToOne(() => ScheduleTemplateSet, (s) => s.items, { onDelete: 'CASCADE', nullable: true })
	@JoinColumn({ name: 'templateSetId' })
	templateSet?: ScheduleTemplateSet | null;

	@Column('varchar')
	name!: string;

	@Column('text', { nullable: true })
	description?: string | null;

	@Column('varchar', { default: 'otro' })
	type!: ScheduleItemType;

	@Column('integer', { default: 15 })
	defaultDurationMinutes!: number;

	@Column('integer', { default: 0 })
	defaultOrder!: number;

	@Column('integer', { default: 1 })
	defaultDay!: number;

	@Column('varchar', { nullable: true })
	defaultStartTime?: string | null;

	@Column('boolean', { default: false })
	requiresResponsable!: boolean;

	@Column('text', { nullable: true })
	allowedResponsibilityTypes?: string | null;

	/**
	 * Nombre canónico de la Responsabilidad que cubre este item (ej. 'Comedor',
	 * 'Campanero', 'Charla: De la Rosa'). Al materializar, se hace match exacto
	 * por nombre con las Responsabilidades del retiro destino.
	 */
	@Column('varchar', { nullable: true })
	responsabilityName?: string | null;

	@Column('text', { nullable: true })
	musicTrackUrl?: string | null;

	@Column('text', { nullable: true })
	palanquitaNotes?: string | null;

	@Column('text', { nullable: true })
	planBNotes?: string | null;

	@Column('boolean', { default: false })
	blocksSantisimoAttendance!: boolean;

	@Column('varchar', { nullable: true })
	locationHint?: string | null;

	@Column('boolean', { default: true })
	isActive!: boolean;

	@CreateDateColumn()
	createdAt!: Date;

	@UpdateDateColumn()
	updatedAt!: Date;
}
