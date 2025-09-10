import {
	Entity,
	PrimaryGeneratedColumn,
	Column,
	ManyToOne,
	OneToMany,
	JoinColumn,
	OneToOne,
} from 'typeorm';
import { Retreat } from './retreat.entity';
import { Participant } from './participant.entity';

@Entity('tables')
export class TableMesa {
	@PrimaryGeneratedColumn('uuid')
	id!: string;

	@Column('varchar')
	name!: string;

	@Column('uuid')
	retreatId!: string;

	@ManyToOne(() => Retreat, (retreat) => retreat.tablesMesa, { onDelete: 'CASCADE' })
	@JoinColumn({ name: 'retreatId' })
	retreat!: Retreat;

	@OneToOne(() => Participant, { nullable: true, onDelete: 'SET NULL' })
	@JoinColumn({ name: 'liderId' })
	lider?: Participant;

	@Column({ type: 'uuid', nullable: true })
	liderId?: string;

	@OneToOne(() => Participant, { nullable: true, onDelete: 'SET NULL' })
	@JoinColumn({ name: 'colider1Id' })
	colider1?: Participant;

	@Column({ type: 'uuid', nullable: true })
	colider1Id?: string;

	@OneToOne(() => Participant, { nullable: true, onDelete: 'SET NULL' })
	@JoinColumn({ name: 'colider2Id' })
	colider2?: Participant;

	@Column({ type: 'uuid', nullable: true })
	colider2Id?: string;

	@OneToMany(() => Participant, (participant) => participant.tableMesa)
	walkers!: Participant[];
}
