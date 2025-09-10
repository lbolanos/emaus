import {
	Entity,
	PrimaryGeneratedColumn,
	Column,
	ManyToOne,
	OneToMany,
	JoinColumn,
	CreateDateColumn,
	UpdateDateColumn,
} from 'typeorm';
import { InventoryCategory } from './inventoryCategory.entity';
import { InventoryTeam } from './inventoryTeam.entity';
import { RetreatInventory } from './retreatInventory.entity';

@Entity()
export class InventoryItem {
	@PrimaryGeneratedColumn('uuid')
	id!: string;

	@Column('varchar')
	name!: string;

	@Column('text', { nullable: true })
	description?: string;

	@Column({ type: 'uuid' })
	categoryId!: string;

	@ManyToOne(() => InventoryCategory, (category) => category.items, { onDelete: 'RESTRICT' })
	@JoinColumn({ name: 'categoryId' })
	category!: InventoryCategory;

	@Column({ type: 'uuid' })
	teamId!: string;

	@ManyToOne(() => InventoryTeam, (team) => team.items, { onDelete: 'RESTRICT' })
	@JoinColumn({ name: 'teamId' })
	team!: InventoryTeam;

	@Column('decimal', { precision: 5, scale: 2, default: 1.0 })
	ratio!: number;

	@Column('decimal', { precision: 10, scale: 2, nullable: true })
	requiredQuantity?: number;

	@Column('varchar')
	unit!: string;

	@Column('boolean', { default: true })
	isActive!: boolean;

	@OneToMany(() => RetreatInventory, (retreatInventory) => retreatInventory.inventoryItem)
	retreatInventories!: RetreatInventory[];

	@CreateDateColumn()
	createdAt!: Date;

	@UpdateDateColumn()
	updatedAt!: Date;
}
