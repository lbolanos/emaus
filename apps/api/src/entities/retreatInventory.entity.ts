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
import { InventoryCategory } from './inventoryCategory.entity';
import { InventoryTeam } from './inventoryTeam.entity';
import { RetreatShirtType } from './retreatShirtType.entity';

@Entity()
export class RetreatInventory {
	@PrimaryGeneratedColumn('uuid')
	id!: string;

	@Column({ type: 'uuid' })
	retreatId!: string;

	@ManyToOne(() => Retreat, (retreat) => retreat.id, { onDelete: 'CASCADE' })
	@JoinColumn({ name: 'retreatId' })
	retreat!: Retreat;

	@Column({ type: 'uuid', nullable: true })
	inventoryItemId?: string | null;

	@ManyToOne(() => InventoryItem, (item) => item.retreatInventories, { onDelete: 'SET NULL' })
	@JoinColumn({ name: 'inventoryItemId' })
	inventoryItem?: InventoryItem | null;

	@Column('decimal', { precision: 10, scale: 2, default: 0 })
	requiredQuantity!: number;

	@Column('decimal', { precision: 10, scale: 2, default: 0 })
	currentQuantity!: number;

	@Column('boolean', { default: false })
	isSufficient!: boolean;

	@Column('text', { nullable: true })
	notes?: string;

	@Column('varchar', { nullable: true })
	boxLabel?: string;

	@Column('varchar', { default: 'pending' })
	status!: 'pending' | 'packed' | 'onsite' | 'consumed' | 'returned';

	// Ad-hoc items: cuando inventoryItemId es null, estos campos
	// describen el item directamente en el retiro sin pasar por catálogo.
	@Column('varchar', { nullable: true })
	customName?: string;

	@Column('varchar', { nullable: true })
	customUnit?: string;

	@Column({ type: 'uuid', nullable: true })
	customCategoryId?: string | null;

	@ManyToOne(() => InventoryCategory, { onDelete: 'SET NULL' })
	@JoinColumn({ name: 'customCategoryId' })
	customCategory?: InventoryCategory | null;

	@Column({ type: 'varchar', nullable: true })
	customTeamId?: string | null;

	@ManyToOne(() => InventoryTeam, { onDelete: 'SET NULL' })
	@JoinColumn({ name: 'customTeamId' })
	customTeam?: InventoryTeam | null;

	// Items vinculados a un tipo de playera del retiro.
	@Column({ type: 'uuid', nullable: true })
	retreatShirtTypeId?: string | null;

	@ManyToOne(() => RetreatShirtType, { onDelete: 'CASCADE' })
	@JoinColumn({ name: 'retreatShirtTypeId' })
	retreatShirtType?: RetreatShirtType | null;

	@Column('varchar', { nullable: true })
	shirtSize?: string;

	// ── Overrides por retiro ─────────────────────────────────────────────
	// Permiten ajustar el comportamiento global del catálogo para un retiro
	// específico sin modificar el ítem global.

	/** Ratio alternativo para este retiro. Sobreescribe inventory_item.ratio. */
	@Column('decimal', { precision: 10, scale: 2, nullable: true })
	ratioOverride?: number | null;

	/** Cantidad fija para este retiro. Sobreescribe el cálculo por ratio.
	 *  A diferencia de requiredQuantity, NO se borra al Recalcular. */
	@Column('decimal', { precision: 10, scale: 2, nullable: true })
	requiredQtyOverride?: number | null;

	/** Si true, el ítem no aparece en el inventario de este retiro.
	 *  Útil cuando la casa ya provee el artículo. */
	@Column('boolean', { default: false })
	isExcluded!: boolean;

	@CreateDateColumn()
	createdAt!: Date;

	@UpdateDateColumn()
	updatedAt!: Date;
}
