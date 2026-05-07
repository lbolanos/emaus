import {
	Entity,
	PrimaryGeneratedColumn,
	Column,
	ManyToOne,
	JoinColumn,
	CreateDateColumn,
	UpdateDateColumn,
	OneToMany,
} from 'typeorm';
import { User } from './user.entity';
import { CommunityMember } from './communityMember.entity';
import { CommunityMeeting } from './communityMeeting.entity';
import { CommunityAdmin } from './communityAdmin.entity';

export type CommunityStatus = 'pending' | 'active' | 'rejected';

@Entity()
export class Community {
	@PrimaryGeneratedColumn('uuid')
	id!: string;

	@Column('varchar')
	name!: string;

	@Column({ type: 'text', nullable: true })
	description?: string;

	@Column('varchar')
	address1!: string;

	@Column({ type: 'varchar', nullable: true })
	address2?: string;

	@Column('varchar')
	city!: string;

	@Column('varchar')
	state!: string;

	@Column('varchar')
	zipCode!: string;

	@Column('varchar')
	country!: string;

	@Column({ type: 'float', nullable: true })
	latitude?: number;

	@Column({ type: 'float', nullable: true })
	longitude?: number;

	@Column({ type: 'varchar', nullable: true })
	googleMapsUrl?: string;

	@Column({ type: 'uuid', nullable: true })
	createdBy?: string | null;

	@ManyToOne(() => User, { nullable: true })
	@JoinColumn({ name: 'createdBy' })
	creator?: User | null;

	@Column({ type: 'varchar', length: 20, default: 'active' })
	status!: CommunityStatus;

	@Column({ type: 'varchar', nullable: true })
	parish?: string;

	@Column({ type: 'varchar', nullable: true })
	diocese?: string;

	@Column({ type: 'varchar', nullable: true })
	website?: string;

	@Column({ type: 'varchar', nullable: true })
	facebookUrl?: string;

	@Column({ type: 'varchar', nullable: true })
	instagramUrl?: string;

	@Column({ type: 'varchar', nullable: true })
	contactName?: string;

	@Column({ type: 'varchar', nullable: true })
	contactEmail?: string;

	@Column({ type: 'varchar', nullable: true })
	contactPhone?: string;

	@Column({ type: 'datetime', nullable: true })
	submittedAt?: Date;

	@Column({ type: 'datetime', nullable: true })
	approvedAt?: Date;

	@Column({ type: 'uuid', nullable: true })
	approvedBy?: string | null;

	@ManyToOne(() => User, { nullable: true })
	@JoinColumn({ name: 'approvedBy' })
	approver?: User | null;

	@Column({ type: 'text', nullable: true })
	rejectionReason?: string;

	@Column({ type: 'varchar', length: 20, nullable: true })
	defaultMeetingDayOfWeek?: string;

	@Column({ type: 'int', nullable: true })
	defaultMeetingInterval?: number;

	@Column({ type: 'varchar', length: 5, nullable: true })
	defaultMeetingTime?: string;

	@Column({ type: 'int', nullable: true })
	defaultMeetingDurationMinutes?: number;

	@Column({ type: 'text', nullable: true })
	defaultMeetingDescription?: string;

	@OneToMany(() => CommunityMember, (member) => member.community)
	members!: CommunityMember[];

	@OneToMany(() => CommunityMeeting, (meeting) => meeting.community)
	meetings!: CommunityMeeting[];

	@OneToMany(() => CommunityAdmin, (admin) => admin.community)
	admins!: CommunityAdmin[];

	@CreateDateColumn()
	createdAt!: Date;

	@UpdateDateColumn()
	updatedAt!: Date;
}
