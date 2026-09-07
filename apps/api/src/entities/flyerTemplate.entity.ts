import {
	Entity,
	PrimaryGeneratedColumn,
	Column,
	CreateDateColumn,
	UpdateDateColumn,
	ManyToOne,
	JoinColumn,
} from 'typeorm';
import { Community } from './community.entity';
import { User } from './user.entity';

/**
 * A reusable flyer design: a snapshot of a retreat's flyer_options (block layout,
 * images and text overrides) that can be applied to another retreat.
 *
 * Scope is chosen by the author, not derived from a retreat: `retreat` has no foreign
 * key to `community`, so there is no relational path to infer it from.
 */
@Entity('flyer_templates')
export class FlyerTemplate {
	@PrimaryGeneratedColumn('uuid')
	id!: string;

	@Column({ type: 'varchar', length: 255 })
	name!: string;

	@Column({
		type: 'varchar',
		enum: ['personal', 'community'],
		default: 'personal',
	})
	scope!: 'personal' | 'community';

	/** Set only for community-scoped templates. */
	@Column({ type: 'uuid', nullable: true })
	communityId?: string;

	@ManyToOne(() => Community, { onDelete: 'CASCADE' })
	@JoinColumn({ name: 'communityId' })
	community?: Community;

	@Column({ type: 'uuid', nullable: true })
	createdBy?: string;

	@ManyToOne(() => User, { onDelete: 'SET NULL' })
	@JoinColumn({ name: 'createdBy' })
	creator?: User;

	/** A complete flyer_options v2 payload. */
	@Column({ type: 'simple-json' })
	layout!: Record<string, any>;

	@CreateDateColumn()
	createdAt!: Date;

	@UpdateDateColumn()
	updatedAt!: Date;
}
