import {
	Entity,
	PrimaryGeneratedColumn,
	Column,
	ManyToOne,
	JoinColumn,
	CreateDateColumn,
} from 'typeorm';
import { Participant } from './participant.entity';
import { Retreat } from './retreat.entity';
import { Community } from './community.entity';
import { MessageTemplate } from './messageTemplate.entity';
import { User } from './user.entity';

export type MessageType = 'whatsapp' | 'email';

@Entity('participant_communications')
export class ParticipantCommunication {
	@PrimaryGeneratedColumn('uuid')
	id!: string;

	@Column({ type: 'uuid' })
	participantId!: string;

	@ManyToOne(() => Participant, { onDelete: 'CASCADE' })
	@JoinColumn({ name: 'participantId' })
	participant!: Participant;

	@Column({
		type: 'varchar',
		enum: ['retreat', 'community'],
	})
	scope!: 'retreat' | 'community';

	@Column({ type: 'uuid', nullable: true })
	retreatId?: string;

	@ManyToOne(() => Retreat, { onDelete: 'CASCADE' })
	@JoinColumn({ name: 'retreatId' })
	retreat?: Retreat;

	@Column({ type: 'uuid', nullable: true })
	communityId?: string;

	@ManyToOne(() => Community, { onDelete: 'CASCADE' })
	@JoinColumn({ name: 'communityId' })
	community?: Community;

	@Column({
		type: 'varchar',
		length: 20,
	})
	messageType!: 'whatsapp' | 'email';

	@Column({ type: 'varchar', length: 255 })
	recipientContact!: string;

	@Column({ type: 'text' })
	messageContent!: string;

	@Column({ type: 'uuid', nullable: true })
	templateId!: string;

	@ManyToOne(() => MessageTemplate, { onDelete: 'SET NULL' })
	@JoinColumn({ name: 'templateId' })
	template!: MessageTemplate;

	@Column({ type: 'varchar', length: 255, nullable: true })
	templateName!: string;

	@Column({ type: 'varchar', length: 500, nullable: true })
	subject!: string;

	@CreateDateColumn({ type: 'datetime' })
	sentAt!: Date;

	@Column({ type: 'uuid', nullable: true })
	sentBy!: string;

	@ManyToOne(() => User, { onDelete: 'SET NULL' })
	@JoinColumn({ name: 'sentBy' })
	sender!: User;
}
