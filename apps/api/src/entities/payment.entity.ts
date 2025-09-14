import {
	Entity,
	PrimaryGeneratedColumn,
	Column,
	ManyToOne,
	JoinColumn,
	CreateDateColumn,
	UpdateDateColumn,
} from 'typeorm';
import { Participant } from './participant.entity';
import { Retreat } from './retreat.entity';
import { User } from './user.entity';
import { DateTransformer } from '../utils/date.transformer';

export type PaymentMethod = 'cash' | 'transfer' | 'check' | 'card' | 'other';

@Entity()
export class Payment {
	@PrimaryGeneratedColumn('uuid')
	id!: string;

	@Column({ type: 'uuid' })
	participantId!: string;

	@ManyToOne(() => Participant, (participant) => participant.payments, { onDelete: 'CASCADE' })
	@JoinColumn({ name: 'participantId' })
	participant!: Participant;

	@Column({ type: 'uuid' })
	retreatId!: string;

	@ManyToOne(() => Retreat, (retreat) => retreat.payments, { onDelete: 'CASCADE' })
	@JoinColumn({ name: 'retreatId' })
	retreat!: Retreat;

	@Column({ type: 'decimal', precision: 10, scale: 2 })
	amount!: number;

	@Column({
		type: 'date',
		transformer: new DateTransformer(),
	})
	paymentDate!: Date;

	@Column({
		type: 'varchar',
	})
	paymentMethod!: PaymentMethod;

	@Column({ type: 'varchar', nullable: true })
	referenceNumber?: string;

	@Column({ type: 'text', nullable: true })
	notes?: string;

	@Column({ type: 'uuid' })
	recordedBy!: string;

	@ManyToOne(() => User, (user) => user.recordedPayments, { onDelete: 'SET NULL' })
	@JoinColumn({ name: 'recordedBy' })
	recordedByUser!: User;

	@CreateDateColumn({ type: 'datetime' })
	createdAt!: Date;

	@UpdateDateColumn({ type: 'datetime' })
	updatedAt!: Date;
}
