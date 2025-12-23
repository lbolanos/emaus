import {
	Entity,
	PrimaryGeneratedColumn,
	Column,
	CreateDateColumn,
	UpdateDateColumn,
	OneToMany,
} from 'typeorm';
import { ParticipantTag } from './participantTag.entity';

@Entity('tags')
export class Tag {
	@PrimaryGeneratedColumn('uuid')
	id!: string;

	@Column({ type: 'varchar', length: 100, unique: true })
	name!: string;

	@Column({ type: 'varchar', length: 50, nullable: true })
	color?: string; // Optional color for UI display (hex format)

	@Column({ type: 'text', nullable: true })
	description?: string;

	@CreateDateColumn({ type: 'datetime' })
	createdAt!: Date;

	@UpdateDateColumn({ type: 'datetime' })
	updatedAt!: Date;

	@OneToMany(() => ParticipantTag, (participantTag) => participantTag.tag)
	participantTags!: ParticipantTag[];
}
