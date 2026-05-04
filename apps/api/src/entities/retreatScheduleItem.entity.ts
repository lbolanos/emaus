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
import { ScheduleTemplate } from './scheduleTemplate.entity';
import type { ScheduleItemType } from './scheduleTemplate.entity';
import { Responsability } from './responsability.entity';
import { RetreatScheduleItemResponsable } from './retreatScheduleItemResponsable.entity';

export type ScheduleItemStatus = 'pending' | 'active' | 'completed' | 'delayed' | 'skipped';

@Entity('retreat_schedule_item')
@Index('IDX_rsi_retreat_start', ['retreatId', 'startTime'])
export class RetreatScheduleItem {
	@PrimaryGeneratedColumn('uuid')
	id!: string;

	@Column({ type: 'uuid' })
	retreatId!: string;

	@ManyToOne(() => Retreat, { onDelete: 'CASCADE' })
	@JoinColumn({ name: 'retreatId' })
	retreat?: Retreat;

	@Column({ type: 'uuid', nullable: true })
	scheduleTemplateId?: string | null;

	@ManyToOne(() => ScheduleTemplate, { onDelete: 'SET NULL', nullable: true })
	@JoinColumn({ name: 'scheduleTemplateId' })
	scheduleTemplate?: ScheduleTemplate | null;

	@Column('varchar')
	name!: string;

	@Column('varchar', { default: 'otro' })
	type!: ScheduleItemType;

	@Column({ type: 'integer', default: 1 })
	day!: number;

	@Column({ type: 'datetime' })
	startTime!: Date;

	@Column({ type: 'datetime' })
	endTime!: Date;

	@Column({ type: 'integer', default: 15 })
	durationMinutes!: number;

	@Column({ type: 'integer', default: 0 })
	orderInDay!: number;

	@Column('varchar', { default: 'pending' })
	status!: ScheduleItemStatus;

	@Column({ type: 'uuid', nullable: true })
	responsabilityId?: string | null;

	@ManyToOne(() => Responsability, { onDelete: 'SET NULL', nullable: true })
	@JoinColumn({ name: 'responsabilityId' })
	responsability?: Responsability | null;

	@Column('text', { nullable: true })
	location?: string | null;

	@Column('text', { nullable: true })
	notes?: string | null;

	@Column('text', { nullable: true })
	musicTrackUrl?: string | null;

	@Column('text', { nullable: true })
	palanquitaNotes?: string | null;

	@Column('text', { nullable: true })
	planBNotes?: string | null;

	@Column('boolean', { default: false })
	blocksSantisimoAttendance!: boolean;

	@Column({ type: 'datetime', nullable: true })
	actualStartTime?: Date | null;

	@Column({ type: 'datetime', nullable: true })
	actualEndTime?: Date | null;

	@OneToMany(() => RetreatScheduleItemResponsable, (r) => r.scheduleItem)
	responsables?: RetreatScheduleItemResponsable[];

	@CreateDateColumn()
	createdAt!: Date;

	@UpdateDateColumn()
	updatedAt!: Date;
}
