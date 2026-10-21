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
import { RetreatParticipant } from './retreatParticipant.entity';

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

	// Foto de los participantes de la mesa para el recuerdo (spec
	// table-memory-photo). `photoUrl` = URL de S3 (presignada al leer) o
	// data-URI en modo base64 de dev; `photoS3Key` = object key para borrar
	// el objeto al reemplazar o quitar la foto.
	@Column({ type: 'varchar', nullable: true })
	photoUrl?: string | null;

	@Column({ type: 'varchar', nullable: true })
	photoS3Key?: string | null;

	@OneToMany(() => RetreatParticipant, (rp) => rp.tableMesa)
	walkers!: RetreatParticipant[];
}
