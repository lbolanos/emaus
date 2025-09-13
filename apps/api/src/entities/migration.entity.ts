import { Entity, PrimaryGeneratedColumn, Column, Unique, Index } from 'typeorm';

@Entity('migrations')
@Unique(['name', 'timestamp'])
@Index(['timestamp'])
export class Migration {
	@PrimaryGeneratedColumn()
	id!: number;

	@Column({ name: 'name', type: 'varchar', length: 255 })
	name!: string;

	@Column({ name: 'timestamp', type: 'varchar', length: 14 })
	timestamp!: string;

	@Column({ name: 'executed_at', type: 'datetime' })
	executedAt!: Date;

	@Column({ name: 'execution_time', type: 'integer' })
	executionTime!: number;
}
