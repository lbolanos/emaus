import {
	Entity,
	PrimaryGeneratedColumn,
	Column,
	CreateDateColumn,
	UpdateDateColumn,
	OneToMany,
	ManyToOne,
	JoinColumn,
} from 'typeorm';
import { ParticipantTag } from './participantTag.entity';
import { Retreat } from './retreat.entity';

@Entity('tags')
export class Tag {
	@PrimaryGeneratedColumn('uuid')
	id!: string;

	@Column({ type: 'varchar', length: 100 })
	name!: string;

	@Column({ type: 'varchar', length: 50, nullable: true })
	color?: string; // Optional color for UI display (hex format)

	@Column({ type: 'text', nullable: true })
	description?: string;

	@Column({ type: 'uuid' })
	retreatId!: string;

	@ManyToOne(() => Retreat, (retreat) => retreat.tags, { onDelete: 'CASCADE' })
	@JoinColumn({ name: 'retreatId' })
	retreat!: Retreat;

	@CreateDateColumn({ type: 'datetime' })
	createdAt!: Date;

	@UpdateDateColumn({ type: 'datetime' })
	updatedAt!: Date;

	@OneToMany(() => ParticipantTag, (participantTag) => participantTag.tag)
	participantTags!: ParticipantTag[];
}
