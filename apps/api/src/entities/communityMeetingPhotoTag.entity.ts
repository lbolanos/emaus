import {
	Entity,
	PrimaryGeneratedColumn,
	Column,
	ManyToOne,
	JoinColumn,
	CreateDateColumn,
	Index,
} from 'typeorm';
import { CommunityMeeting } from './communityMeeting.entity';
import { CommunityMember } from './communityMember.entity';

/**
 * A confirmed face on a meeting's cover photo: the box (normalised 0-1000, as the face model
 * returns it) of one member. Feeds the public album. One tag per (meeting, member). Replacing
 * or deleting the cover photo deletes the meeting's tags.
 */
@Entity('community_meeting_photo_tag')
@Index('UQ_meeting_photo_tag_meeting_member', ['meetingId', 'memberId'], { unique: true })
export class CommunityMeetingPhotoTag {
	@PrimaryGeneratedColumn('uuid')
	id!: string;

	@Column({ type: 'uuid' })
	meetingId!: string;

	@ManyToOne(() => CommunityMeeting, { onDelete: 'CASCADE' })
	@JoinColumn({ name: 'meetingId' })
	meeting!: CommunityMeeting;

	@Column({ type: 'uuid' })
	memberId!: string;

	@ManyToOne(() => CommunityMember, { onDelete: 'CASCADE' })
	@JoinColumn({ name: 'memberId' })
	member!: CommunityMember;

	@Column({ type: 'integer' })
	yMin!: number;

	@Column({ type: 'integer' })
	xMin!: number;

	@Column({ type: 'integer' })
	yMax!: number;

	@Column({ type: 'integer' })
	xMax!: number;

	@CreateDateColumn()
	createdAt!: Date;
}
