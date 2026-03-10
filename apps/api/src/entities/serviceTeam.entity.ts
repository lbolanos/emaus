import {
	Entity,
	PrimaryGeneratedColumn,
	Column,
	ManyToOne,
	OneToMany,
	JoinColumn,
	CreateDateColumn,
	UpdateDateColumn,
} from 'typeorm';
import { Retreat } from './retreat.entity';
import { Participant } from './participant.entity';
import { ServiceTeamMember } from './serviceTeamMember.entity';

@Entity('service_teams')
export class ServiceTeam {
	@PrimaryGeneratedColumn('uuid')
	id!: string;

	@Column('varchar')
	name!: string;

	@Column('varchar')
	teamType!: string;

	@Column({ type: 'text', nullable: true })
	description?: string;

	@Column({ type: 'text', nullable: true })
	instructions?: string;

	@Column('uuid')
	retreatId!: string;

	@ManyToOne(() => Retreat, { onDelete: 'CASCADE' })
	@JoinColumn({ name: 'retreatId' })
	retreat!: Retreat;

	@Column({ type: 'uuid', nullable: true })
	leaderId?: string;

	@ManyToOne(() => Participant, { nullable: true, onDelete: 'SET NULL' })
	@JoinColumn({ name: 'leaderId' })
	leader?: Participant;

	@OneToMany(() => ServiceTeamMember, (member) => member.serviceTeam, { cascade: true })
	members!: ServiceTeamMember[];

	@Column({ type: 'integer', default: 0 })
	priority!: number;

	@Column({ type: 'boolean', default: true })
	isActive!: boolean;

	@CreateDateColumn()
	createdAt!: Date;

	@UpdateDateColumn()
	updatedAt!: Date;
}
