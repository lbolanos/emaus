import {
	Entity,
	PrimaryColumn,
	Column,
	CreateDateColumn,
	UpdateDateColumn,
	ManyToOne,
	JoinColumn,
} from 'typeorm';
import { User } from './user.entity';

@Entity('role_requests')
export class RoleRequest {
	@PrimaryColumn('uuid')
	id!: string;

	@Column({ type: 'varchar', length: 36 })
	userId!: string;

	@Column({ type: 'varchar', length: 36 })
	retreatId!: string;

	@Column({ type: 'integer' })
	requestedRoleId!: number;

	@Column({ type: 'varchar' })
	requestedRole!: string;

	@Column({ type: 'text', nullable: true })
	message?: string;

	@Column({
		type: 'varchar',
		default: 'pending',
		enum: ['pending', 'approved', 'rejected'],
	})
	status!: 'pending' | 'approved' | 'rejected';

	@Column({ type: 'text', nullable: true })
	rejectionReason?: string;

	@Column({ type: 'varchar', length: 36, nullable: true })
	reviewedBy?: string;

	@Column({ type: 'timestamp', nullable: true })
	reviewedAt?: Date;

	@CreateDateColumn()
	requestedAt!: Date;

	@UpdateDateColumn()
	updatedAt!: Date;

	@ManyToOne(() => User)
	@JoinColumn({ name: 'userId' })
	user?: User;
}
