import {
	Entity,
	PrimaryGeneratedColumn,
	Column,
	ManyToOne,
	JoinColumn,
	CreateDateColumn,
} from 'typeorm';
import { Participant } from './participant.entity';
import { Tag } from './tag.entity';

@Entity('participant_tags')
export class ParticipantTag {
	@PrimaryGeneratedColumn('uuid')
	id!: string;

	@Column('uuid')
	participantId!: string;

	@Column('uuid')
	tagId!: string;

	@ManyToOne(() => Participant, { onDelete: 'CASCADE' })
	@JoinColumn({ name: 'participantId' })
	participant!: Participant;

	@ManyToOne(() => Tag, { onDelete: 'CASCADE' })
	@JoinColumn({ name: 'tagId' })
	tag!: Tag;

	@CreateDateColumn({ type: 'datetime' })
	assignedAt!: Date;
}
