import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, OneToMany, JoinColumn } from 'typeorm';
import { House } from './house.entity';
import { Participant } from './participant.entity';
import { TableMesa } from './tableMesa.entity';
import { RetreatBed } from './retreatBed.entity';
import { Responsability } from './responsability.entity';
import { RetreatInventory } from './retreatInventory.entity';
import { UserRetreat } from './userRetreat.entity';
import { User } from './user.entity';
import { Payment } from './payment.entity';

@Entity()
export class Retreat {
	@PrimaryGeneratedColumn('uuid')
	id!: string;

	@Column('varchar')
	parish!: string;

	@Column('date')
	startDate!: Date;

	@Column('date')
	endDate!: Date;

	@Column({ type: 'uuid' })
	houseId!: string;

	@ManyToOne(() => House, (house) => house.retreats, { onDelete: 'RESTRICT' })
	@JoinColumn({ name: 'houseId' })
	house!: House;

	@OneToMany(() => Participant, (participant) => participant.retreat)
	participants!: Participant[];

	@OneToMany(() => TableMesa, (table) => table.retreat)
	tablesMesa!: TableMesa[];

	@OneToMany(() => RetreatBed, (bed) => bed.retreat)
	beds!: RetreatBed[];

	@Column({ type: 'text', nullable: true })
	openingNotes?: string;

	@Column({ type: 'text', nullable: true })
	closingNotes?: string;

	@Column({ type: 'varchar', nullable: true })
	retreat_type?: string;

	@Column({ type: 'varchar', nullable: true })
	retreat_number_version?: string;

	@Column({ type: 'text', nullable: true })
	thingsToBringNotes?: string;

	@Column({ type: 'text', nullable: true })
	contactPhones?: string;

	@Column({ type: 'varchar', nullable: true })
	cost?: string;

	@Column({ type: 'text', nullable: true })
	paymentInfo?: string;

	@Column({ type: 'text', nullable: true })
	paymentMethods?: string;

	@Column({ type: 'int', nullable: true })
	max_walkers?: number;

	@Column({ type: 'int', nullable: true })
	max_servers?: number;

	@OneToMany(() => Responsability, (responsability) => responsability.retreat)
	responsibilities!: Responsability[];

	@OneToMany(() => RetreatInventory, (inventory) => inventory.retreat)
	inventories!: RetreatInventory[];

	@OneToMany(() => UserRetreat, (userRetreat) => userRetreat.retreat)
	userRetreats!: UserRetreat[];

	@Column({ type: 'uuid', nullable: true })
	createdBy?: string;

	@ManyToOne(() => User, (user) => user.createdRetreats, { onDelete: 'SET NULL' })
	@JoinColumn({ name: 'createdBy' })
	creator?: User;

	@Column({ type: 'boolean', default: false })
	isPublic!: boolean;

	@Column({ type: 'boolean', default: true })
	roleInvitationEnabled!: boolean;

	@Column({ type: 'time', nullable: true })
	walkerArrivalTime?: Date;

	@Column({ type: 'time', nullable: true })
	serverArrivalTimeFriday?: Date;

	@OneToMany(() => Payment, (payment) => payment.retreat)
	payments!: Payment[];
}
