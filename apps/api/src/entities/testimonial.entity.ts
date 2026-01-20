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
import { User } from './user.entity';
import { Retreat } from './retreat.entity';

export type TestimonialVisibility = 'public' | 'friends' | 'retreat_participants' | 'private';

@Entity('testimonials')
@Index(['userId'])
@Index(['retreatId'])
export class Testimonial {
	@PrimaryGeneratedColumn()
	id!: number;

	@Column({ type: 'varchar' })
	userId!: string;

	@Column({ type: 'varchar', nullable: true })
	retreatId?: string | null;

	@Column({ type: 'text' })
	content!: string;

	@Column({
		type: 'varchar',
		default: 'private',
	})
	visibility!: TestimonialVisibility;

	@Column({ type: 'boolean', default: false })
	allowLandingPage!: boolean;

	@Column({ type: 'boolean', default: false })
	approvedForLanding!: boolean;

	@CreateDateColumn()
	createdAt!: Date;

	@UpdateDateColumn()
	updatedAt!: Date;

	// Relationships
	@ManyToOne(() => User, { onDelete: 'CASCADE' })
	@JoinColumn({ name: 'userId' })
	user!: User;

	@ManyToOne(() => Retreat, { onDelete: 'SET NULL', nullable: true })
	@JoinColumn({ name: 'retreatId' })
	retreat?: Retreat;
}
