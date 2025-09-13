import {
	Entity,
	PrimaryGeneratedColumn,
	Column,
	CreateDateColumn,
	ManyToOne,
	JoinColumn,
} from 'typeorm';
import { User } from './user.entity';
import { Role } from './role.entity';

@Entity('user_roles')
export class UserRole {
	@PrimaryGeneratedColumn()
	id!: number;

	@Column({ type: 'varchar' })
	userId!: string;

	@Column({ type: 'integer' })
	roleId!: number;

	@CreateDateColumn()
	createdAt!: Date;

	@ManyToOne(() => User, (user) => user.userRoles, { onDelete: 'CASCADE' })
	@JoinColumn({ name: 'userId' })
	user!: User;

	@ManyToOne(() => Role, (role) => role.userRoles, { onDelete: 'CASCADE' })
	@JoinColumn({ name: 'roleId' })
	role!: Role;
}
