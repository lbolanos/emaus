import {
	Entity,
	PrimaryColumn,
	Column,
	CreateDateColumn,
	Index,
	ManyToOne,
	JoinColumn,
} from 'typeorm';
import { User } from './user.entity';

export type FriendStatus = 'pending' | 'accepted' | 'blocked';

@Entity('friends')
@Index(['userId', 'friendId'], { unique: true })
export class Friend {
	@PrimaryColumn('uuid')
	userId!: string;

	@PrimaryColumn('uuid')
	friendId!: string;

	@Column({
		type: 'varchar',
		default: 'pending',
	})
	status!: FriendStatus;

	@CreateDateColumn()
	createdAt!: Date;

	@Column({ type: 'datetime', nullable: true })
	respondedAt?: Date | null;

	// Track who initiated the request (true if userId initiated, false if friendId initiated)
	@Column({ type: 'boolean', default: true })
	initiatedByUser!: boolean;

	// Relationships
	@ManyToOne(() => User, { onDelete: 'CASCADE' })
	@JoinColumn({ name: 'userId' })
	user!: User;

	@ManyToOne(() => User, { onDelete: 'CASCADE' })
	@JoinColumn({ name: 'friendId' })
	friend!: User;
}
