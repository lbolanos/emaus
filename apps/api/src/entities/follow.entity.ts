import {
	Entity,
	PrimaryGeneratedColumn,
	Column,
	CreateDateColumn,
	Index,
	ManyToOne,
	JoinColumn,
} from 'typeorm';
import { User } from './user.entity';

@Entity('follows')
@Index(['followerId', 'followingId'], { unique: true })
export class Follow {
	@PrimaryGeneratedColumn('uuid')
	id!: string;

	@Column({ type: 'uuid' })
	followerId!: string;

	@Column({ type: 'uuid' })
	followingId!: string;

	@CreateDateColumn()
	createdAt!: Date;

	// Relationships
	@ManyToOne(() => User, { onDelete: 'CASCADE' })
	@JoinColumn({ name: 'followerId' })
	follower!: User;

	@ManyToOne(() => User, { onDelete: 'CASCADE' })
	@JoinColumn({ name: 'followingId' })
	following!: User;
}
