import { Entity, PrimaryGeneratedColumn, Column, ManyToOne } from 'typeorm';
import { House } from './house.entity';

export enum BedType {
	NORMAL = 'normal',
	LITERA = 'litera',
	COLCHON = 'colchon',
}

export enum BedUsage {
	CAMINANTE = 'caminante',
	SERVIDOR = 'servidor',
}

@Entity()
export class Bed {
	@PrimaryGeneratedColumn('uuid')
	id!: string;

	@Column('varchar')
	roomNumber!: string;

	@Column('varchar')
	bedNumber!: string;

	@Column({ type: 'integer', nullable: true })
	floor?: number;

	@Column({
		type: 'text',
		enum: BedType,
		default: BedType.NORMAL,
	})
	type!: BedType;

	@Column({
		type: 'text',
		enum: BedUsage,
		default: BedUsage.CAMINANTE,
	})
	defaultUsage!: BedUsage;

	@ManyToOne(() => House, (house) => house.beds, { onDelete: 'CASCADE' })
	house!: House;
}
