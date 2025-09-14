import {
	Entity,
	PrimaryGeneratedColumn,
	Column,
	CreateDateColumn,
	UpdateDateColumn,
	ManyToOne,
	JoinColumn,
} from 'typeorm';
import { User } from './user.entity';
import { Retreat } from './retreat.entity';
import { Role } from './role.entity';

@Entity('user_retreats')
export class UserRetreat {
	@PrimaryGeneratedColumn()
	id!: number;

	@Column({ type: 'varchar' })
	userId!: string;

	@Column({ type: 'varchar' })
	retreatId!: string;

	@Column({ type: 'integer' })
	roleId!: number;

	@Column({ type: 'varchar', nullable: true })
	invitedBy?: string;

	@ManyToOne(() => User, (user) => user.sentInvitations, { onDelete: 'SET NULL' })
	@JoinColumn({ name: 'invitedBy' })
	inviter?: User;

	@Column({ type: 'datetime', nullable: true })
	invitedAt?: Date;

	@Column({ type: 'datetime', nullable: true })
	expiresAt?: Date;

	@Column({
		type: 'varchar',
		default: 'active',
		enum: ['pending', 'active', 'expired', 'revoked'],
	})
	status!: string;

	@Column({ type: 'text', nullable: true })
	permissionsOverride?: string;

	@CreateDateColumn()
	createdAt!: Date;

	@UpdateDateColumn()
	updatedAt!: Date;

	@ManyToOne(() => User, (user) => user.userRetreats, { onDelete: 'CASCADE' })
	@JoinColumn({ name: 'userId' })
	user!: User;

	@ManyToOne(() => Retreat, (retreat) => retreat.userRetreats, { onDelete: 'CASCADE' })
	@JoinColumn({ name: 'retreatId' })
	retreat!: Retreat;

	@ManyToOne(() => Role, (role) => role.userRetreats, { onDelete: 'CASCADE' })
	@JoinColumn({ name: 'roleId' })
	role!: Role;
}
