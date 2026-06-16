import {
	Entity,
	PrimaryGeneratedColumn,
	Column,
	CreateDateColumn,
	UpdateDateColumn,
	ManyToOne,
	JoinColumn,
	Index,
} from 'typeorm';
import { Retreat } from './retreat.entity';
import { Participant } from './participant.entity';
import { User } from './user.entity';

export type CrmTaskStatus = 'open' | 'done';

/**
 * Tarea / recordatorio del coordinador (estilo CRM tasks): "llamar a X",
 * "confirmar pago de Y". Opcionalmente ligada a un participante. Pertenece a un
 * retiro.
 */
@Entity('crm_tasks')
export class CrmTask {
	@PrimaryGeneratedColumn('uuid')
	id!: string;

	@Column({ type: 'uuid' })
	retreatId!: string;

	@ManyToOne(() => Retreat, { onDelete: 'CASCADE' })
	@JoinColumn({ name: 'retreatId' })
	retreat?: Retreat;

	@Column({ type: 'uuid', nullable: true })
	participantId?: string | null;

	@ManyToOne(() => Participant, { onDelete: 'SET NULL' })
	@JoinColumn({ name: 'participantId' })
	participant?: Participant | null;

	@Column({ type: 'varchar', length: 200 })
	title!: string;

	@Column({ type: 'text', nullable: true })
	description?: string | null;

	@Index('IDX_crm_tasks_due')
	@Column({ type: 'datetime', nullable: true })
	dueDate?: Date | null;

	@Column({ type: 'varchar', length: 20, default: 'open' })
	status!: CrmTaskStatus;

	@Column({ type: 'uuid', nullable: true })
	assignedTo?: string | null;

	@ManyToOne(() => User, { onDelete: 'SET NULL' })
	@JoinColumn({ name: 'assignedTo' })
	assignee?: User | null;

	@Column({ type: 'uuid', nullable: true })
	createdBy?: string | null;

	@Column({ type: 'datetime', nullable: true })
	completedAt?: Date | null;

	@CreateDateColumn({ type: 'datetime' })
	createdAt!: Date;

	@UpdateDateColumn({ type: 'datetime' })
	updatedAt!: Date;
}
