import {
	Entity,
	PrimaryGeneratedColumn,
	Column,
	ManyToOne,
	OneToMany,
	JoinColumn,
	Index,
	CreateDateColumn,
	UpdateDateColumn,
} from 'typeorm';
import { Retreat } from './retreat.entity';
import { ParticipantShirtSize } from './participantShirtSize.entity';

@Entity('retreat_shirt_type')
@Index('IDX_retreat_shirt_type_retreat', ['retreatId'])
export class RetreatShirtType {
	@PrimaryGeneratedColumn('uuid')
	id!: string;

	@Column('uuid')
	retreatId!: string;

	@ManyToOne(() => Retreat, { onDelete: 'CASCADE' })
	@JoinColumn({ name: 'retreatId' })
	retreat!: Retreat;

	@Column('varchar')
	name!: string;

	@Column('varchar', { nullable: true })
	color?: string | null;

	@Column('boolean', { default: false })
	requiredForWalkers!: boolean;

	@Column('boolean', { default: true })
	optionalForServers!: boolean;

	@Column('integer', { default: 0 })
	sortOrder!: number;

	@Column('simple-json', { nullable: true })
	availableSizes?: string[] | null;

	@OneToMany(() => ParticipantShirtSize, (s) => s.shirtType)
	sizes?: ParticipantShirtSize[];

	@CreateDateColumn()
	createdAt!: Date;

	@UpdateDateColumn()
	updatedAt!: Date;
}
