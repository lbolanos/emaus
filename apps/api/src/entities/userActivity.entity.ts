import {
	Entity,
	PrimaryGeneratedColumn,
	Column,
	CreateDateColumn,
	ManyToOne,
	JoinColumn,
} from 'typeorm';
import { User } from './user.entity';

export type ActivityType =
	| 'profile_updated'
	| 'friend_request_sent'
	| 'friend_request_accepted'
	| 'followed_user'
	| 'became_server'
	| 'joined_retreat'
	| 'post_created'
	| 'comment_created'
	| 'milestone_achieved';

@Entity('user_activities')
export class UserActivity {
	@PrimaryGeneratedColumn('uuid')
	id!: string;

	@Column({ type: 'uuid' })
	userId!: string;

	@Column({
		type: 'varchar',
	})
	activityType!: ActivityType;

	@Column({ type: 'text', nullable: true })
	description?: string | null;

	@Column({ type: 'json', nullable: true })
	metadata?: Record<string, any> | null;

	@CreateDateColumn()
	createdAt!: Date;

	@ManyToOne(() => User, { onDelete: 'CASCADE' })
	@JoinColumn({ name: 'userId' })
	user!: User;
}
