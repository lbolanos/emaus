import {
	Entity,
	PrimaryGeneratedColumn,
	Column,
	CreateDateColumn,
	UpdateDateColumn,
	ManyToOne,
	OneToMany,
	JoinColumn,
	Index,
} from 'typeorm';
import { Retreat } from './retreat.entity';
import { SantisimoSignup } from './santisimoSignup.entity';

@Entity('santisimo_slot')
@Index('IDX_santisimo_slot_retreat_start', ['retreatId', 'startTime'], { unique: true })
export class SantisimoSlot {
	@PrimaryGeneratedColumn('uuid')
	id!: string;

	@Column({ type: 'uuid' })
	retreatId!: string;

	@ManyToOne(() => Retreat, { onDelete: 'CASCADE' })
	@JoinColumn({ name: 'retreatId' })
	retreat?: Retreat;

	@Column({ type: 'datetime' })
	startTime!: Date;

	@Column({ type: 'datetime' })
	endTime!: Date;

	@Column({ type: 'int', default: 1 })
	capacity!: number;

	@Column({ type: 'boolean', default: false })
	isDisabled!: boolean;

	@Column({ type: 'text', nullable: true })
	intention?: string | null;

	@Column({ type: 'text', nullable: true })
	notes?: string | null;

	@OneToMany(() => SantisimoSignup, (signup) => signup.slot)
	signups?: SantisimoSignup[];

	@CreateDateColumn()
	createdAt!: Date;

	@UpdateDateColumn()
	updatedAt!: Date;
}
