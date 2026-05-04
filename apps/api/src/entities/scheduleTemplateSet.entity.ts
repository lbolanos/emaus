import {
	Entity,
	PrimaryGeneratedColumn,
	Column,
	OneToMany,
	CreateDateColumn,
	UpdateDateColumn,
} from 'typeorm';
import { ScheduleTemplate } from './scheduleTemplate.entity';

@Entity('schedule_template_set')
export class ScheduleTemplateSet {
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

	@OneToMany(() => ScheduleTemplate, (t) => t.templateSet)
	items?: ScheduleTemplate[];

	@CreateDateColumn()
	createdAt!: Date;

	@UpdateDateColumn()
	updatedAt!: Date;
}
