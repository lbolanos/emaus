import {
	Entity,
	PrimaryGeneratedColumn,
	Column,
	ManyToOne,
	OneToMany,
	JoinColumn,
	CreateDateColumn,
	UpdateDateColumn,
	Index,
} from 'typeorm';
import { Retreat } from './retreat.entity';
import { RetreatPreparationDocument } from './retreatPreparationDocument.entity';

export type RetreatPreparationType = 'session' | 'break';

/**
 * Entrada del calendario de preparaciones semanales previas al retiro.
 * - type 'session': una preparación (semana N) con documentos adjuntos.
 * - type 'break': fecha saltada por festivo — solo informativa en el calendario.
 * `date` es date-only (YYYY-MM-DD) y `time` HH:MM en hora local del retiro
 * (nunca Date: bug TZ conocido con columnas 'date').
 */
@Entity('retreat_preparation')
@Index('IDX_retreat_preparation_retreat_date', ['retreatId', 'date'])
export class RetreatPreparation {
	@PrimaryGeneratedColumn('uuid')
	id!: string;

	@Column({ type: 'uuid' })
	retreatId!: string;

	@ManyToOne(() => Retreat, { onDelete: 'CASCADE' })
	@JoinColumn({ name: 'retreatId' })
	retreat?: Retreat;

	@Column('varchar', { default: 'session' })
	type!: RetreatPreparationType;

	@Column({ type: 'integer', nullable: true })
	weekNumber?: number | null;

	@Column('varchar')
	title!: string;

	@Column('text', { nullable: true })
	description?: string | null;

	@Column({ type: 'date', nullable: true })
	date?: string | null;

	@Column('varchar', { length: 5, nullable: true })
	time?: string | null;

	@Column({ type: 'integer', default: 0 })
	sortOrder!: number;

	@OneToMany(() => RetreatPreparationDocument, (d) => d.preparation)
	documents?: RetreatPreparationDocument[];

	@CreateDateColumn()
	createdAt!: Date;

	@UpdateDateColumn()
	updatedAt!: Date;
}
