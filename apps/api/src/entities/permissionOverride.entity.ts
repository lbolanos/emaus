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

@Entity('permission_overrides')
export class PermissionOverride {
	@PrimaryColumn('uuid')
	id!: string;

	@Column({ type: 'varchar', length: 36 })
	userId!: string;

	@Column({ type: 'varchar', length: 36 })
	retreatId!: string;

	@Column({ type: 'json' })
	overrides!: Array<{
		resource: string;
		operation: string;
		granted: boolean;
	}>;

	@Column({ type: 'text', nullable: true })
	reason?: string;

	@Column({ type: 'varchar', length: 36 })
	setBy!: string;

	@CreateDateColumn()
	createdAt!: Date;

	@UpdateDateColumn()
	updatedAt!: Date;

	@ManyToOne(() => User)
	@JoinColumn({ name: 'userId' })
	user?: User;
}
