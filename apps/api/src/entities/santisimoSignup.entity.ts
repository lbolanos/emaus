import {
	Entity,
	PrimaryGeneratedColumn,
	Column,
	CreateDateColumn,
	ManyToOne,
	JoinColumn,
	Index,
} from 'typeorm';
import { SantisimoSlot } from './santisimoSlot.entity';
import { User } from './user.entity';

@Entity('santisimo_signup')
export class SantisimoSignup {
	@PrimaryGeneratedColumn('uuid')
	id!: string;

	@Column({ type: 'uuid' })
	@Index('IDX_santisimo_signup_slot')
	slotId!: string;

	@ManyToOne(() => SantisimoSlot, (slot) => slot.signups, { onDelete: 'CASCADE' })
	@JoinColumn({ name: 'slotId' })
	slot?: SantisimoSlot;

	@Column({ type: 'varchar', length: 120 })
	name!: string;

	@Column({ type: 'varchar', length: 40, nullable: true })
	phone?: string | null;

	@Column({ type: 'varchar', length: 160, nullable: true })
	email?: string | null;

	@Column({ type: 'uuid', nullable: true })
	userId?: string | null;

	@ManyToOne(() => User, { onDelete: 'SET NULL' })
	@JoinColumn({ name: 'userId' })
	user?: User | null;

	@Column({ type: 'varchar', length: 48, nullable: true, unique: true })
	cancelToken?: string | null;

	@Column({ type: 'varchar', length: 64, nullable: true })
	ipAddress?: string | null;

	@Column({ type: 'boolean', default: false })
	isAngelito!: boolean;

	@Column({ type: 'boolean', default: false })
	autoAssigned!: boolean;

	@Column({ type: 'uuid', nullable: true })
	participantId?: string | null;

	@CreateDateColumn()
	createdAt!: Date;
}
