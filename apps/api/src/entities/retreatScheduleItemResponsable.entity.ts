import {
	Entity,
	PrimaryGeneratedColumn,
	Column,
	ManyToOne,
	JoinColumn,
	Index,
	CreateDateColumn,
} from 'typeorm';
import { RetreatScheduleItem } from './retreatScheduleItem.entity';
import { Participant } from './participant.entity';

@Entity('retreat_schedule_item_responsable')
@Index('IDX_rsir_item', ['scheduleItemId'])
@Index('IDX_rsir_participant', ['participantId'])
export class RetreatScheduleItemResponsable {
	@PrimaryGeneratedColumn('uuid')
	id!: string;

	@Column({ type: 'uuid' })
	scheduleItemId!: string;

	@ManyToOne(() => RetreatScheduleItem, (it) => it.responsables, { onDelete: 'CASCADE' })
	@JoinColumn({ name: 'scheduleItemId' })
	scheduleItem?: RetreatScheduleItem;

	@Column({ type: 'uuid' })
	participantId!: string;

	@ManyToOne(() => Participant, { onDelete: 'CASCADE' })
	@JoinColumn({ name: 'participantId' })
	participant?: Participant;

	@Column('varchar', { nullable: true })
	role?: string | null;

	@CreateDateColumn()
	createdAt!: Date;
}
