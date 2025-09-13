import {
	Entity,
	PrimaryGeneratedColumn,
	Column,
	CreateDateColumn,
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

	@CreateDateColumn()
	createdAt!: Date;

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
