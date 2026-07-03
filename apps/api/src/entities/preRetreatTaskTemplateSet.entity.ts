import {
	Entity,
	PrimaryGeneratedColumn,
	Column,
	OneToMany,
	CreateDateColumn,
	UpdateDateColumn,
} from 'typeorm';
import { PreRetreatTaskTemplate } from './preRetreatTaskTemplate.entity';

@Entity('pre_retreat_task_template_set')
export class PreRetreatTaskTemplateSet {
	@PrimaryGeneratedColumn('uuid')
	id!: string;

	@Column('varchar')
	name!: string;

	@Column('text', { nullable: true })
	description?: string | null;

	@Column('varchar', { nullable: true })
	sourceTag?: string | null;

	@Column('boolean', { default: true })
	isActive!: boolean;

	@Column('boolean', { default: false })
	isDefault!: boolean;

	@OneToMany(() => PreRetreatTaskTemplate, (t) => t.templateSet)
	items?: PreRetreatTaskTemplate[];

	@CreateDateColumn()
	createdAt!: Date;

	@UpdateDateColumn()
	updatedAt!: Date;
}
