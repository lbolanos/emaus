import {
	Entity,
	PrimaryGeneratedColumn,
	Column,
	ManyToOne,
	JoinColumn,
	CreateDateColumn,
} from 'typeorm';
import { Community } from './community.entity';
import { User } from './user.entity';

@Entity()
export class CommunityAdmin {
	@PrimaryGeneratedColumn('uuid')
	id!: string;

	@Column({ type: 'uuid' })
	communityId!: string;

	@ManyToOne(() => Community, (community) => community.admins, { onDelete: 'CASCADE' })
	@JoinColumn({ name: 'communityId' })
	community!: Community;

	@Column({ type: 'uuid' })
	userId!: string;

	@ManyToOne(() => User, { onDelete: 'CASCADE' })
	@JoinColumn({ name: 'userId' })
	user!: User;

	@Column({
		type: 'varchar',
		default: 'admin',
	})
	role!: 'owner' | 'admin';

	@Column({ type: 'uuid', nullable: true })
	invitedBy?: string;

	@ManyToOne(() => User, { nullable: true })
	@JoinColumn({ name: 'invitedBy' })
	inviter?: User;

	@CreateDateColumn()
	invitedAt!: Date;

	@Column({ type: 'datetime', nullable: true })
	acceptedAt?: Date;

	@Column({
		type: 'varchar',
		default: 'pending',
	})
	status!: 'pending' | 'active' | 'revoked';

	@Column({ type: 'varchar', nullable: true })
	invitationToken?: string;

	@Column({ type: 'datetime', nullable: true })
	invitationExpiresAt?: Date;
}
