import {
	Entity,
	PrimaryGeneratedColumn,
	Column,
	ManyToOne,
	JoinColumn,
	Index,
	Unique,
} from 'typeorm';
import { Participant } from './participant.entity';
import { RetreatShirtType } from './retreatShirtType.entity';

@Entity('participant_shirt_size')
@Index('IDX_psize_participant', ['participantId'])
@Index('IDX_psize_shirtType', ['shirtTypeId'])
@Unique('UQ_psize_participant_shirtType', ['participantId', 'shirtTypeId'])
export class ParticipantShirtSize {
	@PrimaryGeneratedColumn('uuid')
	id!: string;

	@Column('uuid')
	participantId!: string;

	@ManyToOne(() => Participant, { onDelete: 'CASCADE' })
	@JoinColumn({ name: 'participantId' })
	participant!: Participant;

	@Column('uuid')
	shirtTypeId!: string;

	@ManyToOne(() => RetreatShirtType, { onDelete: 'CASCADE' })
	@JoinColumn({ name: 'shirtTypeId' })
	shirtType!: RetreatShirtType;

	@Column('varchar')
	size!: string;
}
