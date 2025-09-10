import {
	Entity,
	PrimaryGeneratedColumn,
	Column,
	OneToMany,
	CreateDateColumn,
	UpdateDateColumn,
} from 'typeorm';
import { InventoryItem } from './inventoryItem.entity';

@Entity()
export class InventoryCategory {
	@PrimaryGeneratedColumn('uuid')
	id!: string;

	@Column('varchar')
	name!: string;

	@Column('text', { nullable: true })
	description?: string;

	@Column('boolean', { default: true })
	isActive!: boolean;

	@OneToMany(() => InventoryItem, (item) => item.category)
	items!: InventoryItem[];

	@CreateDateColumn()
	createdAt!: Date;

	@UpdateDateColumn()
	updatedAt!: Date;
}
