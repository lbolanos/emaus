import {
	Entity,
	PrimaryColumn,
	Column,
	CreateDateColumn,
	UpdateDateColumn,
	OneToOne,
	JoinColumn,
} from 'typeorm';
import { User } from './user.entity';

@Entity('user_profiles')
export class UserProfile {
	@PrimaryColumn('uuid')
	userId!: string;

	@Column({ type: 'text', nullable: true })
	bio?: string | null;

	@Column({ type: 'varchar', nullable: true })
	location?: string | null;

	@Column({ type: 'varchar', nullable: true })
	website?: string | null;

	@Column({ type: 'boolean', default: false })
	showEmail!: boolean;

	@Column({ type: 'boolean', default: false })
	showPhone!: boolean;

	@Column({ type: 'boolean', default: true })
	showRetreats!: boolean;

	@Column({ type: 'simple-array', nullable: true })
	interests?: string[] | null;

	@Column({ type: 'simple-array', nullable: true })
	skills?: string[] | null;

	@Column({ type: 'varchar', nullable: true })
	avatarUrl?: string | null;

	@CreateDateColumn()
	createdAt!: Date;

	@UpdateDateColumn()
	updatedAt!: Date;

	@OneToOne(() => User, (user) => user.profile, { onDelete: 'CASCADE' })
	@JoinColumn({ name: 'userId' })
	user!: User;
}
