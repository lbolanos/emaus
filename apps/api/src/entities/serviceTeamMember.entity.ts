import {
	Entity,
	PrimaryGeneratedColumn,
	Column,
	ManyToOne,
	JoinColumn,
	CreateDateColumn,
} from 'typeorm';
import { ServiceTeam } from './serviceTeam.entity';
import { Participant } from './participant.entity';

@Entity('service_team_members')
export class ServiceTeamMember {
	@PrimaryGeneratedColumn('uuid')
	id!: string;

	@Column('uuid')
	serviceTeamId!: string;

	@ManyToOne(() => ServiceTeam, (team) => team.members, { onDelete: 'CASCADE' })
	@JoinColumn({ name: 'serviceTeamId' })
	serviceTeam!: ServiceTeam;

	@Column('uuid')
	participantId!: string;

	@ManyToOne(() => Participant, { onDelete: 'CASCADE' })
	@JoinColumn({ name: 'participantId' })
	participant!: Participant;

	@Column({ type: 'varchar', nullable: true })
	role?: string;

	@CreateDateColumn()
	createdAt!: Date;
}
