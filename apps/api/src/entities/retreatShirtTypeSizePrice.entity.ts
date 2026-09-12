import {
	Entity,
	PrimaryGeneratedColumn,
	Column,
	ManyToOne,
	JoinColumn,
	Index,
	Unique,
} from 'typeorm';
import { RetreatShirtType } from './retreatShirtType.entity';

/**
 * Per-size price override for a shirt type. A row exists only for sizes that
 * cost something different than the type's base price; effective price is
 * COALESCE(override, type.price, 0). The charge stays computed — changing a
 * price here recalculates every participant's balance.
 */
@Entity('retreat_shirt_type_size_price')
@Index('IDX_rstsp_shirtType', ['shirtTypeId'])
@Unique('UQ_rstsp_shirtType_size', ['shirtTypeId', 'size'])
export class RetreatShirtTypeSizePrice {
	@PrimaryGeneratedColumn('uuid')
	id!: string;

	@Column('uuid')
	shirtTypeId!: string;

	@ManyToOne(() => RetreatShirtType, { onDelete: 'CASCADE' })
	@JoinColumn({ name: 'shirtTypeId' })
	shirtType!: RetreatShirtType;

	@Column('varchar')
	size!: string;

	/** Override amount; always > 0 (entries without a real price are dropped). */
	@Column('decimal', { precision: 10, scale: 2 })
	price!: number;
}
