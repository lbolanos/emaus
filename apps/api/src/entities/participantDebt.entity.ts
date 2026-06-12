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

/**
 * Deuda manual agregada a un participante (servidor o angelito) por el tesorero.
 * Espejo conceptual de `Payment`: entrada de datos arbitraria (descripción + monto)
 * que suma al monto esperado del participante (ver Participant.getExpectedAmount).
 */
@Entity('participant_debts')
export class ParticipantDebt {
	@PrimaryGeneratedColumn('uuid')
	id!: string;

	@Column({ type: 'uuid' })
	participantId!: string;

	@ManyToOne(() => Participant, (participant) => participant.debts, { onDelete: 'CASCADE' })
	@JoinColumn({ name: 'participantId' })
	participant!: Participant;

	@Column({ type: 'uuid' })
	retreatId!: string;

	@ManyToOne(() => Retreat, { onDelete: 'CASCADE' })
	@JoinColumn({ name: 'retreatId' })
	retreat!: Retreat;

	@Column({ type: 'decimal', precision: 10, scale: 2 })
	amount!: number;

	@Column({ type: 'varchar', nullable: true })
	description?: string;

	@Column({ type: 'uuid', nullable: true })
	recordedBy?: string;

	@ManyToOne(() => User, { onDelete: 'SET NULL' })
	@JoinColumn({ name: 'recordedBy' })
	recordedByUser?: User;

	@CreateDateColumn({ type: 'datetime' })
	createdAt!: Date;

	@UpdateDateColumn({ type: 'datetime' })
	updatedAt!: Date;
}
