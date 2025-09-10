import {
	Entity,
	PrimaryColumn,
	Column,
	CreateDateColumn,
	UpdateDateColumn,
	BeforeInsert,
	BeforeUpdate,
} from 'typeorm';
import * as bcrypt from 'bcrypt';

@Entity('users')
export class User {
	@PrimaryColumn('uuid')
	id!: string;

	@Column({ type: 'varchar', unique: true, nullable: true })
	googleId?: string | null;

	@Column({ type: 'varchar', unique: true })
	email!: string;

	@Column({ type: 'varchar' })
	displayName!: string;

	@Column({ type: 'varchar', nullable: true })
	photo?: string;

	@Column({ type: 'varchar', nullable: true })
	password?: string | null;

	@CreateDateColumn()
	createdAt!: Date;

	@UpdateDateColumn()
	updatedAt!: Date;

	@BeforeInsert()
	@BeforeUpdate()
	async hashPassword() {
		if (this.password) {
			this.password = await bcrypt.hash(this.password, 10);
		}
	}
}
