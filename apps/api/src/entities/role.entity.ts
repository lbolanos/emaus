import {
	Entity,
	PrimaryGeneratedColumn,
	Column,
	CreateDateColumn,
	UpdateDateColumn,
	OneToOne,
	OneToMany,
} from 'typeorm';
import { RolePermission } from './rolePermission.entity';
import { UserRole } from './userRole.entity';
import { UserRetreat } from './userRetreat.entity';

@Entity('roles')
export class Role {
	@PrimaryGeneratedColumn()
	id!: number;

	@Column({ type: 'varchar', unique: true })
	name!: string;

	@Column({ type: 'varchar', nullable: true })
	description?: string;

	@CreateDateColumn()
	createdAt!: Date;

	@UpdateDateColumn()
	updatedAt!: Date;

	@OneToMany(() => RolePermission, (rolePermission) => rolePermission.role)
	rolePermissions!: RolePermission[];

	@OneToMany(() => UserRole, (userRole) => userRole.role)
	userRoles!: UserRole[];

	@OneToMany(() => UserRetreat, (userRetreat) => userRetreat.role)
	userRetreats!: UserRetreat[];
}
