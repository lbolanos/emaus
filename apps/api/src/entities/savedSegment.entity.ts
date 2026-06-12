import {
	Entity,
	PrimaryGeneratedColumn,
	Column,
	CreateDateColumn,
	UpdateDateColumn,
	ManyToOne,
	JoinColumn,
} from 'typeorm';
import { Retreat } from './retreat.entity';
import { Community } from './community.entity';
import { User } from './user.entity';

/**
 * Criterios de filtrado guardados (shape compartido con el frontend vía
 * `@repo/types` → `SegmentFilters`). Persistido como JSON en una columna `text`
 * (`simple-json`). Se mantiene aquí una copia local del tipo para no acoplar la
 * entidad al build del paquete de tipos.
 */
export interface SegmentFilters {
	participantType?: 'walker' | 'server' | 'waiting' | 'partial_server' | null;
	tagIds?: string[];
	paymentStatus?: 'paid' | 'partial' | 'unpaid' | 'overpaid' | 'scholarship' | null;
	maritalStatus?: 'S' | 'C' | 'D' | 'V' | 'O' | null;
	attendanceFilter?: 'all' | 'pending' | 'confirmed' | 'declined';
	cancelStatus?: 'active' | 'canceled';
	search?: string;
	memberStates?: string[];
}

/**
 * Un "segmento" guardado: una combinación de filtros con nombre, reutilizable
 * para enviar mensajes (cola WhatsApp / bulk email) o como audiencia de una
 * secuencia. Ligado a un retiro o a una comunidad (nunca ambos).
 */
@Entity('saved_segments')
export class SavedSegment {
	@PrimaryGeneratedColumn('uuid')
	id!: string;

	@Column({ type: 'varchar', length: 150 })
	name!: string;

	@Column({ type: 'varchar', length: 20 })
	scope!: 'retreat' | 'community';

	@Column({ type: 'uuid', nullable: true })
	retreatId?: string | null;

	@ManyToOne(() => Retreat, { onDelete: 'CASCADE' })
	@JoinColumn({ name: 'retreatId' })
	retreat?: Retreat;

	@Column({ type: 'uuid', nullable: true })
	communityId?: string | null;

	@ManyToOne(() => Community, { onDelete: 'CASCADE' })
	@JoinColumn({ name: 'communityId' })
	community?: Community;

	@Column({ type: 'simple-json' })
	filters!: SegmentFilters;

	@Column({ type: 'uuid', nullable: true })
	createdBy?: string | null;

	@ManyToOne(() => User, { onDelete: 'SET NULL' })
	@JoinColumn({ name: 'createdBy' })
	creator?: User;

	@CreateDateColumn({ type: 'datetime' })
	createdAt!: Date;

	@UpdateDateColumn({ type: 'datetime' })
	updatedAt!: Date;
}
