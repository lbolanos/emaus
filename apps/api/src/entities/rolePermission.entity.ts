import {
	Entity,
	PrimaryGeneratedColumn,
	Column,
	CreateDateColumn,
	ManyToOne,
	JoinColumn,
} from 'typeorm';
import { Role } from './role.entity';
import { Permission } from './permission.entity';

@Entity('role_permissions')
export class RolePermission {
	@PrimaryGeneratedColumn()
	id!: number;

	@Column({ type: 'integer' })
	roleId!: number;

	@Column({ type: 'integer' })
	permissionId!: number;

	@CreateDateColumn()
	createdAt!: Date;

	@ManyToOne(() => Role, (role) => role.rolePermissions, { onDelete: 'CASCADE' })
	@JoinColumn({ name: 'roleId' })
	role!: Role;

	@ManyToOne(() => Permission, (permission) => permission.rolePermissions, { onDelete: 'CASCADE' })
	@JoinColumn({ name: 'permissionId' })
	permission!: Permission;
}
