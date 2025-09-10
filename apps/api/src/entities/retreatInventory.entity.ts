import {
	Entity,
	PrimaryGeneratedColumn,
	Column,
	ManyToOne,
	JoinColumn,
	CreateDateColumn,
	UpdateDateColumn,
} from 'typeorm';
import { Retreat } from './retreat.entity';
import { InventoryItem } from './inventoryItem.entity';

@Entity()
export class RetreatInventory {
	@PrimaryGeneratedColumn('uuid')
	id!: string;

	@Column({ type: 'uuid' })
	retreatId!: string;

	@ManyToOne(() => Retreat, (retreat) => retreat.id, { onDelete: 'CASCADE' })
	@JoinColumn({ name: 'retreatId' })
	retreat!: Retreat;

	@Column({ type: 'uuid' })
	inventoryItemId!: string;

	@ManyToOne(() => InventoryItem, (item) => item.retreatInventories, { onDelete: 'CASCADE' })
	@JoinColumn({ name: 'inventoryItemId' })
	inventoryItem!: InventoryItem;

	@Column('decimal', { precision: 10, scale: 2, default: 0 })
	requiredQuantity!: number;

	@Column('decimal', { precision: 10, scale: 2, default: 0 })
	currentQuantity!: number;

	@Column('boolean', { default: false })
	isSufficient!: boolean;

	@Column('text', { nullable: true })
	notes?: string;

	@CreateDateColumn()
	createdAt!: Date;

	@UpdateDateColumn()
	updatedAt!: Date;
}
