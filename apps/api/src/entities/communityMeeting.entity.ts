import {
	Entity,
	PrimaryGeneratedColumn,
	Column,
	ManyToOne,
	JoinColumn,
	CreateDateColumn,
	OneToMany,
} from 'typeorm';
import { Community } from './community.entity';
import { CommunityAttendance } from './communityAttendance.entity';

@Entity()
export class CommunityMeeting {
	@PrimaryGeneratedColumn('uuid')
	id!: string;

	@Column({ type: 'uuid' })
	communityId!: string;

	@ManyToOne(() => Community, (community) => community.meetings, { onDelete: 'CASCADE' })
	@JoinColumn({ name: 'communityId' })
	community!: Community;

	@Column('varchar')
	title!: string;

	@Column({ type: 'text', nullable: true })
	description?: string;

	@Column({ type: 'text', nullable: true, name: 'flyer_template' })
	flyerTemplate?: string;

	@Column('datetime')
	startDate!: Date;

	@Column({ type: 'datetime', nullable: true })
	endDate?: Date;

	@Column('int')
	durationMinutes!: number;

	@Column({ type: 'boolean', default: false })
	isAnnouncement!: boolean;

	// Recurrence configuration
	@Column({ type: 'varchar', nullable: true })
	recurrenceFrequency?: 'daily' | 'weekly' | 'monthly' | null;

	@Column({ type: 'int', nullable: true })
	recurrenceInterval?: number | null;

	@Column({ type: 'varchar', nullable: true })
	recurrenceDayOfWeek?: string | null;

	@Column({ type: 'int', nullable: true })
	recurrenceDayOfMonth?: number | null;

	// Instance management
	@Column({ type: 'uuid', nullable: true })
	parentMeetingId?: string | null;

	@Column({ type: 'boolean', default: false })
	isRecurrenceTemplate?: boolean;

	@Column({ type: 'date', nullable: true })
	instanceDate?: Date | null;

	@Column({ type: 'varchar', nullable: true })
	exceptionType?: 'modified' | 'cancelled' | null;

	// Relationships
	@OneToMany(() => CommunityAttendance, (attendance) => attendance.meeting)
	attendances!: CommunityAttendance[];

	// Self-referential relationship for recurrence instances
	@ManyToOne(() => CommunityMeeting, { onDelete: 'CASCADE', nullable: true })
	@JoinColumn({ name: 'parentMeetingId' })
	parentMeeting?: CommunityMeeting;

	@OneToMany(() => CommunityMeeting, (meeting) => meeting.parentMeeting)
	instances?: CommunityMeeting[];

	@CreateDateColumn()
	createdAt!: Date;
}
