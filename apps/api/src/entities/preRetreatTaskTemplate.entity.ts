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
import { PreRetreatTaskTemplateSet } from './preRetreatTaskTemplateSet.entity';

/**
 * Tarea del template global de pre-retiro. Dos niveles: raíz (parentId null)
 * o sub-tarea (parentId → raíz). La profundidad máxima 2 la valida el servicio.
 */
@Entity('pre_retreat_task_template')
@Index('IDX_prt_tpl_set', ['templateSetId'])
@Index('IDX_prt_tpl_parent', ['parentId'])
export class PreRetreatTaskTemplate {
	@PrimaryGeneratedColumn('uuid')
	id!: string;

	@Column({ type: 'uuid', nullable: true })
	templateSetId?: string | null;

	@ManyToOne(() => PreRetreatTaskTemplateSet, (s) => s.items, {
		onDelete: 'CASCADE',
		nullable: true,
	})
	@JoinColumn({ name: 'templateSetId' })
	templateSet?: PreRetreatTaskTemplateSet | null;

	@Column({ type: 'uuid', nullable: true })
	parentId?: string | null;

	@ManyToOne(() => PreRetreatTaskTemplate, (t) => t.children, {
		onDelete: 'CASCADE',
		nullable: true,
	})
	@JoinColumn({ name: 'parentId' })
	parent?: PreRetreatTaskTemplate | null;

	@OneToMany(() => PreRetreatTaskTemplate, (t) => t.parent)
	children?: PreRetreatTaskTemplate[];

	@Column('varchar')
	name!: string;

	@Column('text', { nullable: true })
	description?: string | null;

	// Días antes del startDate del retiro. null en sub-tareas = hereda del padre.
	@Column({ type: 'integer', nullable: true })
	dueOffsetDays?: number | null;

	@Column({ type: 'integer', default: 0 })
	defaultOrder!: number;

	@Column('text', { nullable: true })
	supportNotes?: string | null;

	@Column('boolean', { default: true })
	isActive!: boolean;

	@CreateDateColumn()
	createdAt!: Date;

	@UpdateDateColumn()
	updatedAt!: Date;
}
