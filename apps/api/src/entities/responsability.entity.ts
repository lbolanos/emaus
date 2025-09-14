import {
	Entity,
	PrimaryGeneratedColumn,
	Column,
	ManyToOne,
	JoinColumn,
	ManyToMany,
	JoinTable,
	CreateDateColumn,
	UpdateDateColumn,
} from 'typeorm';
import { Retreat } from './retreat.entity';
import { Participant } from './participant.entity';

export enum ResponsabilityType {
	LIDER = 'lider',
	COLIDER = 'colider',
	SERVIDOR = 'servidor',
	MUSICA = 'musica',
	ORACION = 'oracion',
	LIMPIEZA = 'limpieza',
	COCINA = 'cocina',
	OTRO = 'otro',
}

@Entity('retreat_responsibilities')
export class Responsability {
	@PrimaryGeneratedColumn('uuid')
	id!: string;

	@Column('varchar')
	name!: string;

	@Column('text', { nullable: true })
	description?: string;

	@Column({
		type: 'varchar',
		default: ResponsabilityType.OTRO,
	})
	responsabilityType!: string;

	@Column('boolean', { default: false })
	isLeadership!: boolean;

	@Column('integer', { default: 0 })
	priority!: number;

	@Column('boolean', { default: true })
	isActive!: boolean;

	@Column('uuid')
	retreatId!: string;

	@ManyToOne(() => Retreat, (retreat) => retreat.responsibilities, { onDelete: 'CASCADE' })
	@JoinColumn({ name: 'retreatId' })
	retreat!: Retreat;

	@ManyToOne(() => Participant, (participant) => participant.responsibilities, {
		onDelete: 'SET NULL',
	})
	@JoinColumn({ name: 'participantId' })
	participant?: Participant;

	@Column('uuid', { nullable: true })
	participantId?: string;

	@CreateDateColumn({ type: 'datetime' })
	createdAt!: Date;

	@UpdateDateColumn({ type: 'datetime' })
	updatedAt!: Date;
}
