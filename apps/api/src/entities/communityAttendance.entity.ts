import {
	Entity,
	PrimaryGeneratedColumn,
	Column,
	ManyToOne,
	JoinColumn,
	CreateDateColumn,
} from 'typeorm';
import { CommunityMeeting } from './communityMeeting.entity';
import { CommunityMember } from './communityMember.entity';

@Entity()
export class CommunityAttendance {
	@PrimaryGeneratedColumn('uuid')
	id!: string;

	@Column({ type: 'uuid' })
	meetingId!: string;

	@ManyToOne(() => CommunityMeeting, (meeting) => meeting.attendances, { onDelete: 'CASCADE' })
	@JoinColumn({ name: 'meetingId' })
	meeting!: CommunityMeeting;

	@Column({ type: 'uuid' })
	memberId!: string;

	@ManyToOne(() => CommunityMember, (member) => member.attendances, { onDelete: 'CASCADE' })
	@JoinColumn({ name: 'memberId' })
	member!: CommunityMember;

	@Column({ type: 'boolean', default: false })
	attended!: boolean;

	@Column({ type: 'text', nullable: true })
	notes?: string;

	@CreateDateColumn()
	recordedAt!: Date;
}
