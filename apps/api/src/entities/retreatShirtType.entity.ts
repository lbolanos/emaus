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
import { RetreatShirtTypeSizePrice } from './retreatShirtTypeSizePrice.entity';

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

	/**
	 * Precio de esta prenda para el servidor que la pide. NULL/0 = sin cargo:
	 * hasta que el coordinador fija precios, ningún saldo cambia. El cargo se
	 * computa desde participant_shirt_size (nunca una deuda manual), así que
	 * cambiar la talla recalcula el saldo solo.
	 */
	@Column('decimal', { precision: 10, scale: 2, nullable: true })
	price?: number | null;

	@OneToMany(() => ParticipantShirtSize, (s) => s.shirtType)
	sizes?: ParticipantShirtSize[];

	/**
	 * Per-size price overrides: rows only for sizes that differ from the base
	 * price. A size's effective charge is COALESCE(override, price, 0).
	 */
	@OneToMany(() => RetreatShirtTypeSizePrice, (sp) => sp.shirtType)
	sizePrices?: RetreatShirtTypeSizePrice[];

	@CreateDateColumn()
	createdAt!: Date;

	@UpdateDateColumn()
	updatedAt!: Date;
}
