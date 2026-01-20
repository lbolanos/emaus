import {
	Entity,
	PrimaryGeneratedColumn,
	Column,
	ManyToOne,
	JoinColumn,
	CreateDateColumn,
} from 'typeorm';
import { User } from './user.entity';
import { Participant } from './participant.entity';
import { Retreat } from './retreat.entity';

@Entity('participant_history')
export class ParticipantHistory {
	@PrimaryGeneratedColumn('uuid')
	id!: string;

	@Column({ type: 'uuid' })
	userId!: string;

	@ManyToOne(() => User, { onDelete: 'CASCADE' })
	@JoinColumn({ name: 'userId' })
	user!: User;

	@Column({ type: 'uuid', nullable: true })
	participantId?: string | null;

	@ManyToOne(() => Participant, { onDelete: 'SET NULL', nullable: true })
	@JoinColumn({ name: 'participantId' })
	participant?: Participant | null;

	@Column({ type: 'uuid' })
	retreatId!: string;

	@ManyToOne(() => Retreat, (retreat) => retreat.history, { onDelete: 'CASCADE' })
	@JoinColumn({ name: 'retreatId' })
	retreat!: Retreat;

	@Column({ type: 'varchar' })
	roleInRetreat!: string;

	@Column({ type: 'boolean', default: false })
	isPrimaryRetreat!: boolean; // Marks if this is their "main" retreat

	@Column({ type: 'text', nullable: true })
	notes?: string;

	@Column({ type: 'json', nullable: true })
	metadata?: Record<string, any>; // Flexible storage for additional data

	@CreateDateColumn()
	createdAt!: Date;
}
