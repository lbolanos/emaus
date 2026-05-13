import {
	Entity,
	PrimaryGeneratedColumn,
	Column,
	ManyToOne,
	JoinColumn,
	CreateDateColumn,
	Index,
} from 'typeorm';
import { RetreatInventory } from './retreatInventory.entity';
import { Retreat } from './retreat.entity';

@Entity({ name: 'retreat_inventory_history' })
@Index(['retreatId', 'createdAt'])
@Index(['retreatInventoryId', 'createdAt'])
export class RetreatInventoryHistory {
	@PrimaryGeneratedColumn('uuid')
	id!: string;

	@Column({ type: 'uuid' })
	retreatInventoryId!: string;

	@ManyToOne(() => RetreatInventory, { onDelete: 'CASCADE' })
	@JoinColumn({ name: 'retreatInventoryId' })
	retreatInventory!: RetreatInventory;

	@Column({ type: 'uuid' })
	retreatId!: string;

	@ManyToOne(() => Retreat, { onDelete: 'CASCADE' })
	@JoinColumn({ name: 'retreatId' })
	retreat!: Retreat;

	@Column({ type: 'uuid' })
	inventoryItemId!: string;

	@Column('varchar')
	field!: 'currentQuantity' | 'requiredQuantity' | 'boxLabel' | 'notes' | 'status';

	@Column('text', { nullable: true })
	oldValue?: string;

	@Column('text', { nullable: true })
	newValue?: string;

	@Column({ type: 'uuid', nullable: true })
	userId?: string;

	@CreateDateColumn()
	createdAt!: Date;
}
