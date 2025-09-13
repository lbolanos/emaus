import {
	Entity,
	PrimaryGeneratedColumn,
	Column,
	CreateDateColumn,
	UpdateDateColumn,
	OneToMany,
} from 'typeorm';
import { RolePermission } from './rolePermission.entity';

@Entity('permissions')
export class Permission {
	@PrimaryGeneratedColumn()
	id!: number;

	@Column({ type: 'varchar' })
	resource!: string;

	@Column({ type: 'varchar' })
	operation!: string;

	@Column({ type: 'varchar', nullable: true })
	description?: string;

	@CreateDateColumn()
	createdAt!: Date;

	@UpdateDateColumn()
	updatedAt!: Date;

	@OneToMany(() => RolePermission, (rolePermission) => rolePermission.permission)
	rolePermissions!: RolePermission[];
}
