import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, OneToMany, JoinColumn } from 'typeorm';
import { House } from './house.entity';
import { Participant } from './participant.entity';
import { TableMesa } from './tableMesa.entity';
import { RetreatBed } from './retreatBed.entity';
import { Charge } from './charge.entity';
import { RetreatInventory } from './retreatInventory.entity';

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

	@Column({ type: 'text', nullable: true })
	thingsToBringNotes?: string;

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

	@OneToMany(() => Charge, (charge) => charge.retreat)
	charges!: Charge[];

	@OneToMany(() => RetreatInventory, (inventory) => inventory.retreat)
	inventories!: RetreatInventory[];
}
